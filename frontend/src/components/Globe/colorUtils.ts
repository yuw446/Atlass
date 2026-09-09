import { lab, rgb } from 'd3-color';

/** Lightens any CSS colour by `amount` (0..1) in LAB space. Used for hover and selection. */
export function lightenHex(color: string, amount: number): string {
  const c = lab(color);
  if (!c) return color;
  c.l = Math.min(100, c.l + amount * 60);
  return rgb(c).formatHex();
}

/** Any CSS colour as an `rgba()` string with the given alpha, so the Earth texture shows through polygon caps. */
export function withAlpha(color: string, alpha: number): string {
  const c = rgb(color);
  if (!c) return color;
  c.opacity = alpha;
  return c.formatRgb();
}
