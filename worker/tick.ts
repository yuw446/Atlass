// worker/tick.ts — one GDELT GKG batch in, three files out. No dependencies. Run by GitHub Actions every 15 min.
//
// lastupdate.txt ──► slots to process (last_batch+15m … latest, cap MAX_SLOTS; empty state → latest only)
//       │
//       ▼  per slot
//   fetch zip ──404 non-latest──► record in state.skipped, next slot
//       │ ok                    ──404 latest / 5xx / timeout──► exit 1 (retry next cron)
//       ▼
//   inflateRaw (local header) ──► rows (27 cols; malformed dropped + counted)
//       ▼
//   publish gate: ≥99% well-formed, ≥200 rows, ≥50% placed ──fail──► state.skipped, next slot
//       ▼
//   articleFrom: title · url/image validation · place vote (FIPS→ISO first) · coord (type 2/3/4/5 > 1)
//                · non-news sections dropped · lenses (≥2 occurrences, ≥1 per 200 words; see shared/lenses.ts) · tone
//       ▼
//   dedupe: URL (in-batch set + cross-batch ring(RING)) · headline (token overlap in batch, normalised key in ring)
//       ──► domain cap among lensed
//       ▼
//   per-country window(WINDOW batches): lens counts + story ring(TOP)  ──► n, lens[], dom, tone, top[]
//       ▼
//   baselines: seed on first run; ticks++ ; a = max(1/672, 1/ticks); fast/base/var (x = log1p(n), 0 when absent) ; z ; att
//       ▼
//   data/hours/YYYY-MM-DD.json bucket ; data/latest.json (isSnapshot-checked) ; data/state.json
//
// The workflow does the git part: amend + force-push of the gh-pages branch (one commit, always).

import { inflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LENSES, parseThemes, scoreLenses, dominantLens } from '../shared/lenses.ts';
import { titleTokens, sameStory } from '../shared/title.ts';
import { fipsToIso, POLYGON_CODES } from '../shared/codes.ts';
import { isSnapshot, SNAPSHOT_SCHEMA, type Snapshot, type Story, type CountrySnap } from '../shared/snapshot.ts';

export const GDELT = 'https://data.gdeltproject.org/gdeltv2/';
export const WINDOW = 8;        // batches per country window (two hours)
export const RING = 8;          // batches of URL and normalised-headline hashes kept for cross-batch dedupe
export const TOP = 10;          // distinct stories kept per country
export const MAX_SLOTS = 32;    // slots processed per run: eight hours of catch-up, because GitHub's scheduler drops runs for hours at a time
export const DOMAIN_CAP = 5;    // lensed articles per source domain per batch
export const SPARK_CAP = 3000;
export const SLOW = 672;        // one-week EMA
export const FAST = 8;          // two-hour EMA
export const PRIOR_TICKS = 96;  // pseudo-observations behind the seeded baseline (one day); see seedBaselines()
export const COL = { DATE: 1, SOURCE: 3, URL: 4, THEMES: 8, LOCS: 10, TONE: 15, IMAGE: 18, EXTRAS: 26 } as const;
const NCOLS = 27;

// ---------- state ----------
export interface Baseline { fast: number; base: number; var: number; ticks: number }
export interface WinEntry { at: string; lens: number[]; tsum: number; tn: number }
export interface CountryState { win: WinEntry[]; stories: Story[]; bl: Baseline }
export interface State { last_batch: string | null; skipped: string[]; pending?: string[]; ring: string[][]; countries: Record<string, CountryState> }
export const emptyState = (): State => ({ last_batch: null, skipped: [], pending: [], ring: [], countries: {} });
/** A non-latest slot that 404s is retried on later runs until it is this old; only then is it recorded as skipped. */
export const SLOT_GRACE_MS = 2 * 60 * 60_000;
export const MAX_PENDING = 32;

export interface Totals { articles: number; placed: number; lensed: number; capped: number; unmapped: number; dropped_urls: number; dupes: number; malformed: number }
export const zeroTotals = (): Totals => ({ articles: 0, placed: 0, lensed: 0, capped: 0, unmapped: 0, dropped_urls: 0, dupes: 0, malformed: 0 });

// ---------- batch ids ----------
export function batchToIso(id: string): string {
  return `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(8, 10)}:${id.slice(10, 12)}:${id.slice(12, 14)}Z`;
}
export function isoToBatch(iso: string): string { return iso.replace(/[-:TZ]/g, '').slice(0, 14); }
function addMinutes(id: string, m: number): string { return isoToBatch(new Date(Date.parse(batchToIso(id)) + m * 60_000).toISOString()); }

/** Slots to process this run. GDELT skips slots, so a walk must never depend on every slot existing. */
export function slotsToProcess(lastBatch: string | null, latest: string): { slots: string[]; jumped?: string } {
  if (!lastBatch || lastBatch >= latest) return { slots: lastBatch === latest ? [] : [latest] };
  const all: string[] = [];
  for (let id = addMinutes(lastBatch, 15); id <= latest; id = addMinutes(id, 15)) all.push(id);
  if (all.length <= MAX_SLOTS) return { slots: all };
  // Far behind (a long outage): take the newest MAX_SLOTS and record the gap once, rather than crawling for days.
  const kept = all.slice(-MAX_SLOTS);
  return { slots: kept, jumped: `${all[0]}..${all[all.length - MAX_SLOTS - 1]}` };
}

// ---------- zip ----------
/** GDELT zips hold one deflate entry. Local file header: sig(4) ver(2) flags(2) method(2) time(2) date(2) crc(4) csize(4) usize(4) nlen(2) xlen(2). */
export function unzipSingle(buf: Buffer): Buffer {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip local file header');
  const method = buf.readUInt16LE(8), nlen = buf.readUInt16LE(26), xlen = buf.readUInt16LE(28);
  const data = buf.subarray(30 + nlen + xlen);
  if (method === 8) return inflateRawSync(data);
  if (method === 0) return data.subarray(0, buf.readUInt32LE(22));
  throw new Error(`unsupported zip method ${method}`);
}

// ---------- rows ----------
export function parseRows(text: string): { rows: string[][]; malformed: number } {
  const rows: string[][] = []; let malformed = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length === NCOLS) rows.push(cols); else malformed++;
  }
  return { rows, malformed };
}

// ---------- articles ----------
export interface Article { url: string; host: string; title: string; iso: string; lat?: number; lon?: number; lens: number; score: number; tone: number | null; image?: string; at: string }
export type Reject = 'no_title' | 'bad_url' | 'no_place' | 'section' | 'unlensed';

/**
 * Publisher sections, slugs and headline words that mark entertainment, not news about a place. A film about the 1381
 * Peasants' Revolt scores as a rebellion; the section or the word "review" is the only signal that it is a film.
 * Measured over six batches on 2026-09-09 (docs/precision-check.md): 354 placed articles matched, none about its lens.
 * "-review-" mid-slug is deliberately not matched: a guard fitted to one day's slugs dropped a live flood story
 * ("rates-review-consultation-extended") for two film reviews caught. Reviews of a work are caught at the slug end,
 * at the segment start, and by the headline; the rest is the ceiling.
 * ponytail: a fixed list; the ceiling is outlets whose URL has no section and whose headline has none of these words.
 */
export const NON_NEWS_PATH = /\/(entertainment|culture|movies?|films?|reviews?|tv|music|celebrity|celebs|showbiz|sports?|travel|food|recipes?|lifestyle|arts|books|gaming|games|fashion|style|horoscopes?|puzzles?)\/|-review(?:\/|$)|\/review-|(?:official|new|first|final|full|teaser|movie|film)-trailer|-trailer(?:\/|$)|trailer-(?:release|drop|reveal|debut|breakdown)|teaser|rotten-tomatoes|box-office|season-\d{1,2}\b/i;
/** Why an article is not news about a place, or undefined when it is. One predicate for the worker and scripts/clean-state.ts. */
export function nonNewsReason(pathname: string, title: string): 'path' | 'title' | undefined {
  return NON_NEWS_PATH.test(pathname) ? 'path' : NON_NEWS_TITLE.test(title) ? 'title' : undefined;
}
export const NON_NEWS_TITLE = /\b(?:official|new|first|final|full|teaser|movie|film|show|series|season \d{1,2}) trailer\b|\btrailer(?: drops?\b| released?\b| reveals?\b| debuts?\b| teases?\b| for\b|:)|\b(?:teaser|movies?|film(?! (?:shows|footage))|box office|rotten tomatoes|season \d{1,2}(?!\d)|album|netflix|hulu|prime video|premiere)\b|^(?:book |film |movie |tv |album )?review:/i;

/** PAGE_TITLE from the Extras XML: entity-decoded, whitespace collapsed, control characters out, at most 300 characters. */
export function pageTitle(cols: string[]): string {
  const m = /<PAGE_TITLE>([^<]*)<\/PAGE_TITLE>/.exec(cols[COL.EXTRAS] ?? '');
  return m?.[1] ? decodeEntities(m[1]).replace(/\s+/g, ' ').replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim().slice(0, 300) : '';
}

/** PAGE_TITLE arrives HTML-escaped ("&#xBB;", "&amp;"). Decode numeric and the five named entities; nothing else. */
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m; }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function validUrl(u: string, httpsOnly = false): string | undefined {
  if (!u || u.length > 2048) return undefined;
  try { const p = new URL(u); if (p.protocol === 'https:' || (!httpsOnly && p.protocol === 'http:')) return p.href; } catch { /* invalid */ }
  return undefined;
}

interface Loc { type: number; name: string; fips: string; iso?: string; lat: number; lon: number; off: number }
function parseLocs(v2: string): Loc[] {
  const locs: Loc[] = [];
  if (!v2) return locs;
  for (const e of v2.split(';')) {
    const f = e.split('#'); if (f.length < 9 || !f[2]) continue;
    locs.push({ type: Number(f[0]), name: f[1], fips: f[2], iso: fipsToIso(f[2]), lat: Number(f[5]), lon: Number(f[6]), off: Number(f[8]) });
  }
  return locs;
}
/** Feed countries with no polygon (Singapore, Hong Kong, …) are sparks only; they are keyed "~FIPS" and never enter state. */
export const isSparkOnly = (iso: string) => iso.startsWith('~');

/** Primary country = most-mentioned mapped ISO (ties: smallest offset). Coordinate = most-mentioned sub-country place there. */
export function primaryPlace(locs: Loc[]): { iso: string; lat?: number; lon?: number } | undefined {
  const count = new Map<string, { n: number; off: number }>();
  for (const l of locs) {
    if (!l.iso) continue;
    const c = count.get(l.iso) ?? { n: 0, off: Infinity };
    count.set(l.iso, { n: c.n + 1, off: Math.min(c.off, l.off) });
  }
  let iso: string | undefined, best = { n: 0, off: Infinity };
  for (const [k, v] of count) if (v.n > best.n || (v.n === best.n && v.off < best.off)) { iso = k; best = v; }
  if (!iso) return undefined;
  const fin = (l: Loc) => Number.isFinite(l.lat) && Number.isFinite(l.lon) && !(l.lat === 0 && l.lon === 0);
  const mine = locs.filter(l => l.iso === iso && fin(l));
  const sub = mine.filter(l => l.type >= 2);
  const pool = sub.length ? sub : mine;
  const byName = new Map<string, { n: number; off: number; l: Loc }>();
  for (const l of pool) { const c = byName.get(l.name) ?? { n: 0, off: Infinity, l }; byName.set(l.name, { n: c.n + 1, off: Math.min(c.off, l.off), l: c.off <= l.off ? c.l : l }); }
  let pick: Loc | undefined, pb = { n: 0, off: Infinity };
  for (const v of byName.values()) if (v.n > pb.n || (v.n === pb.n && v.off < pb.off)) { pick = v.l; pb = v; }
  return pick ? { iso, lat: pick.lat, lon: pick.lon } : { iso };
}

export function articleFrom(cols: string[], at: string, totals: Totals): { article?: Article; reject?: Reject } {
  const title = pageTitle(cols);
  if (!title) return { reject: 'no_title' };
  const url = validUrl(cols[COL.URL]);
  if (!url) { totals.dropped_urls++; return { reject: 'bad_url' }; }
  const locs = parseLocs(cols[COL.LOCS]);
  if (!locs.length) return { reject: 'no_place' };
  const place = primaryPlace(locs) ?? primaryPlace(locs.map(l => ({ ...l, iso: `~${l.fips}` })));
  if (!place) return { reject: 'no_place' };
  if (isSparkOnly(place.iso)) totals.unmapped++;
  if (nonNewsReason(new URL(url).pathname, title)) return { reject: 'section' };
  const [toneStr, , , , , , words] = (cols[COL.TONE] ?? '').split(',');   // V1.5Tone: tone, …, word count
  const scores = scoreLenses(parseThemes(cols[COL.THEMES]));
  const lens = dominantLens(scores, Number(words) || 0);
  if (lens < 0) return { reject: 'unlensed' };
  const tone = Number.parseFloat(toneStr ?? '');
  let image = validUrl(cols[COL.IMAGE], true);
  if (cols[COL.IMAGE] && !image) totals.dropped_urls++;
  const host = (cols[COL.SOURCE] || new URL(url).hostname).toLowerCase();
  return { article: { url, host, title, iso: place.iso, lat: place.lat, lon: place.lon, lens, score: scores[lens], tone: Number.isFinite(tone) ? tone : null, image, at } };
}

// ---------- one batch ----------
const hash = (s: string) => createHash('sha1').update(s).digest('base64url').slice(0, 12);

export interface BatchResult { byCountry: Map<string, Article[]>; sparks: Array<[number, number, number]>; totals: Totals; gate?: string }

export function processBatch(rows: string[][], malformed: number, at: string, state: State): BatchResult {
  const totals = zeroTotals(); totals.malformed = malformed; totals.articles = rows.length + malformed;
  const wellFormed = rows.length / Math.max(1, totals.articles);
  const seen = new Set<string>(); const ring = new Set(state.ring.flat()); const hashes: string[] = [];
  const kept: Article[] = [];
  let placedRows = 0;
  for (const cols of rows) {
    const r = articleFrom(cols, at, totals);
    if (r.reject === 'no_place' || r.reject === 'no_title' || r.reject === 'bad_url') continue;
    placedRows++;
    if (!r.article) continue;
    const h = hash(r.article.url);
    if (seen.has(h) || ring.has(h)) { totals.dupes++; continue; }
    seen.add(h); hashes.push(h); kept.push(r.article);
  }
  totals.placed = placedRows;
  const gate = wellFormed < 0.99 ? `well-formed ${(wellFormed * 100).toFixed(1)}%` : totals.articles < 200 ? `only ${totals.articles} rows` : placedRows / Math.max(1, rows.length) < 0.5 ? `placed ${placedRows}/${rows.length}` : undefined;
  if (gate) return { byCountry: new Map(), sparks: [], totals, gate };
  // domain cap among lensed articles: keep the DOMAIN_CAP highest scores per host. The cap runs before the syndication
  // merge so a story whose first copy sits on a capped aggregator still reaches the globe through its other copies.
  const byHost = new Map<string, Article[]>();
  for (const a of kept) (byHost.get(a.host) ?? byHost.set(a.host, []).get(a.host)!).push(a);
  const capped: Article[] = [];
  for (const list of byHost.values()) {
    list.sort((a, b) => b.score - a.score);
    totals.capped += Math.max(0, list.length - DOMAIN_CAP);
    capped.push(...list.slice(0, DOMAIN_CAP));
  }
  // Syndication: one wire story runs under many URLs, site tags and light edits. Same headline words in the same
  // country → same story (templated headlines differ only by place); the strongest copy wins, then the one with a
  // picture. The ring keeps the country-keyed headline so a copy that lands two batches later is a dupe too.
  capped.sort((a, b) => b.score - a.score || Number(!!b.image) - Number(!!a.image));
  const stories: Article[] = [], tokens: Set<string>[] = [];
  const byCountry = new Map<string, Article[]>(); const sparks: BatchResult['sparks'] = [];
  for (const a of capped) {
    const tk = titleTokens(a.title);
    const th = tk.size ? hash(`${a.iso} ${[...tk].sort().join(' ')}`) : '';
    if (th && (ring.has(th) || tokens.some((k, j) => stories[j].iso === a.iso && sameStory(k, tk)))) { totals.dupes++; hashes.push(th); continue; }
    if (th) hashes.push(th);
    stories.push(a); tokens.push(tk);
    totals.lensed++;
    (byCountry.get(a.iso) ?? byCountry.set(a.iso, []).get(a.iso)!).push(a);
    if (a.lat !== undefined && a.lon !== undefined && sparks.length < SPARK_CAP) sparks.push([a.lat, a.lon, a.lens]);
  }
  state.ring.push(hashes); while (state.ring.length > RING) state.ring.shift();
  return { byCountry, sparks, totals };
}

// ---------- baselines ----------
export function updateBaseline(bl: Baseline, x: number): number {
  bl.ticks++;                                       // increment BEFORE alpha (a second batch at a = 1 would zero the variance)
  const a = Math.max(1 / SLOW, 1 / bl.ticks);
  bl.fast += (x - bl.fast) / FAST;
  bl.base += a * (x - bl.base);
  bl.var += a * ((x - bl.base) ** 2 - bl.var);
  return zOf(bl);
}
export const zOf = (bl: Baseline) => (bl.fast - bl.base) / (Math.sqrt(Math.max(0, bl.var)) + 0.15);
export const attOf = (z: number) => Math.min(4, Math.max(0, z)) / 4;

/**
 * First run: every polygon country gets a baseline so a quiet country's first big story reads as unusual.
 * base = that country's own first-batch x (0 for the quiet majority), var = 0.5, and PRIOR_TICKS pseudo-observations
 * so base moves slowly (about 1% per batch) while fast moves 12.5%: a sustained spike crosses z = 1 by its fourth batch,
 * and a country that is steady from the start stays near z = 0. (The design's ticks_seen = 8 let base chase fast and
 * never produced z > 0.4; the constant was corrected during implementation.)
 */
export function seedBaselines(state: State, counts: Map<string, number>): void {
  for (const iso of POLYGON_CODES) {
    if (state.countries[iso]) continue;
    const x = Math.log1p(counts.get(iso) ?? 0);
    state.countries[iso] = { win: [], stories: [], bl: { fast: x, base: x, var: 0.5, ticks: PRIOR_TICKS } };
  }
}

// ---------- per-country window ----------
function ensure(state: State, iso: string, x: number): CountryState {
  return state.countries[iso] ??= { win: [], stories: [], bl: { fast: x, base: x, var: 0.5, ticks: 1 } };
}

export function applyBatch(state: State, res: BatchResult, at: string): void {
  const counts = new Map<string, number>();
  for (const [iso, list] of res.byCountry) counts.set(iso, list.length);
  if (!state.last_batch) seedBaselines(state, counts);
  const touched = new Set<string>([...Object.keys(state.countries), ...counts.keys()]);
  for (const iso of touched) {
    if (isSparkOnly(iso)) continue;   // sparks were already emitted; no window, no baseline, not clickable
    const list = res.byCountry.get(iso) ?? [];
    const lens = new Array<number>(LENSES.length).fill(0);
    let tsum = 0, tn = 0;
    for (const a of list) { lens[a.lens]++; if (a.tone !== null) { tsum += a.tone; tn++; } }
    const cs = ensure(state, iso, Math.log1p(list.length));
    cs.win.push({ at, lens, tsum, tn }); while (cs.win.length > WINDOW) cs.win.shift();
    if (list.length) {
      const fresh: Story[] = list.map(a => ({ t: a.title, u: a.url, d: a.host, i: a.image, l: a.lens, s: a.score, lat: a.lat, lon: a.lon, at }));
      // Strongest lens signal first, then stories with an image, then newest; the panel shows them in this order.
      cs.stories = dedupeStories([...fresh, ...cs.stories]
        .sort((p, q) => (q.s ?? 0) - (p.s ?? 0) || Number(!!q.i) - Number(!!p.i) || q.at.localeCompare(p.at))).slice(0, TOP);
    }
    if (state.last_batch || !POLYGON_CODES.includes(iso)) updateBaseline(cs.bl, Math.log1p(list.length));
    // On the seeding batch, polygon countries were just initialised at this x; updating again would double-count it.
  }
  state.last_batch = isoToBatch(at);
}

/** Keep the first of each story, by URL and then by headline (syndicated wires repeat one story under many URLs and
 *  edited headlines). The list must already be in preference order. Shared with scripts/clean-state.ts. */
export function dedupeStories<T extends { t: string; u: string }>(list: T[]): T[] {
  const seenU = new Set<string>(), keptT: Set<string>[] = [];
  return list.filter(s => { if (seenU.has(s.u)) return false; const tk = titleTokens(s.t); if (keptT.some(k => sameStory(k, tk))) return false; seenU.add(s.u); keptT.push(tk); return true; });
}

export function snapshotFrom(state: State, at: string, res: BatchResult, source = 'gdelt-gkg-2.1-english'): Snapshot {
  const countries: Record<string, CountrySnap> = {};
  for (const [iso, cs] of Object.entries(state.countries)) {
    const lens = new Array<number>(LENSES.length).fill(0); let tsum = 0, tn = 0;
    for (const w of cs.win) { w.lens.forEach((c, i) => { lens[i] += c; }); tsum += w.tsum; tn += w.tn; }
    const n = lens.reduce((a, b) => a + b, 0);
    if (n === 0 && !POLYGON_CODES.includes(iso)) continue;   // spark-only countries with nothing in window: omit
    let dom = -1, best = 0; lens.forEach((c, i) => { if (c > best) { dom = i; best = c; } });
    const z = zOf(cs.bl);
    countries[iso] = { n, lens, dom, att: attOf(z), z: Number(z.toFixed(3)), tone: tn ? Number((tsum / tn).toFixed(2)) : null, top: cs.stories };
  }
  const { malformed: _m, ...totals } = res.totals;
  return { schema: SNAPSHOT_SCHEMA, tick: at, generated_at: new Date().toISOString(), source, totals, window: WINDOW, lenses: LENSES.map(l => l.id), countries, sparks: res.sparks };
}

// ---------- hours ----------
export interface HoursDoc { date: string; hours: Record<string, Record<string, { n: number; lens: number[]; zsum: number; k: number }>> }
export function accumulateHours(doc: HoursDoc | undefined, snap: Snapshot): HoursDoc {
  const date = snap.tick.slice(0, 10), hour = snap.tick.slice(11, 13);
  const d: HoursDoc = doc && doc.date === date ? doc : { date, hours: {} };
  const bucket = (d.hours[hour] ??= {});
  for (const [iso, c] of Object.entries(snap.countries)) {
    if (c.n === 0 && !(iso in bucket)) continue;
    const b = (bucket[iso] ??= { n: 0, lens: new Array(LENSES.length).fill(0), zsum: 0, k: 0 });
    // window counts overlap between batches; store the batch's own contribution: latest window entry
    b.k++; b.zsum += c.z;
    b.n = Math.max(b.n, c.n); b.lens = b.lens.map((v, i) => Math.max(v, c.lens[i]));
  }
  return d;
}

// ---------- io ----------
export interface Fetched { status: number; buf?: Buffer }
export type FetchFn = (url: string) => Promise<Fetched>;
export async function realFetch(url: string, ms = 30_000): Promise<Fetched> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal }); return { status: r.status, buf: r.ok ? Buffer.from(await r.arrayBuffer()) : undefined }; }
  finally { clearTimeout(t); }
}

export async function latestBatchId(fetchFn: FetchFn): Promise<string> {
  const r = await fetchFn(GDELT + 'lastupdate.txt');
  if (r.status !== 200 || !r.buf) throw new Error(`lastupdate.txt: HTTP ${r.status}`);
  const line = r.buf.toString('utf8').split('\n')[2] ?? '';
  const m = /(\d{14})\.gkg\.csv\.zip/.exec(line.split(/\s+/)[2] ?? '');
  if (!m) throw new Error(`lastupdate.txt line 3 unparseable: ${line}`);
  return m[1];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface RunOptions { latestRetries?: number; retryDelayMs?: number; now?: () => number }

export async function run(siteDir: string, fetchFn: FetchFn = realFetch, log: (s: string) => void = console.log, opts: RunOptions = {}): Promise<number> {
  const { latestRetries = 4, retryDelayMs = 30_000, now = Date.now } = opts;
  const dataDir = join(siteDir, 'data'); mkdirSync(join(dataDir, 'hours'), { recursive: true });
  const statePath = join(dataDir, 'state.json');
  const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : emptyState();
  state.pending ??= [];
  const latest = await latestBatchId(fetchFn);
  const { slots, jumped } = slotsToProcess(state.last_batch, latest);
  if (jumped) { state.skipped.push(jumped); log(`jumped over ${jumped}`); }
  // GDELT sometimes publishes a slot's GKG file long after the index has moved on (35+ min seen live), and sometimes
  // never. Missing non-latest slots go to `pending` and are retried at the start of every run until SLOT_GRACE_MS
  // old; only then are they skipped for good. A late batch is applied out of order, which the window and the hour
  // buckets tolerate (both are keyed by the batch's own time) and the baselines barely notice.
  const ageMs = (id: string) => now() - Date.parse(batchToIso(id));
  const retry = state.pending.filter(id => id !== latest && !slots.includes(id));
  state.pending = [];
  const work: string[] = [...retry, ...slots];
  if (!work.length) { log(`already at ${latest}`); writeFileSync(statePath, JSON.stringify(state)); return 0; }
  let last: { snap: Snapshot; hours: HoursDoc } | undefined;
  for (const id of work) {
    let r = await fetchFn(`${GDELT}${id}.gkg.csv.zip`);
    if (r.status === 404 && id !== latest) {
      if (ageMs(id) < SLOT_GRACE_MS) { if (state.pending.length < MAX_PENDING) state.pending.push(id); log(`${id} not published yet; will retry`); }
      else { state.skipped.push(id); log(`skip ${id}: still 404 after ${Math.round(SLOT_GRACE_MS / 60_000)} min`); }
      continue;
    }
    // GDELT writes lastupdate.txt before the (largest) GKG upload finishes; a run a few minutes past the
    // quarter hour can race it. Wait it out. If it never appears, do not advance: the next cron retries.
    for (let i = 0; r.status === 404 && i < latestRetries; i++) { log(`latest ${id} not published yet, retry ${i + 1}/${latestRetries}`); await sleep(retryDelayMs); r = await fetchFn(`${GDELT}${id}.gkg.csv.zip`); }
    if (r.status === 404) { log(`latest ${id} still missing; leaving last_batch at ${state.last_batch ?? 'none'}`); break; }
    if (r.status !== 200 || !r.buf) throw new Error(`${id}: HTTP ${r.status}`);
    const { rows, malformed } = parseRows(unzipSingle(r.buf).toString('utf8'));
    const at = batchToIso(id);
    const res = processBatch(rows, malformed, at, state);
    if (res.gate) { state.skipped.push(id); if (id > (state.last_batch ?? '')) state.last_batch = id; log(`gate ${id}: ${res.gate}`); continue; }
    const prev = state.last_batch;
    applyBatch(state, res, at);
    if (prev && id < prev) state.last_batch = prev;   // a late-arriving slot must not move the cursor backwards
    const snap = snapshotFrom(state, at, res);
    if (!isSnapshot(snap)) throw new Error('snapshot failed its own guard');
    const hp = join(dataDir, 'hours', `${at.slice(0, 10)}.json`);
    const hours = accumulateHours(existsSync(hp) ? JSON.parse(readFileSync(hp, 'utf8')) : undefined, snap);
    writeFileSync(hp, JSON.stringify(hours));
    if (!prev || id >= prev) last = { snap, hours };   // a late-arriving batch feeds the window and hours, not latest.json
    log(`${id}: ${res.totals.articles} rows, ${res.totals.placed} placed, ${res.totals.lensed} lensed, ${Object.keys(snap.countries).length} countries, ${res.sparks.length} sparks`);
  }
  if (last) writeFileSync(join(dataDir, 'latest.json'), JSON.stringify(last.snap));
  writeFileSync(statePath, JSON.stringify(state));
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('tick.ts')) {
  const i = process.argv.indexOf('--site');
  run(i > 0 ? process.argv[i + 1] : './site').then(code => process.exit(code)).catch(err => { console.error(err); process.exit(1); });
}
