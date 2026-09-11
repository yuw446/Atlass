import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  unzipSingle, parseRows, processBatch, applyBatch, snapshotFrom, accumulateHours, emptyState, articleFrom,
  updateBaseline, seedBaselines, zOf, attOf, slotsToProcess, batchToIso, run, isSparkOnly, decodeEntities,
  zeroTotals, PRIOR_TICKS, WINDOW, TOP, DOMAIN_CAP, MAX_SLOTS, type State, type Baseline, type Fetched,
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

test('articleFrom: publisher sections, review slugs and entertainment headlines are placed but never lensed; word count gates density', () => {
  const totals = zeroTotals();
  const row = fixture().rows.find(r => r[4] === 'https://e2.example/e2')!;
  const at = (url: string, tone = row[15]) => { const c = [...row]; c[4] = url; c[15] = tone; return articleFrom(c, AT, totals); };
  assert.equal(at('https://e2.example/e2').article?.lens, 1);
  assert.equal(at('https://e2.example/entertainment/storm-movie').reject, 'section');
  assert.equal(at('https://e2.example/2026/09/the-storm-review/').reject, 'section');
  assert.equal(at('https://e2.example/the-storm-review-andrew-garfield/').article?.lens, 1, '"review" mid-slug is left alone (a known ceiling)');
  // "review" mid-slug in news, all seen live or on the ring; a rule fitted to one day's slugs dropped the NZ flood story (2026-09-11)
  assert.equal(at('https://e2.example/stories/flood-protection-and-drainage-rates-review-consultation-extended.htm').article?.lens, 1);
  assert.equal(at('https://e2.example/news/council-members-seek-utility-review-of-proposed-site/').article?.lens, 1);
  assert.equal(at('https://e2.example/news/house-urged-to-review-storm-defences-amid-scrutiny/').article?.lens, 1);
  assert.equal(at('https://e2.example/news/safety-review-launched-after-bridge-collapse/').article?.lens, 1);
  assert.equal(at('https://e2.example/news/officials-review-damage-after-quake/').article?.lens, 1);
  assert.equal(at('https://e2.example/news/hurricane-preview-2026').article?.lens, 1, 'preview is not review');
  const titled = (t: string) => { const c = [...row]; c[26] = `<PAGE_TITLE>${t}</PAGE_TITLE>`; return articleFrom(c, AT, totals); };
  assert.equal(titled('Storm Season 2 Trailer Drops').reject, 'section');
  assert.equal(titled('Book review: The Cold War\'s hidden hands').reject, 'section');
  assert.equal(titled('Council orders review of storm defences').article?.lens, 1, '"review" mid-headline is news');
  // weather seasons, trailer parks and "films" as a verb are news, not entertainment
  assert.equal(at('https://e2.example/news/hurricane-season-2026-forecast/').article?.lens, 1);
  assert.equal(at('https://e2.example/news/trailer-park-fire-kills-3/').article?.lens, 1);
  assert.equal(titled('Tornado flattens trailer park, 3 dead').article?.lens, 1);
  assert.equal(titled('Drone films flood damage across Valencia').article?.lens, 1);
  assert.equal(titled('Wildfire season 2026 could be the worst yet').article?.lens, 1);
  assert.equal(titled('Rivals season 2 gets huge update').reject, 'section');
  assert.equal(at('https://e2.example/news/pentagon-review-finds-strike-killed-civilians/').article?.lens, 1);
  assert.equal(at('https://e2.example/news/trailer-carrying-migrants-found/').article?.lens, 1);
  assert.equal(at('https://e2.example/video/carrie-official-trailer-all-she-wanted/').reject, 'section');
  assert.equal(titled('Trailer with 46 dead migrants found in San Antonio').article?.lens, 1);
  assert.equal(titled('Film shows Russian strike on Kharkiv hospital').article?.lens, 1);
  assert.equal(titled('April X Trailer: Connor Storrie stars in sci-fi thriller').reject, 'section');
  assert.equal(titled('Reveals Trailer for Final Season of the crime thriller').reject, 'section');
  // the headline is cleaned once at the trust boundary: control characters out, 300 characters at most
  assert.equal(titled('Storm &#27;[31mwarning&#x1b;[0m for the coast').article?.title, 'Storm [31mwarning[0m for the coast');
  assert.equal(titled('Storm warning '.repeat(40)).article?.title.length, 300);
  assert.equal(at('https://e2.example/e2', '-2.5,1,3.5,4.5,20,0,2000').reject, 'unlensed', 'two mentions in 2,000 words is an aside');
  assert.equal(at('https://e2.example/e2', '').article?.lens, 1, 'no word count: density not checked');
});

test('processBatch: a section-rejected row counts as placed for the gate but never as lensed', () => {
  const { rows, malformed } = fixture();
  const base = processBatch(rows, malformed, AT, emptyState());
  const sectioned = rows.map(r => r[4] === 'https://e2.example/e2' ? Object.assign([...r], { 4: 'https://e2.example/entertainment/e2' }) : r);
  const res = processBatch(sectioned, malformed, AT, emptyState());
  assert.equal(res.gate, undefined);
  assert.equal(res.totals.placed, base.totals.placed);
  assert.equal(res.totals.lensed, base.totals.lensed - 1);
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

test('story ring dedupes syndicated headlines across URLs, site tags and edits, keeping the strongest signal first', () => {
  const state = emptyState(); state.last_batch = ID;
  const mk = (title: string, url: string, score: number) => ({ url, host: 'h.example', title, iso: 'SD', lens: 0, score, tone: null, at: AT });
  const byCountry = new Map([['SD', [
    mk('Floods cut the coast road for a third day', 'https://a.example/1', 3),
    mk('Floods cut the coast road for a third day | Coast Times', 'https://b.example/2', 3),
    mk('Floods cut coast road for third day, council says', 'https://d.example/4', 5),
    mk('Same wire story', 'https://e.example/5', 3), mk('Same wire story', 'https://f.example/6', 3),
    mk('Weaker story', 'https://c.example/3', 9)]]]);
  applyBatch(state, { byCountry, sparks: [], totals: zeroTotals() }, AT);
  const stories = state.countries.SD.stories;
  assert.deepEqual(stories.map(s => s.t), ['Weaker story', 'Floods cut coast road for third day, council says', 'Same wire story']);
});

test('processBatch drops syndicated copies in the batch and across the ring, keeps the copy with a picture, counts them as dupes', () => {
  const { rows, malformed } = fixture();
  const e2 = rows.find(r => r[4] === 'https://e2.example/e2')!;
  const copy = (url: string, title: string, image = '') => { const c = [...e2]; c[4] = url; c[18] = image; c[26] = `<PAGE_TITLE>${title}</PAGE_TITLE>`; return c; };
  const withCopies = [...rows,
    copy('https://x.example/1', 'Hawaii residents told to expect tropical storm | Island Times', 'https://x.example/pic.jpg'),
    copy('https://y.example/2', 'Hawaii residents told to expect a tropical storm tonight, officials say')];
  const state = emptyState();
  const base = processBatch(rows, malformed, AT, emptyState());
  const res = processBatch(withCopies, malformed, AT, state);
  const us = (res.byCountry.get('US') ?? []).filter(a => /Hawaii residents/.test(a.title));
  assert.equal(us.length, 1, 'one story from three copies');
  assert.equal(us[0].image, 'https://x.example/pic.jpg', 'the copy with a picture survives');
  assert.equal(res.totals.dupes, base.totals.dupes + 2);
  // next batch: every fixture row under a fresh URL plus one more copy; the copy is a dupe by the ring, not by URL
  const later = processBatch([...rows.map(r => Object.assign([...r], { 4: r[4] + '?v=2' })), copy('https://z.example/3', 'Hawaii residents told to expect tropical storm - Pacific Daily')], malformed, AT, state);
  assert.equal((later.byCountry.get('US') ?? []).filter(a => /Hawaii residents/.test(a.title)).length, 0, 'the same headline two batches later is a dupe by the ring');
  assert.ok(later.totals.dupes > 0);
});

test('processBatch: dedupe is per country, the first picture wins, and headlines with no content words never merge', () => {
  const { rows, malformed } = fixture();
  const e2 = rows.find(r => r[4] === 'https://e2.example/e2')!;
  const no = rows.find(r => /Norway evacuation/.test(r[26]))!;
  const mk = (url: string, title: string, locs = e2[10], image = '') => { const c = [...e2]; c[3] = new URL(url).hostname; c[4] = url; c[10] = locs; c[18] = image; c[26] = `<PAGE_TITLE>${title}</PAGE_TITLE>`; return c; };
  const res = processBatch([...rows,
    mk('https://p.example/1', 'Magnitude 5.2 earthquake strikes Hawaii'),
    mk('https://q.example/2', 'Magnitude 5.2 earthquake strikes Norway', no[10]),
    mk('https://r.example/3', 'Storm surge floods the harbour road overnight', e2[10], 'https://r.example/first.jpg'),
    mk('https://s.example/4', 'Storm surge floods the harbour road overnight | Coast Times', e2[10], 'https://s.example/second.jpg'),
    mk('https://t.example/5', 'A to the'), mk('https://u.example/6', 'It is')], malformed, AT, emptyState());
  const us = res.byCountry.get('US') ?? [];
  assert.ok(us.some(a => /strikes Hawaii/.test(a.title)));
  assert.ok((res.byCountry.get('NO') ?? []).some(a => /strikes Norway/.test(a.title)), 'a templated headline in another country is its own story');
  assert.equal(us.filter(a => /Storm surge/.test(a.title)).map(a => a.image).join(), 'https://r.example/first.jpg', 'the first copy with a picture keeps it');
  assert.equal(us.filter(a => /^(A to the|It is)$/.test(a.title)).length, 2, 'empty token sets are never twins');
});

test('processBatch: the domain cap runs before the syndication merge, so a story first seen on a capped aggregator survives elsewhere', () => {
  const { rows, malformed } = fixture();
  const e2 = rows.find(r => r[4] === 'https://e2.example/e2')!;
  const titles = ['Storm surge floods the harbour road overnight', 'Wildfire closes the mountain pass for a second day', 'Landslide buries a farm after heavy rain',
    'Hurricane warning issued for the northern coast', 'Flash flood sweeps cars from the valley highway', 'Tornado tears roofs off homes in the county seat',
    'Drought empties the reservoir that supplies the city', 'Blizzard strands hundreds on the interstate'];
  const mk = (host: string, n: number) => { const c = [...e2]; c[3] = host; c[4] = `https://${host}/${n}`; c[26] = `<PAGE_TITLE>${titles[n]}</PAGE_TITLE>`; return c; };
  const batch = [...rows];
  for (let n = 0; n < 8; n++) batch.push(mk('aggregator.example', n));        // eight stories, all first seen here
  for (let n = 0; n < 8; n++) batch.push(mk(`paper${n}.example`, n));         // each story again on its own host
  const res = processBatch(batch, malformed, AT, emptyState());
  const us = (res.byCountry.get('US') ?? []).filter(a => titles.includes(a.title));
  assert.equal(us.length, 8, 'no story is lost to the cap');
  assert.equal(us.filter(a => a.host === 'aggregator.example').length, DOMAIN_CAP);
});

test('story ring: headlines in a script without spaces never collapse into one story', () => {
  const state = emptyState(); state.last_batch = ID;
  const mk = (title: string, url: string) => ({ url, host: 'h.example', title, iso: 'JP', lens: 1, score: 3, tone: null, at: AT });
  applyBatch(state, { byCountry: new Map([['JP', [mk('東京で地震', 'https://a.example/1'), mk('北海道で洪水', 'https://b.example/2')]]]), sparks: [], totals: zeroTotals() }, AT);
  assert.equal(state.countries.JP.stories.length, 2);
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
  assert.equal(far.slots.length, MAX_SLOTS);
  assert.equal(far.slots[MAX_SLOTS - 1], ID);
  assert.match(far.jumped ?? '', /^20260901001500\.\./);
  const gap = slotsToProcess('20260908000000', ID);
  assert.equal(gap.slots.length, MAX_SLOTS, 'a long outage is caught up MAX_SLOTS at a time');
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

test('run walks a gap: old missing slots are skipped, the latest is processed', async () => {
  const site = mkdtempSync(join(tmpdir(), 'atlas-'));
  const fetchFn = stub({ [G + 'lastupdate.txt']: { status: 200, buf: lastupdate(ID) }, [`${G}${ID}.gkg.csv.zip`]: { status: 200, buf: ZIP } });
  const dayLater = () => Date.parse(AT) + 24 * 3600_000;   // every slot is far older than the grace
  await run(site, fetchFn, () => {}, { now: dayLater });
  const state: State = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  state.last_batch = '20260908224500';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(site, 'data/state.json'), JSON.stringify(state));
  await run(site, fetchFn, () => {}, { now: dayLater });
  const after: State = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  assert.deepEqual(after.skipped, ['20260908230000', '20260908231500']);
  assert.deepEqual(after.pending, []);
  assert.equal(after.last_batch, ID);
});

test('a young missing slot goes to pending, is retried next run, and a late arrival is applied without moving the cursor back', async () => {
  const site = mkdtempSync(join(tmpdir(), 'atlas-'));
  const MISSING = '20260908231500';
  const files: Record<string, Fetched> = { [G + 'lastupdate.txt']: { status: 200, buf: lastupdate(ID) }, [`${G}${ID}.gkg.csv.zip`]: { status: 200, buf: ZIP } };
  const fetchFn = stub(files);
  const soon = () => Date.parse(AT) + 5 * 60_000;   // five minutes after the latest batch: the gap is young
  await run(site, fetchFn, () => {}, { now: soon });
  const state: State = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  state.last_batch = '20260908230000';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(site, 'data/state.json'), JSON.stringify(state));
  const logs: string[] = [];
  await run(site, fetchFn, s => logs.push(s), { now: soon });
  let s: State = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  assert.deepEqual(s.pending, [MISSING], 'young 404 is pending, not skipped');
  assert.deepEqual(s.skipped, []);
  assert.equal(s.last_batch, ID, 'the walk still reached the latest');
  // The missing file appears. Next run retries it first and applies it; the cursor stays at the latest.
  files[`${G}${MISSING}.gkg.csv.zip`] = { status: 200, buf: ZIP };
  const before = JSON.parse(readFileSync(join(site, 'data/latest.json'), 'utf8')).tick;
  await run(site, fetchFn, s => logs.push(s), { now: soon });
  s = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  assert.deepEqual(s.pending, []);
  assert.equal(s.last_batch, ID);
  assert.equal(JSON.parse(readFileSync(join(site, 'data/latest.json'), 'utf8')).tick, before, 'latest.json is not rewritten by an older batch');
  assert.ok(existsSync(join(site, 'data/hours/2026-09-08.json')));
  // A slot that stays missing past the grace is skipped for good.
  files[`${G}${MISSING}.gkg.csv.zip`] = { status: 404 };
  s.pending = [MISSING]; writeFileSync(join(site, 'data/state.json'), JSON.stringify(s));
  await run(site, fetchFn, () => {}, { now: () => Date.parse(AT) + 3 * 3600_000 });
  s = JSON.parse(readFileSync(join(site, 'data/state.json'), 'utf8'));
  assert.deepEqual(s.skipped, [MISSING]);
  assert.deepEqual(s.pending, []);
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
