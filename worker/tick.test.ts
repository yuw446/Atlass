import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  unzipSingle, parseRows, processBatch, applyBatch, snapshotFrom, accumulateHours, emptyState,
  updateBaseline, seedBaselines, zOf, attOf, slotsToProcess, batchToIso, run, isSparkOnly, decodeEntities,
  PRIOR_TICKS, WINDOW, TOP, DOMAIN_CAP, type State, type Baseline, type Fetched,
} from './tick.ts';
import { isSnapshot } from '../shared/snapshot.ts';

const ID = '20260908233000';
const AT = batchToIso(ID);
const CSV = readFileSync(new URL('./fixtures/20260908233000.gkg.csv', import.meta.url));
const ZIP = readFileSync(new URL('./fixtures/20260908233000.gkg.csv.zip', import.meta.url));
const fixture = () => parseRows(CSV.toString('utf8'));
const byTitle = <T extends { title: string }>(list: T[], t: string) => list.find(a => a.title === t);

// ---------- zip and rows ----------
test('unzipSingle inflates the fixture zip to the exact csv; bad signature throws', () => {
  assert.equal(unzipSingle(ZIP).equals(CSV), true);
  assert.throws(() => unzipSingle(Buffer.from('not a zip at all, definitely not')), /not a zip/);
});

test('parseRows keeps 27-column rows and counts the 26-column one', () => {
  const { rows, malformed } = fixture();
  assert.equal(rows.length, 217);
  assert.equal(malformed, 1);
});

test('decodeEntities handles numeric and the five named entities and leaves the rest alone', () => {
  assert.equal(decodeEntities('Scoop &#xBB; Our &#x2013; Strategy &amp; more &quot;x&quot; &#39;y&#39;'), 'Scoop » Our – Strategy & more "x" \'y\'');
  assert.equal(decodeEntities('&nbsp;kept &#xZZ; kept'), '&nbsp;kept &#xZZ; kept');
});

// ---------- one batch ----------
test('processBatch on the fixture: gate passes, edge rows behave as designed', () => {
  const state = emptyState();
  const { rows, malformed } = fixture();
  const res = processBatch(rows, malformed, AT, state);
  assert.equal(res.gate, undefined);
  assert.equal(res.totals.articles, 218);
  assert.ok(res.totals.dropped_urls >= 2, 'javascript: url and http image dropped');
  assert.ok(res.totals.dupes >= 1, 'duplicate URL within the batch');
  assert.ok(res.totals.capped >= 1, 'six from one domain -> five kept (real rows may add more)');
  assert.ok(res.totals.unmapped >= 1, 'Singapore has no polygon');

  const us = res.byCountry.get('US') ?? [];
  const hawaii = byTitle(us, 'Hawaii residents told to expect tropical storm');
  assert.ok(hawaii, 'E2 present'); assert.equal(hawaii!.lat, 21.3); assert.equal(hawaii!.lens, 1);

  const ps = res.byCountry.get('PS') ?? [];
  assert.ok(byTitle(ps, 'Strikes continue'), 'West Bank + Gaza vote together as PS');
  assert.equal(byTitle(res.byCountry.get('IL') ?? [], 'Strikes continue'), undefined);

  const sd = res.byCountry.get('SD') ?? [];
  const noCoords = byTitle(sd, 'Country only, no coords');
  assert.ok(noCoords, 'E5 counts'); assert.equal(noCoords!.lat, undefined);
  const httpImg = byTitle(sd, 'Http image');
  assert.ok(httpImg); assert.equal(httpImg!.image, undefined);
  assert.equal(byTitle(sd, 'Bad url'), undefined);
  assert.equal(byTitle(sd, 'Fixture headline'), undefined, 'E1 has no title and is skipped');

  assert.equal(byTitle(res.byCountry.get('DE') ?? [], 'Far-right party explained'), undefined, 'one NATURAL_DISASTER occurrence is not a lens');

  const ng = (res.byCountry.get('NG') ?? []).filter(a => a.host === 'capdomain.example');
  assert.equal(ng.length, DOMAIN_CAP);
  assert.ok(byTitle(ng, 'Cap 6'), 'the highest-scoring article survives the cap');

  const no = res.byCountry.get('NO') ?? [];
  assert.equal(byTitle(no, 'Norway evacuation')!.lens, 3, 'override maps FIPS NO and the lens is displacement');

  const sn = [...res.byCountry.keys()].find(isSparkOnly);
  assert.equal(sn, '~SN');
  assert.ok(res.sparks.some(([lat, lon, l]) => lat === 1.29 && lon === 103.85 && l === 2), 'Singapore is a spark');
  assert.ok(res.sparks.some(([lat, lon, l]) => lat === 21.3 && lon === -157.8 && l === 1), 'Hawaii spark at the state coordinate');
  assert.ok(res.sparks.every(s => s.every(Number.isFinite)), 'no NaN reaches the globe');
  assert.equal(state.ring.length, 1);
});

test('publish gate: malformed ratio, tiny batch, and low placement each skip the batch', () => {
  const { rows } = fixture();
  assert.match(processBatch(rows, 15, AT, emptyState()).gate ?? '', /well-formed/);
  assert.match(processBatch(rows.slice(0, 50), 0, AT, emptyState()).gate ?? '', /only 50 rows/);
  const unplaced = rows.map(r => { const c = [...r]; c[10] = ''; return c; });
  assert.match(processBatch(unplaced, 0, AT, emptyState()).gate ?? '', /placed/);
});

test('cross-batch ring: a URL from the previous batch is a dupe; the ring rotates at 8', () => {
  const state = emptyState();
  const { rows, malformed } = fixture();
  const first = processBatch(rows, malformed, AT, state);
  const again = processBatch(rows, malformed, AT, state);
  assert.equal(again.totals.lensed, 0);
  assert.equal(again.totals.dupes, first.totals.lensed + first.totals.capped + first.totals.dupes, 'every lensed article from the previous batch is a dupe, plus the in-batch duplicate again');
  for (let i = 0; i < 10; i++) processBatch(rows, malformed, AT, state);
  assert.equal(state.ring.length, 8);
});

// ---------- window and snapshot ----------
test('applyBatch + snapshotFrom: seeds every polygon country, lens sums to n, stories dedupe, window caps', () => {
  const state = emptyState();
  const { rows, malformed } = fixture();
  const res = processBatch(rows, malformed, AT, state);
  applyBatch(state, res, AT);
  assert.equal(state.last_batch, ID);
  assert.ok(state.countries.FR && state.countries.NO && state.countries.XK && state.countries.TW, 'seeded polygon countries');
  assert.equal(state.countries['~SN'], undefined, 'spark-only countries never enter state');
  const snap = snapshotFrom(state, AT, res);
  assert.equal(isSnapshot(snap), true);
  assert.equal(snap.lenses.length, 4);
  for (const c of Object.values(snap.countries)) assert.equal(c.lens.reduce((a, b) => a + b, 0), c.n);
  assert.equal(snap.countries.SD.n, 2); assert.deepEqual(snap.countries.SD.lens, [2, 0, 0, 0]); assert.equal(snap.countries.SD.dom, 0);
  assert.ok(snap.countries.SD.top.some(s => s.t === 'Country only, no coords' && s.lat === undefined));
  assert.equal(snap.countries.PS.n, 1);
  assert.equal(snap.countries.FR.n, 0); assert.equal(snap.countries.FR.dom, -1);
  assert.equal(snap.countries['~SN'], undefined);
  assert.ok(snap.sparks.length > 0);

  // ten more batches: window stays at WINDOW entries, stories at TOP, no duplicate URLs, n counts the window
  for (let i = 1; i <= 10; i++) {
    const s2 = emptyState(); s2.countries = state.countries; s2.last_batch = state.last_batch; // fresh ring so nothing dedupes
    const r2 = processBatch(rows, malformed, AT, s2);
    applyBatch(s2, r2, batchToIso(String(Number(ID) + i * 100).padStart(14, '0')));
  }
  const sd = state.countries.SD;
  assert.equal(sd.win.length, WINDOW);
  assert.ok(sd.stories.length <= TOP);
  assert.equal(new Set(sd.stories.map(s => s.u)).size, sd.stories.length);
  const snap2 = snapshotFrom(state, AT, res);
  assert.equal(snap2.countries.SD.n, 2 * WINDOW);
});

test('story ring dedupes syndicated headlines across URLs and keeps the strongest signal first', () => {
  const state = emptyState(); state.last_batch = ID;
  const mk = (title: string, url: string, score: number) => ({ url, host: 'h.example', title, iso: 'SD', lens: 0, score, tone: null, at: AT });
  const byCountry = new Map([['SD', [mk('Same wire story', 'https://a.example/1', 3), mk('Same wire story', 'https://b.example/2', 3), mk('Weaker story', 'https://c.example/3', 9)]]]);
  applyBatch(state, { byCountry, sparks: [], totals: { articles: 3, placed: 3, lensed: 3, capped: 0, unmapped: 0, dropped_urls: 0, dupes: 0, malformed: 0 } }, AT);
  const stories = state.countries.SD.stories;
  assert.deepEqual(stories.map(s => s.t), ['Weaker story', 'Same wire story']);
});

// ---------- baselines ----------
const prior = (x = 0): Baseline => ({ fast: x, base: x, var: 0.5, ticks: PRIOR_TICKS });

test('a steady country seeded at its own level stays near z = 0 through tick 96', () => {
  const x = Math.log1p(14); const bl = prior(x); let z = 0;
  for (let i = 0; i < 96; i++) z = updateBaseline(bl, x);
  assert.ok(Math.abs(z) < 0.1, `z=${z}`);
});

test('a quiet country seeded at 0 crosses z = 1 by its fourth big batch; first-sight init never does', () => {
  const x = Math.log1p(30);
  const bl = prior(0); let z = 0;
  for (let i = 0; i < 4; i++) z = updateBaseline(bl, x);
  assert.ok(z > 1, `prior: z=${z}`);
  const fs: Baseline = { fast: x, base: x, var: 0.5, ticks: 1 }; let z2 = 0;
  for (let i = 0; i < 4; i++) z2 = updateBaseline(fs, x);
  assert.ok(Math.abs(z2) < 0.1, `first-sight: z=${z2}`);
});

test('seen once then absent reports z < 1 next batch; absent 96 batches decays to att = 0', () => {
  const bl = prior(0);
  updateBaseline(bl, Math.log1p(14));
  const z = updateBaseline(bl, 0);
  assert.ok(z < 1 && z > -1, `z=${z}`);
  for (let i = 0; i < 96; i++) updateBaseline(bl, 0);
  assert.equal(attOf(zOf(bl)), 0);
});

test('ticks increments before alpha: the second batch of a fresh country does not zero the variance', () => {
  const x = Math.log1p(5);
  const bl: Baseline = { fast: x, base: x, var: 0.5, ticks: 1 };
  updateBaseline(bl, x);
  assert.ok(bl.var > 0, `var=${bl.var}`);
  assert.equal(bl.ticks, 2);
});

test('seedBaselines gives every polygon country a baseline at its own first-batch level', () => {
  const state = emptyState();
  seedBaselines(state, new Map([['US', 20]]));
  assert.equal(state.countries.US.bl.base, Math.log1p(20));
  assert.equal(state.countries.SD.bl.base, 0);
  assert.equal(state.countries.SD.bl.ticks, PRIOR_TICKS);
});

// ---------- slots ----------
test('slotsToProcess: empty state → latest only; equal → none; a gap walks; a long gap jumps', () => {
  assert.deepEqual(slotsToProcess(null, ID).slots, [ID]);
  assert.deepEqual(slotsToProcess(ID, ID).slots, []);
  assert.deepEqual(slotsToProcess('20260908224500', ID).slots, ['20260908230000', '20260908231500', ID]);
  const far = slotsToProcess('20260901000000', ID);
  assert.equal(far.slots.length, 8);
  assert.equal(far.slots[7], ID);
  assert.match(far.jumped ?? '', /^20260901001500\.\./);
});

// ---------- hours ----------
test('accumulateHours buckets by hour and accumulates across batches', () => {
  const state = emptyState();
  const { rows, malformed } = fixture();
  const res = processBatch(rows, malformed, AT, state); applyBatch(state, res, AT);
  const snap = snapshotFrom(state, AT, res);
  const h1 = accumulateHours(undefined, snap);
  const h2 = accumulateHours(h1, snap);
  assert.equal(h2.date, '2026-09-08');
  assert.equal(h2.hours['23'].SD.k, 2);
  assert.equal(h2.hours['23'].SD.n, 2);
  assert.equal(accumulateHours(h2, { ...snap, tick: '2026-09-09T00:00:00Z' }).date, '2026-09-09', 'day rollover starts a new document');
});

// ---------- run() with a stubbed fetch ----------
const stub = (map: Record<string, Fetched>) => async (url: string): Promise<Fetched> => map[url] ?? { status: 404 };
const lastupdate = (id: string) => Buffer.from(`1 x http://data.gdeltproject.org/gdeltv2/${id}.export.CSV.zip\n2 x http://.../${id}.mentions.CSV.zip\n3 x http://data.gdeltproject.org/gdeltv2/${id}.gkg.csv.zip\n`);
const G = 'https://data.gdeltproject.org/gdeltv2/';

test('run writes latest.json, hours and state; a second run on the same batch changes nothing', async () => {
  const site = mkdtempSync(join(tmpdir(), 'atlas-'));
  const logs: string[] = [];
  const fetchFn = stub({ [G + 'lastupdate.txt']: { status: 200, buf: lastupdate(ID) }, [`${G}${ID}.gkg.csv.zip`]: { status: 200, buf: ZIP } });
  assert.equal(await run(site, fetchFn, s => logs.push(s)), 0);
  const latest = JSON.parse(readFileSync(join(site, 'data/latest.json'), 'utf8'));
  assert.equal(isSnapshot(latest), true);
  assert.equal(latest.tick, AT);
  assert.ok(existsSync(join(site, 'data/hours/2026-09-08.json')));
  const state: State = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  assert.equal(state.last_batch, ID);
  const before = readFileSync(join(site, 'data/latest.json'), 'utf8');
  await run(site, fetchFn, s => logs.push(s));
  assert.equal(readFileSync(join(site, 'data/latest.json'), 'utf8'), before);
  assert.ok(logs.some(l => l.startsWith('already at')));
});

test('run walks a gap: 404 on non-latest slots is skipped and recorded; the latest is processed', async () => {
  const site = mkdtempSync(join(tmpdir(), 'atlas-'));
  const fetchFn = stub({ [G + 'lastupdate.txt']: { status: 200, buf: lastupdate(ID) }, [`${G}${ID}.gkg.csv.zip`]: { status: 200, buf: ZIP } });
  await run(site, fetchFn, () => {});
  const state: State = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  state.last_batch = '20260908224500';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(site, 'data/state.json'), JSON.stringify(state));
  await run(site, fetchFn, () => {});
  const after: State = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  assert.deepEqual(after.skipped, ['20260908230000', '20260908231500']);
  assert.equal(after.last_batch, ID);
});

test('run exits non-zero when the latest zip is unavailable', async () => {
  const site = mkdtempSync(join(tmpdir(), 'atlas-'));
  const fetchFn = stub({ [G + 'lastupdate.txt']: { status: 200, buf: lastupdate(ID) }, [`${G}${ID}.gkg.csv.zip`]: { status: 503 } });
  await assert.rejects(run(site, fetchFn, () => {}), /HTTP 503/);
  assert.equal(existsSync(join(site, 'data/latest.json')), false);
});

test('latest zip not yet published: retries, then processes it once it appears', async () => {
  const site = mkdtempSync(join(tmpdir(), 'atlas-'));
  let calls = 0;
  const fetchFn = async (url: string): Promise<Fetched> => {
    if (url.endsWith('lastupdate.txt')) return { status: 200, buf: lastupdate(ID) };
    if (url === `${G}${ID}.gkg.csv.zip`) return ++calls < 3 ? { status: 404 } : { status: 200, buf: ZIP };
    return { status: 404 };
  };
  const logs: string[] = [];
  assert.equal(await run(site, fetchFn, s => logs.push(s), { retryDelayMs: 0 }), 0);
  assert.equal(calls, 3);
  assert.ok(logs.some(l => l.includes('not published yet')));
  assert.equal(existsSync(join(site, 'data/latest.json')), true);
});

test('latest zip never appears: run ends cleanly without advancing, so the next cron retries', async () => {
  const site = mkdtempSync(join(tmpdir(), 'atlas-'));
  const fetchFn = stub({ [G + 'lastupdate.txt']: { status: 200, buf: lastupdate(ID) } });
  assert.equal(await run(site, fetchFn, () => {}, { latestRetries: 2, retryDelayMs: 0 }), 0);
  assert.equal(existsSync(join(site, 'data/latest.json')), false);
  const state: State = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  assert.equal(state.last_batch, null);
  assert.deepEqual(state.skipped, []);
});

test('a gated batch is recorded as skipped and last_batch still advances', async () => {
  const site = mkdtempSync(join(tmpdir(), 'atlas-'));
  const tiny = Buffer.from(CSV.toString('utf8').split('\n').slice(0, 50).join('\n') + '\n');
  const { deflateRawSync } = await import('node:zlib');
  const name = Buffer.from('x.csv'); const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(8, 8); header.writeUInt32LE(tiny.length, 22); header.writeUInt16LE(name.length, 26);
  const zip = Buffer.concat([header, name, deflateRawSync(tiny)]);
  const fetchFn = stub({ [G + 'lastupdate.txt']: { status: 200, buf: lastupdate(ID) }, [`${G}${ID}.gkg.csv.zip`]: { status: 200, buf: zip } });
  await run(site, fetchFn, () => {});
  const state: State = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  assert.deepEqual(state.skipped, [ID]);
  assert.equal(state.last_batch, ID);
  assert.equal(existsSync(join(site, 'data/latest.json')), false);
});
