import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelIndex, previousStats, report, servedRows, toLabels, todo } from './audit-snapshot.ts';
import type { Snapshot, Story } from '../shared/snapshot.ts';
import type { Label } from '../shared/labels.ts';

const at = '2026-09-27T20:45:00Z';   // batch 20260927204500
const story = (n: number, l: number): Story => ({ t: `Headline ${n}`, u: `https://example.com/${n}`, d: 'example.com', l, at });
const country = (top: Story[]) => ({ n: top.length, lens: [0, 0, 0], dom: 0, att: 0, z: 0, tone: null, top });
const snap = {
  schema: 1, tick: '2026-09-27T21:00:00Z', generated_at: '', source: '', window: 8, lenses: ['conflict', 'disaster', 'unrest'],
  totals: { articles: 0, placed: 0, lensed: 0, capped: 0, unmapped: 0, dropped_urls: 0, dupes: 0 }, sparks: [],
  countries: { UA: country([story(1, 0), story(2, 0), story(3, 0)]), NP: country([story(4, 1), story(5, 1)]), FR: country([story(6, 2)]) },
} as Snapshot;
const label = (n: number, lens: Label['lens'], kind: Label['kind'], iso: string | null, reason?: string): Label =>
  ({ url: `https://example.com/${n}`, title: `Headline ${n}`, source: 'example.com', batch: '20260927204500', lens, kind, iso, judge: 'claude', judged_at: '2026-09-28', reason });
const labels = [
  label(1, 'conflict', 'live', 'UA', 'on_topic: fighting'),
  label(2, 'none', 'other', 'UA', 'politics_rhetoric: a speech'),
  label(3, 'conflict', 'history', null, 'history_anniversary: 1943'),
  label(4, 'disaster', 'live', 'NP', 'on_topic: floods'),
  label(5, 'disaster', 'live', 'IN', 'on_topic: floods across the border'),
  label(6, 'none', 'other', 'FR', 'politics_rhetoric: pension bill'),
];

test('servedRows flattens every country, names the lens and derives the batch from the story time', () => {
  const rows = servedRows(snap);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[3], { iso: 'NP', lens: 'disaster', title: 'Headline 4', url: 'https://example.com/4', source: 'example.com', batch: '20260927204500' });
});

test('todo lists the unjudged stories; a human label outranks a newer claude one', () => {
  assert.deepEqual(todo(servedRows(snap), labelIndex(labels.slice(0, 4))).map(r => r.url), ['https://example.com/5', 'https://example.com/6']);
  const idx = labelIndex([{ ...labels[1], judge: 'human', judged_at: '2026-09-01' }, labels[1]]);
  assert.equal(idx.get('20260927204500 https://example.com/2')?.judge, 'human');
});

test('report: precision by lens, right country over placed stories, off-lens classes, per-country rows', () => {
  const { md, stats } = report(servedRows(snap), labelIndex(labels), snap.tick);
  assert.equal(stats.onLens, 3);          // 1, 4, 5
  assert.equal(stats.placed, 5);          // 3 is unplaced
  assert.equal(stats.rightCountry, 4);    // 5 was judged India
  assert.deepEqual(stats.byLens, { conflict: { n: 3, on: 1 }, disaster: { n: 2, on: 2 }, unrest: { n: 1, on: 0 } });
  assert.match(md, /^<!-- audit \{.*\} -->\n# Served-story audit, 2026-09-27/);
  assert.match(md, /On-lens precision 50\.0%\*\* \(3 of 6\)/);
  assert.match(md, /Right country 80\.0%\*\* \(4 of 5/);
  assert.match(md, /- \*\*politics_rhetoric\*\* \(2\): “Headline 2”; “Headline 6”\n- \*\*history_anniversary\*\* \(1\)/);
  assert.match(md, /\| UA \| 3 \| 1 \| 2\/2 \|\n\| NP \| 2 \| 2 \| 1\/2 \|\n\| FR \| 1 \| 0 \| 1\/1 \|/);
  assert.match(md, /No previous report\./);
});

test('report refuses a snapshot with an unjudged story', () => {
  assert.throws(() => report(servedRows(snap), labelIndex(labels.slice(1)), snap.tick), /unjudged: https:\/\/example.com\/1/);
});

test('the delta line compares with the newest earlier report, never a same-day or later one', () => {
  const old = report(servedRows(snap), labelIndex(labels), '2026-09-25T21:00:00Z');
  const better = labels.map(l => l.url.endsWith('/2') ? { ...l, lens: 'conflict' as const, kind: 'live' as const } : l);
  const files = [{ name: '2026-09-25.md', text: old.md }, { name: '2026-09-27.md', text: 'x' }, { name: 'README.md', text: 'x' }];
  const prev = previousStats(files, '2026-09-27');
  assert.equal(prev?.date, '2026-09-25');
  assert.match(report(servedRows(snap), labelIndex(better), snap.tick, prev).md, /Since 2026-09-25: precision \+16\.7 pts, right country \+0\.0 pts\./);
});

test('toLabels files one verdict per todo story, all or nothing', () => {
  const open = servedRows(snap).slice(4);   // stories 5 and 6
  const v = (n: number, lens: Label['lens'], iso: string | null) => ({ url: `https://example.com/${n}`, lens, kind: 'live' as const, iso, reason: 'on_topic: x' });
  const ok = toLabels(open, [v(5, 'disaster', 'NP'), v(6, 'unrest', 'FR')], '2026-09-28');
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.rows[1], { url: 'https://example.com/6', title: 'Headline 6', source: 'example.com', batch: '20260927204500',
    lens: 'unrest', kind: 'live', iso: 'FR', judge: 'claude', judged_at: '2026-09-28', reason: 'on_topic: x' });
  assert.deepEqual(toLabels(open, [v(5, 'disaster', 'NP')], '2026-09-28').errors, ['no verdict: https://example.com/6']);
  assert.deepEqual(toLabels(open, [v(5, 'disaster', 'np'), v(6, 'unrest', null), v(9, 'none', null)], '2026-09-28').errors.length, 2,
    'a lowercase iso and a URL off the todo list');
});
