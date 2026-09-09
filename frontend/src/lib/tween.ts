// Pure colour-tween math. The hook in useTween.ts drives it at 30 fps; this file has no React so it is testable.
import { interpolateLab } from 'd3-interpolate';

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Colours for every key in `to` at progress t (0..1). Keys missing from `from` start at their target. */
export function mixAt(from: Map<string, string>, to: Map<string, string>, t: number): Map<string, string> {
  const e = easeInOut(Math.min(1, Math.max(0, t)));
  const out = new Map<string, string>();
  for (const [k, target] of to) {
    const start = from.get(k);
    out.set(k, !start || start === target || e >= 1 ? target : interpolateLab(start, target)(e));
  }
  return out;
}
