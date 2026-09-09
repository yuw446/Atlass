// Small pure text helpers for the header and the panel.

/** Attention phrased from the z-score, thresholds fixed by the design. */
export function attentionWords(z: number): string {
  if (z >= 2) return 'far above usual';
  if (z >= 1) return 'above usual';
  if (z > -1) return 'usual';
  return 'quiet';
}

/** Strip one trailing " | Site" or " - Site" segment, only when at least 20 characters remain. Display only. */
export function trimTitle(t: string): string {
  const m = /^(.*\S)\s+[|\-–—]\s+[^|\-–—]{1,60}$/.exec(t);
  return m && m[1].length >= 20 ? m[1] : t;
}

/** "14:45 UTC" from an ISO timestamp; empty string when unparseable. */
export function tickClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** "just now", "9 min ago", "3 h ago" */
export function agePhrase(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 90) return `${Math.round(minutes)} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

export const formatInt = (n: number) => n.toLocaleString('en-US');
