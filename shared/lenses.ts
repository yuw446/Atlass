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

/**
 * Dominant lens index (ties by lens order) or -1. A lens needs MIN_LENS_SCORE occurrences and, when the article's
 * word count is known, MIN_LENS_DENSITY of them per word: two mentions carry a 300-word brief, not a 2,000-word feature.
 */
export function dominantLens(scores: number[], words = 0): number {
  let best = -1, bestScore = MIN_LENS_SCORE - 1;
  scores.forEach((s, i) => { if (s > bestScore && s >= words * MIN_LENS_DENSITY) { best = i; bestScore = s; } });
  return best;
}
