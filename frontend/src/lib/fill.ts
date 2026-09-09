// Country fill colour: the dominant lens colour, mixed toward the base navy by how unusual the attention is.
import { interpolateLab } from 'd3-interpolate';
import { LENSES, BASE_NAVY } from '../../../shared/lenses.ts';
import type { CountrySnap } from '../../../shared/snapshot.ts';

const toLens = LENSES.map(l => interpolateLab(BASE_NAVY, l.color));

/**
 * No lensed stories in the window → base navy. With a lens filter, countries with nothing under that lens drop to
 * navy and the rest take that lens's colour. Brightness always comes from the country's total attention `att`.
 */
export function fillFor(c: CountrySnap | undefined, lensFilter: number | null): string {
  if (!c || c.n === 0) return BASE_NAVY;
  let lens = c.dom;
  if (lensFilter !== null) {
    if ((c.lens[lensFilter] ?? 0) === 0) return BASE_NAVY;
    lens = lensFilter;
  }
  if (lens < 0 || lens >= toLens.length) return BASE_NAVY;
  const t = 0.25 + 0.75 * Math.min(1, Math.max(0, c.att));
  return toLens[lens](t);
}
