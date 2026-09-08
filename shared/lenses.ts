// Lens definitions shared by the worker (scoring) and the frontend (colours, legend).
// A lens is a small set of GDELT GKG themes chosen because the topic is spatial by nature.
// Theme names verified against GDELT's LOOKUP-GKGTHEMES.TXT on 2026-09-07.

export type LensId = 'conflict' | 'disaster' | 'unrest' | 'displacement';

export interface Lens {
  id: LensId;
  label: string;
  color: string;                 // hex, readable on the base navy
  themes: readonly string[];     // exact theme names
  prefixes: readonly string[];   // theme-name prefixes (e.g. NATURAL_DISASTER_)
}

export const BASE_NAVY = '#081228';

export const LENSES: readonly Lens[] = [
  {
    id: 'conflict', label: 'Conflict', color: '#E5484D',
    themes: ['ARMEDCONFLICT', 'MILITARY', 'TERROR', 'CEASEFIRE', 'BLOCKADE', 'SEIGE', 'REBELLION',
             'REBELS', 'INSURGENCY', 'EXTREMISM', 'WB_2433_CONFLICT_AND_VIOLENCE'],
    prefixes: [],
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
  {
    id: 'displacement', label: 'Displacement', color: '#3DBFB0',
    themes: ['REFUGEES', 'DISPLACED', 'EVACUATION', 'SELF_IDENTIFIED_HUMANITARIAN_CRISIS'],
    prefixes: [],
  },
];

/** Minimum theme occurrences for a lens to be assigned to an article. */
export const MIN_LENS_SCORE = 2;

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

/** Per-lens score in LENSES order: number of theme occurrences that fall in the lens. */
export function scoreLenses(themes: Iterable<string>): number[] {
  const scores = new Array<number>(LENSES.length).fill(0);
  for (const t of themes) {
    LENSES.forEach((lens, i) => {
      if (lens.themes.includes(t) || lens.prefixes.some(p => t.startsWith(p))) scores[i]++;
    });
  }
  return scores;
}

/** Dominant lens index (highest score ≥ MIN_LENS_SCORE, ties by lens order) or -1. */
export function dominantLens(scores: number[]): number {
  let best = -1, bestScore = MIN_LENS_SCORE - 1;
  scores.forEach((s, i) => { if (s > bestScore) { best = i; bestScore = s; } });
  return best;
}
