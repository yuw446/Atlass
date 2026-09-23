// Lens definitions shared by the worker (scoring) and the frontend (colours, legend).
// A lens is a small set of GDELT GKG themes chosen because the topic is spatial by nature.
// Theme names verified against GDELT's LOOKUP-GKGTHEMES.TXT on 2026-09-07.
// Displacement (REFUGEES, DISPLACED, EVACUATION, SELF_IDENTIFIED_HUMANITARIAN_CRISIS) was dropped on 2026-09-11: eight
// lensed stories across six batches is too few to score, label or learn from. Lens indices are positional in the
// snapshot, so a lens is only ever removed from the end; the worker migrates stored state on load.

export type LensId = 'conflict' | 'disaster' | 'unrest';

export interface Lens {
  id: LensId;
  label: string;
  color: string;                 // hex, readable on the base navy
  themes: readonly string[];     // exact theme names
  prefixes: readonly string[];   // theme-name prefixes (e.g. NATURAL_DISASTER_)
  support?: readonly string[];   // count only when a theme from `themes`/`prefixes` is also present
  veto?: readonly string[];      // one occurrence removes the lens from the article
}

export const BASE_NAVY = '#081228';

export const LENSES: readonly Lens[] = [
  {
    id: 'conflict', label: 'Conflict', color: '#E5484D',
    themes: ['ARMEDCONFLICT', 'MILITARY', 'TERROR', 'CEASEFIRE', 'BLOCKADE', 'SEIGE', 'REBELLION',
             'REBELS', 'INSURGENCY', 'EXTREMISM'],
    prefixes: [],
    // WB_2433 is GDELT's broad "conflict and violence" classifier: it fires on crime, comics and figurative fighting
    // and was the only conflict theme on 158 of the 725 lensed articles it appeared in (six batches, 2026-09-09).
    // It confirms a conflict story; it never makes one. ARMEDCONFLICT reads "trade war" as war: 83 lensed articles
    // carried ECON_TRADE_DISPUTE and none was about armed conflict. Trade is out of scope by design.
    support: ['WB_2433_CONFLICT_AND_VIOLENCE'],
    veto: ['ECON_TRADE_DISPUTE'],
  },
  {
    id: 'disaster', label: 'Disaster & climate', color: '#F0A340',
    // MANMADE_DISASTER is exact on purpose: MANMADE_DISASTER_IMPLIED matched 65% of a batch.
    themes: ['ENV_CLIMATECHANGE', 'UNGP_CLIMATE_CHANGE_ACTION', 'MANMADE_DISASTER'],
    prefixes: ['NATURAL_DISASTER_'],
  },
  {
    id: 'unrest', label: 'Unrest', color: '#B06CE0',
    themes: ['PROTEST', 'STRIKE'],
    prefixes: [],
  },
];

/** Prefix matches that fire on unrelated words: ICE the US agency, ice cream, the ICE exchange, "icy", "chill". */
const NOISE = new Set(['NATURAL_DISASTER_ICE', 'NATURAL_DISASTER_ICY', 'NATURAL_DISASTER_CHILL']);

/** Minimum theme occurrences for a lens to be assigned to an article. */
export const MIN_LENS_SCORE = 2;
/** Minimum occurrences per word of article text: one mention per 200 words. Below that the topic is an aside. */
export const MIN_LENS_DENSITY = 1 / 200;

/** GKG V2Themes is "THEME,offset;THEME,offset;…". Returns one entry per occurrence. */
export function parseThemes(v2themes: string): string[] {
  if (!v2themes) return [];
  const out: string[] = [];
  for (const part of v2themes.split(';')) {
    const name = part.split(',', 1)[0];
    if (name) out.push(name);
  }
  return out;
}

/** Index of the lens a theme counts for, as a core or a support theme; -1 for none. NOISE themes count nowhere. */
export function lensOf(t: string): number {
  if (NOISE.has(t)) return -1;
  return LENSES.findIndex(l => l.themes.includes(t) || l.support?.includes(t) || l.prefixes.some(p => t.startsWith(p)));
}

/** Per-lens score in LENSES order: core occurrences plus at most as many support occurrences, 0 when vetoed or without a core theme. */
export function scoreLenses(themes: Iterable<string>): number[] {
  const core = new Array<number>(LENSES.length).fill(0), support = core.slice();
  const vetoed = new Array<boolean>(LENSES.length).fill(false);
  for (const t of themes) {
    const v = LENSES.findIndex(l => l.veto?.includes(t));
    if (v >= 0) { vetoed[v] = true; continue; }
    const i = lensOf(t);
    if (i < 0) continue;
    if (LENSES[i].support?.includes(t)) support[i]++; else core[i]++;
  }
  return core.map((c, i) => (c > 0 && !vetoed[i] ? c + Math.min(support[i], c) : 0));
}

// ---------- theme mix: is the lens the article's subject, or an aside? ----------
// Measured 2026-09-23 on 1,689 double-labelled stories (docs/precision-check.md): three rules over the article's whole
// theme mix, fitted on three days and scored on three others it never saw: 28.8% → 39.8% precision at 90.5% recall.

/** Generic GKG subject families that compete with a lens for the article. Theme names, never news names. */
const CIVIC = {
  politics: /^(TAX_FNCACT_(CANDIDATES?|POLITICIANS?|SUPPORTERS?|LAWMAKERS?|VOTERS?)|DEMOCRACY|IDEOLOGY|LEGISLATION|EPU_POLICY_CONGRESSIONAL|TAX_POLITICAL_PARTY_.*)$/,
  courts: /^(TRIAL|TAX_FNCACT_(ATTORNEYS?|JUDGES?|PROSECUTORS?|LAWYERS?|DEFENDANTS?)|WB_2453_ORGANIZED_CRIME|WB_2456_DRUGS_AND_NARCOTICS|DRUG_TRADE|CRIME_.*|WB_328_FINANCIAL_INTEGRITY|CORRUPTION|WB_2082_LAW_ENFORCEMENT|EPU_POLICY_LAW)$/,
  economy: /^(EPU_CATS_TAXES|EPU_POLICY_TAX|ECON_TAXATION|WB_713_PUBLIC_FINANCE|WB_1045_TREASURY|WB_2670_JOBS|WB_695_POVERTY|ECON_INFLATION|WB_442_INFLATION|ECON_STOCKMARKET|ECON_WORLDCURRENCIES_.*|ECON_INTEREST_RATES|ECON_HOUSING_PRICES|ECON_COST_OF_LIVING|TAX_FNCACT_(CEOS?|EXECUTIVES?|EMPLOYEES?|TRADERS?|INVESTORS?))$/,
  rights: /^(WB_2203_HUMAN_RIGHTS|WB_2507_HUMAN_RIGHTS_ABUSES_AND_VIOLATIONS|WB_2509_GENOCIDE|SELF_IDENTIFIED_HUMAN_RIGHTS|WB_962_INTERNATIONAL_LAW|DISCRIMINATION)$/,
  markets: /^(TAX_ECON_PRICE|FUELPRICES|ECON_[A-Z]*PRICES?|ECON_HEATINGOIL|ECON_BITCOIN)$/,
  society: /^(SCIENCE|RELIGION|TOURISM|UNGP_HEALTHCARE|TAX_FNCACT_STUDENTS?|IMMIGRATION|EDUCATION|WB_470_EDUCATION)$/,
};
/** Families that compete per lens. Climate coverage is about science, schools and tourism by nature, so `society`
 *  does not compete with disaster; rallies are politics by nature, so nothing competes with unrest. */
const COMPETES: readonly (readonly (keyof typeof CIVIC)[])[] = [
  ['politics', 'courts', 'economy', 'markets', 'rights', 'society'],
  ['politics', 'courts', 'economy', 'markets', 'rights'],
  [],
];
/** Fighting reported: casualties, drones, troops, a truce or a blockade. */
const FIGHTING = /^(KILL|CRISISLEX_T03_DEAD|WOUND|CRISISLEX_T02_INJURED|DRONES|TAX_FNCACT_TROOPS|CEASEFIRE|BLOCKADE)$/;
/** Armed movements GDELT also files as parties: their mentions are the war, not politics. GDELT's TAX_TERROR_GROUP_
 *  twin cannot decide this; it also tags the BJP, the BNP and a German communist party. */
const ARMED_PARTY = /^TAX_POLITICAL_PARTY_(HAMAS|HEZBOLLAH)$/;
/** A labour dispute: workers, unions, wages, labour standards, bargaining. */
const LABOUR = /^(TAX_FNCACT_WORKERS?|ECON_UNIONS|WB_\d+_(TRADE_UNIONS|LABOR_.*|WAGES|WORKING_CONDITIONS)|UNSAFE_WORK_ENVIRONMENT|NEGOTIATIONS)$/;
/** A competing subject counts when mentioned at least this share of the lens score plus reported fighting. */
export const CROWD_RATIO = 0.5;

export type Crowded = 'civic' | 'nofight' | 'strike';
/**
 * Why the article's own theme mix says its lens is an aside, or undefined when the lens is the subject.
 * - nofight (conflict): no fighting reported, and the war is not named (no ARMEDCONFLICT) or the armed forces are
 *   (MILITARY: exercises, procurement, postings). TERROR, EXTREMISM, REBELLION alone are rhetoric and crime.
 * - strike (unrest): every unrest mention is the word "strike" (PROTEST co-fires with STRIKE) and nothing marks a
 *   labour dispute: lightning strikes, strike-outs, a band's single.
 * - civic (conflict, disaster): one competing subject family is mentioned at least CROWD_RATIO as often as the lens and
 *   its fighting (at least once): the speech, trial, budget or market story that cites a war or a storm.
 *   An armed movement filed as a party (ARMED_PARTY: Hamas, Hezbollah) is not politics. Price themes co-fire
 *   on one phrase ("oil prices" is TAX_ECON_PRICE, FUELPRICES and ECON_OILPRICE at once), so markets counts its
 *   most-mentioned theme, not the sum: a war report with an oil-price paragraph stays.
 * ponytail: generic theme families at one ratio; the ceiling is war diplomacy and preparedness stories, whose themes
 * match live events. A headline judge is the upgrade (docs/precision-check.md).
 */
export function crowdedOut(lens: number, themes: Iterable<string>, score: number): Crowded | undefined {
  const T = new Map<string, number>();
  for (const t of themes) T.set(t, (T.get(t) ?? 0) + 1);
  let fighting = 0;
  for (const [t, c] of T) if (FIGHTING.test(t)) fighting += c;
  if (lens === 0 && !fighting && (!T.has('ARMEDCONFLICT') || T.has('MILITARY'))) return 'nofight';
  if (lens === 2 && T.has('STRIKE') && (T.get('PROTEST') ?? 0) <= T.get('STRIKE')! && ![...T.keys()].some(t => LABOUR.test(t))) return 'strike';
  let best = 0;
  for (const f of COMPETES[lens] ?? []) {
    let s = 0;
    for (const [t, c] of T) {
      if (!CIVIC[f].test(t) || ARMED_PARTY.test(t)) continue;
      s = f === 'markets' ? Math.max(s, c) : s + c;
    }
    best = Math.max(best, s);
  }
  return COMPETES[lens]?.length && best >= Math.max(1, CROWD_RATIO * (score + fighting)) ? 'civic' : undefined;
}

/**
 * Dominant lens index (ties by lens order) or -1. A lens needs MIN_LENS_SCORE occurrences and, when the article's
 * word count is known, MIN_LENS_DENSITY of them per word: two mentions carry a 300-word brief, not a 2,000-word feature.
 */
export function dominantLens(scores: number[], words = 0): number {
  let best = -1, bestScore = MIN_LENS_SCORE - 1;
  scores.forEach((s, i) => { if (s > bestScore && s >= words * MIN_LENS_DENSITY) { best = i; bestScore = s; } });
  return best;
}
