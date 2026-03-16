import { lab, rgb } from 'd3-color';
import { interpolateLab } from 'd3-interpolate';

// Three-stop palette in LAB color space for perceptually uniform interpolation.
// LAB interpolation avoids the muddy brown that RGB produces between blue and red.
const COLOR_VOLATILE = '#7A1515'; // deep crimson  — score 0
const COLOR_NEUTRAL  = '#8B6914'; // amber/ochre   — score 50
const COLOR_STABLE   = '#1B4F8A'; // cool steel blue — score 100

// Pre-build the two interpolators at module load time
const interpolateLow  = interpolateLab(COLOR_VOLATILE, COLOR_NEUTRAL); // 0→50
const interpolateHigh = interpolateLab(COLOR_NEUTRAL, COLOR_STABLE);   // 50→100

/**
 * Maps a stability score (0–100) to a hex color string.
 * Uses two-segment LAB interpolation: volatile→neutral→stable
 */
export function stabilityToHex(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const t = clamped / 100;

  let color: string;
  if (t <= 0.5) {
    color = interpolateLow(t / 0.5);
  } else {
    color = interpolateHigh((t - 0.5) / 0.5);
  }
  return color;
}

/**
 * Lightens a hex color by a given amount (0–1) in LAB space.
 * Used for hover and selected states.
 */
export function lightenHex(hex: string, amount: number): string {
  const c = lab(hex);
  if (!c) return hex;
  c.l = Math.min(100, c.l + amount * 60);
  const r = rgb(c);
  return r.formatHex();
}

/**
 * Returns an RGBA string for polygon fill with given opacity.
 */
export function stabilityToRgba(score: number, alpha = 0.85): string {
  const hex = stabilityToHex(score);
  const c = rgb(hex);
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${alpha})`;
}

/** Arc type → color mapping */
export const ARC_COLORS = {
  trade:     '#0D9E8A', // teal
  conflict:  '#C0392B', // red
  diplomacy: '#D4821A', // amber-orange
} as const;

/** Unrest level → polygon altitude */
export const UNREST_ALTITUDE: Record<0 | 1 | 2 | 3, number> = {
  0: 0.005,
  1: 0.008,
  2: 0.015,
  3: 0.025,
};

import type { ConflictStatus } from '../../types';

// Status-based fill colors — used instead of the old binary FILL_CONFLICT/FILL_PEACEFUL
export const STATUS_FILLS: Record<ConflictStatus, string> = {
  active_conflict:    'rgba(110,  12,  12, 0.88)',   // deep crimson
  military_operation: 'rgba(140,  55,  10, 0.87)',   // dark burnt-orange
  impacted:           'rgba(110,  70,   8, 0.86)',   // dark amber
  civil_unrest:       'rgba( 80,  20,  70, 0.86)',   // dark plum
  ceasefire:          'rgba( 25,  45,  75, 0.87)',   // steel blue-grey
  peaceful:           'rgba(  8,  18,  40, 0.85)',   // dark navy
};

export const STATUS_HOVER_FILLS: Record<ConflictStatus, string> = {
  active_conflict:    'rgba(180,  30,  30, 0.92)',
  military_operation: 'rgba(200,  80,  20, 0.92)',
  impacted:           'rgba(180, 110,  15, 0.92)',
  civil_unrest:       'rgba(130,  35, 120, 0.92)',
  ceasefire:          'rgba( 35,  65, 110, 0.92)',
  peaceful:           'rgba( 20,  40,  80, 0.92)',
};

export const STATUS_SELECTED_FILLS: Record<ConflictStatus, string> = {
  active_conflict:    'rgba(220,  50,  50, 0.95)',
  military_operation: 'rgba(230, 110,  30, 0.95)',
  impacted:           'rgba(220, 150,  20, 0.95)',
  civil_unrest:       'rgba(170,  50, 160, 0.95)',
  ceasefire:          'rgba( 45,  85, 140, 0.95)',
  peaceful:           'rgba( 30,  60, 120, 0.95)',
};

// Keep legacy constants as aliases so any leftover imports still compile
export const FILL_CONFLICT          = STATUS_FILLS.active_conflict;
export const FILL_PEACEFUL          = STATUS_FILLS.peaceful;
export const FILL_HOVER_CONFLICT    = STATUS_HOVER_FILLS.active_conflict;
export const FILL_HOVER_PEACEFUL    = STATUS_HOVER_FILLS.peaceful;
export const FILL_SELECTED_CONFLICT = STATUS_SELECTED_FILLS.active_conflict;
export const FILL_SELECTED_PEACEFUL = STATUS_SELECTED_FILLS.peaceful;
