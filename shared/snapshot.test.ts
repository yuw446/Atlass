import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSnapshot, type Snapshot } from './snapshot.ts';

const valid = (): Snapshot => ({
  schema: 1,
  tick: '2026-09-07T15:45:00Z',
  generated_at: '2026-09-07T15:58:12Z',
  source: 'gdelt-gkg-2.1-english',
  totals: { articles: 10, placed: 8, lensed: 3, capped: 0, unmapped: 0, dropped_urls: 0, dupes: 0 },
  window: 8,
  lenses: ['conflict', 'disaster', 'unrest'],
  countries: {
    SD: { n: 2, lens: [2, 0, 0], dom: 0, att: 0.5, z: 2, tone: -4.1,
          top: [{ t: 'Headline', u: 'https://x.example/a', d: 'x.example', l: 0, lat: 15.6, lon: 32.5, at: '2026-09-07T15:45:00Z' }] },
  },
  sparks: [[15.6, 32.5, 0]],
});

test('a valid snapshot passes', () => assert.equal(isSnapshot(valid()), true));

test('schema 2 is rejected, never rendered', () => {
  const s = valid() as unknown as Record<string, unknown>; s.schema = 2;
  assert.equal(isSnapshot(s), false);
});

test('missing countries, wrong lens length, bad spark tuple, non-object all rejected', () => {
  const a = valid() as unknown as Record<string, unknown>; delete a.countries; assert.equal(isSnapshot(a), false);
  const b = valid(); b.countries.SD.lens = [1, 2]; assert.equal(isSnapshot(b), false);
  const c = valid() as unknown as { sparks: unknown[] }; c.sparks = [[1, 2]]; assert.equal(isSnapshot(c), false);
  assert.equal(isSnapshot(null), false);
  assert.equal(isSnapshot('{}'), false);
});
