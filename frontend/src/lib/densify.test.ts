import { test } from 'node:test';
import assert from 'node:assert/strict';
import { densifyRing, densifyGeometry } from './densify.ts';

// CRITICAL regression: densifyRing was moved out of the globe hook; its behaviour must not change.
test('a 10° edge gains intermediate points; short edges are untouched; endpoints are preserved', () => {
  const ring = [[0, 0], [10, 0], [10, 1], [0, 0]];
  const out = densifyRing(ring);
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[out.length - 1], [0, 0]);
  assert.ok(out.length > ring.length, 'points were added');
  const longEdge = out.slice(0, out.findIndex(p => p[0] === 10 && p[1] === 0) + 1);
  assert.equal(longEdge.length, 5, '10° split into 4 segments of 2.5°');
  assert.deepEqual(densifyRing([[0, 0], [1, 1], [0, 0]]), [[0, 0], [1, 1], [0, 0]]);
});

test('densifyGeometry handles Polygon and MultiPolygon and leaves other types alone', () => {
  const poly = densifyGeometry({ type: 'Polygon', coordinates: [[[0, 0], [10, 0], [0, 0]]] });
  assert.ok((poly.coordinates as number[][][])[0].length > 3);
  const multi = densifyGeometry({ type: 'MultiPolygon', coordinates: [[[[0, 0], [10, 0], [0, 0]]]] });
  assert.ok((multi.coordinates as number[][][][])[0][0].length > 3);
  const pt = { type: 'Point', coordinates: [1, 2] };
  assert.equal(densifyGeometry(pt), pt);
});
