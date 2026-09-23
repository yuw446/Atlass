// The contract between the worker (writes data/latest.json) and the frontend (reads it).
// One type, one runtime guard, used by both sides so a rename is a compile error, not a blank globe.

export const SNAPSHOT_SCHEMA = 1;

export interface Story {
  t: string;        // headline (raw; the panel trims site suffixes for display)
  u: string;        // article URL, http(s) only
  d: string;        // source domain
  i?: string;       // og:image URL, https only
  l: number;        // dominant lens index into Snapshot.lenses
  s?: number;       // lens score (theme occurrences); top[] is ordered by it
  lat?: number;     // spark coordinate, absent when the feed had none
  lon?: number;
  at: string;       // batch time of the story, ISO 8601 UTC
}

export interface CountrySnap {
  n: number;          // lensed stories in the window
  lens: number[];     // stories by dominant lens over the window; sums to n
  dom: number;        // dominant lens index, -1 when n = 0
  att: number;        // 0..1 attention vs this country's own baseline
  z: number;          // raw z-score behind att
  tone: number | null;
  top: Story[];       // up to 10 distinct stories from the window, newest first
}

export interface Snapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  tick: string;           // GDELT batch time, ISO 8601 UTC
  generated_at: string;   // when the worker ran
  source: string;
  totals: { articles: number; placed: number; lensed: number; capped: number; unmapped: number; dropped_urls: number; dupes: number };
  window: number;         // batches aggregated per country
  lenses: string[];       // lens ids, in order
  countries: Record<string, CountrySnap>;
  sparks: Array<[number, number, number]>;   // [lat, lon, lensIdx], the last hour's batches (as are totals)
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

export function isSnapshot(x: unknown): x is Snapshot {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (s.schema !== SNAPSHOT_SCHEMA) return false;
  if (!isStr(s.tick) || !isStr(s.generated_at) || !isNum(s.window)) return false;
  if (!Array.isArray(s.lenses) || !s.lenses.every(isStr)) return false;
  const totals = s.totals as Record<string, unknown> | undefined;
  if (!totals || !['articles', 'placed', 'lensed'].every(k => isNum(totals[k]))) return false;
  if (!s.countries || typeof s.countries !== 'object') return false;
  const nLens = (s.lenses as string[]).length;
  for (const c of Object.values(s.countries as Record<string, unknown>)) {
    const cs = c as Record<string, unknown>;
    if (!isNum(cs.n) || !Array.isArray(cs.lens) || cs.lens.length !== nLens || !isNum(cs.dom) || !isNum(cs.att) || !isNum(cs.z)) return false;
    if (!Array.isArray(cs.top)) return false;
    for (const st of cs.top as Array<Record<string, unknown>>) {
      if (!isStr(st.t) || !isStr(st.u) || !isStr(st.d) || !isNum(st.l) || !isStr(st.at)) return false;
    }
  }
  if (!Array.isArray(s.sparks)) return false;
  for (const sp of s.sparks as unknown[]) {
    if (!Array.isArray(sp) || sp.length !== 3 || !sp.every(isNum)) return false;
  }
  return true;
}
