import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, initialState, ageMinutes } from './snapshotState.ts';
import type { Snapshot } from '../../../shared/snapshot.ts';

const T0 = Date.parse('2026-09-09T00:30:00Z');
const snap = (tick = '2026-09-09T00:30:00Z'): Snapshot => ({
  schema: 1, tick, generated_at: tick, source: 'test',
  totals: { articles: 1, placed: 1, lensed: 1, capped: 0, unmapped: 0, dropped_urls: 0, dupes: 0 },
  window: 8, lenses: ['conflict', 'disaster', 'unrest'], countries: {}, sparks: [],
});

test('ok body → ok, still ok just before the next hourly tick; age past 90 minutes → stale; clock flips ok to stale', () => {
  const s1 = reduce(initialState, { type: 'ok', body: snap(), now: T0 + 5 * 60_000 });
  assert.equal(s1.status, 'ok');
  assert.equal(reduce(initialState, { type: 'ok', body: snap(), now: T0 + 70 * 60_000 }).status, 'ok');
  const s2 = reduce(initialState, { type: 'ok', body: snap(), now: T0 + 91 * 60_000 });
  assert.equal(s2.status, 'stale');
  const s3 = reduce(s1, { type: 'clock', now: T0 + 120 * 60_000 });
  assert.equal(s3.status, 'stale');
  assert.equal(s3.snapshot, s1.snapshot);
});

test('age never goes negative when the batch label runs ahead of the clock', () => {
  assert.equal(ageMinutes(snap('2026-09-09T00:30:00Z'), T0 - 10 * 60_000), 0);
  assert.equal(ageMinutes(snap(), T0 + 30 * 60_000), 30);
});

test('schema mismatch is an error that keeps the last good snapshot and never renders the bad one', () => {
  const good = reduce(initialState, { type: 'ok', body: snap(), now: T0 });
  const bad = reduce(good, { type: 'ok', body: { ...snap(), schema: 2 }, now: T0 });
  assert.equal(bad.status, 'error');
  assert.equal(bad.snapshot, good.snapshot);
});

test('fetch error keeps the last good snapshot; 404 with nothing stored is nodata', () => {
  const good = reduce(initialState, { type: 'ok', body: snap(), now: T0 });
  const err = reduce(good, { type: 'error', message: 'HTTP 503', now: T0 });
  assert.equal(err.status, 'error'); assert.equal(err.snapshot, good.snapshot); assert.equal(err.message, 'HTTP 503');
  const nodata = reduce(initialState, { type: 'notfound', now: T0 });
  assert.equal(nodata.status, 'nodata'); assert.equal(nodata.snapshot, null);
  const later = reduce(good, { type: 'notfound', now: T0 });
  assert.equal(later.status, 'error'); assert.equal(later.snapshot, good.snapshot);
});

test('a four-lens snapshot restored from localStorage is still accepted: the guard reads the width from the body', () => {
  const body = { ...snap(), lenses: ['conflict', 'disaster', 'unrest', 'displacement'], countries: { SD: { n: 1, lens: [0, 0, 0, 1], dom: 3, att: 1, z: 4, tone: null, top: [] } } };
  assert.equal(reduce(initialState, { type: 'restore', body, now: T0 }).status, 'ok');
});

test('restore fills an empty state only, and only with a valid body', () => {
  const restored = reduce(initialState, { type: 'restore', body: snap(), now: T0 + 120 * 60_000 });
  assert.equal(restored.status, 'stale');
  const live = reduce(initialState, { type: 'ok', body: snap('2026-09-09T01:00:00Z'), now: T0 + 31 * 60_000 });
  const ignored = reduce(live, { type: 'restore', body: snap(), now: T0 });
  assert.equal(ignored.snapshot, live.snapshot);
  assert.equal(reduce(initialState, { type: 'restore', body: 'junk', now: T0 }), initialState);
});

test('a fresh ok after an error returns to ok', () => {
  const err = reduce(initialState, { type: 'error', message: 'x', now: T0 });
  assert.equal(reduce(err, { type: 'ok', body: snap(), now: T0 }).status, 'ok');
});
