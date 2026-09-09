// Country fill colour: the dominant lens colour, mixed toward the base navy by how unusual the attention is.
import { interpolateLab } from 'd3-interpolate';
import { LENSES, BASE_NAVY } from '../../../shared/lenses.ts';
import type { CountrySnap } from '../../../shared/snapshot.ts';

const toLens = LENSES.map(l => interpolateLab(BASE_NAVY, l.color));

/** Cap alpha over the Earth texture: an unlit country is a light navy tint; a lensed one covers more as attention rises. */
export const UNLIT_ALPHA = 0.35;
const LENSED_ALPHA_MIN = 0.45, LENSED_ALPHA_SPAN = 0.3;

/** Which lens colours a country and how far toward it (0..1) the fill sits from navy; null when it stays navy. */
function mixFor(c: CountrySnap | undefined, lensFilter: number | null): { lens: number; t: number } | null {
  if (!c || c.n === 0) return null;
  let lens = c.dom;
  if (lensFilter !== null) {
    if ((c.lens[lensFilter] ?? 0) === 0) return null;
    lens = lensFilter;
  }
  if (lens < 0 || lens >= toLens.length) return null;
  return { lens, t: 0.25 + 0.75 * Math.min(1, Math.max(0, c.att)) };
}

/**
 * No lensed stories in the window → base navy. With a lens filter, countries with nothing under that lens drop to
 * navy and the rest take that lens's colour. Brightness always comes from the country's total attention `att`.
 */
export function fillFor(c: CountrySnap | undefined, lensFilter: number | null): string {
  const m = mixFor(c, lensFilter);
  return m ? toLens[m.lens](m.t) : BASE_NAVY;
}

/** Alpha for the same cap: `UNLIT_ALPHA` for navy, rising with attention for a lensed country so it reads over land. */
export function fillAlphaFor(c: CountrySnap | undefined, lensFilter: number | null): number {
  const m = mixFor(c, lensFilter);
  return m ? LENSED_ALPHA_MIN + LENSED_ALPHA_SPAN * m.t : UNLIT_ALPHA;
}
