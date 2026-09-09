// Headline helpers shared by the worker (dedupe) and the panel (display). No dependencies.

/** Strip one trailing " | Site" or " - Site" segment, only when at least 20 characters remain. */
export function trimTitle(t: string): string {
  const m = /^(.*\S)\s+[|\-–—]\s+[^|\-–—]{1,60}$/.exec(t);
  return m && m[1].length >= 20 ? m[1] : t;
}

const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'as', 'by',
  'with', 'from', 'its', 'it', 'this', 'that', 'after', 'over', 'amid', 'into', 'than', 'has', 'have', 'had', 'will', 'says', 'say', 'said']);

/**
 * Content words of a headline: site tag off, lower-case, "U.S." joined, possessives and plurals folded, stop words out.
 * Any script: a headline written without spaces (CJK) becomes one token, so it can only match itself exactly.
 */
export function titleTokens(t: string): Set<string> {
  const body = trimTitle(t).replace(/^[^|]{1,40}\s\|\s/, '').toLowerCase()
    .replace(/[’‘]/g, "'").replace(/'s\b/g, '').replace(/\b([a-z])\.([a-z])\./g, '$1$2');
  const out = new Set<string>();
  for (const w of body.split(/[^\p{L}\p{N}]+/u)) {
    if (!w || STOP.has(w) || (w.length === 1 && !/\p{N}/u.test(w))) continue;
    out.add(w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
  }
  return out;
}

/** Below this many content words two headlines must match exactly; overlap on two or three words means nothing. */
export const MIN_STORY_TOKENS = 4;
/** Share of the shorter headline's words that must appear in the longer one. Measured on 2026-09-09 live data: 0.8 merges
 *  edited wire copies ("…near volcano" / "…near Anak Krakatau volcano") and leaves two outlets' own stories apart. */
export const STORY_OVERLAP = 0.8;
/** Share of the longer headline's words the shorter one must cover, so a four-word headline is not swallowed by an
 *  unrelated long one that happens to contain its words. */
export const STORY_OVERLAP_LONG = 0.5;

/** True when two headlines are the same story: a syndicated copy, a site-tagged repeat, an edited wire headline. */
export function sameStory(a: Set<string>, b: Set<string>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (!small.size) return false;
  let n = 0; for (const w of small) if (big.has(w)) n++;
  if (small.size < MIN_STORY_TOKENS) return small.size === big.size && n === small.size;
  return n >= STORY_OVERLAP * small.size && n >= STORY_OVERLAP_LONG * big.size;
}
