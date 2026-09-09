// Pure colour helpers for the globe renderer. No React, so they are testable.
import { color, lab, rgb } from 'd3-color';

/** Lightens any CSS colour by `amount` (0..1) in LAB space, keeping its alpha. Used for hover and selection. */
export function lighten(input: string, amount: number): string {
  const parsed = color(input);
  if (!parsed) return input;
  const c = lab(parsed);
  c.l = Math.min(100, c.l + amount * 60);
  return rgb(c).formatRgb();
}

/** Any CSS colour as an `rgba()` string with the given alpha, so the Earth texture shows through polygon caps. */
export function withAlpha(input: string, alpha: number): string {
  const parsed = color(input);
  if (!parsed) return input;
  const c = rgb(parsed);
  c.opacity = alpha;
  return c.formatRgb();
}
