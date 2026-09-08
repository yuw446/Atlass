import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LENSES, parseThemes, scoreLenses, dominantLens } from './lenses.ts';

test('four lenses in a fixed order with valid hex colours', () => {
  assert.deepEqual(LENSES.map(l => l.id), ['conflict', 'disaster', 'unrest', 'displacement']);
  for (const l of LENSES) assert.match(l.color, /^#[0-9A-Fa-f]{6}$/);
});

test('parseThemes takes the name before the comma, one entry per occurrence', () => {
  assert.deepEqual(parseThemes('PROTEST,12;TAX_FNCACT_POLICE,40;PROTEST,90'), ['PROTEST', 'TAX_FNCACT_POLICE', 'PROTEST']);
  assert.deepEqual(parseThemes(''), []);
});

test('a single occurrence is not enough; two are', () => {
  assert.equal(dominantLens(scoreLenses(['PROTEST'])), -1);
  assert.equal(dominantLens(scoreLenses(['PROTEST', 'STRIKE'])), 2);
  assert.equal(dominantLens(scoreLenses(['PROTEST', 'PROTEST'])), 2);
});

test('NATURAL_DISASTER_ prefix counts; MANMADE_DISASTER_IMPLIED does not', () => {
  assert.deepEqual(scoreLenses(['NATURAL_DISASTER_FLOOD', 'NATURAL_DISASTER_HEAVY_RAIN']), [0, 2, 0, 0]);
  assert.deepEqual(scoreLenses(['MANMADE_DISASTER_IMPLIED', 'MANMADE_DISASTER_IMPLIED']), [0, 0, 0, 0]);
  assert.deepEqual(scoreLenses(['MANMADE_DISASTER', 'MANMADE_DISASTER']), [0, 2, 0, 0]);
});

test('ties break by lens order; KILL and GENERAL_HEALTH score nothing', () => {
  assert.equal(dominantLens([2, 2, 0, 0]), 0);
  assert.equal(dominantLens([0, 2, 3, 0]), 2);
  assert.deepEqual(scoreLenses(['KILL', 'GENERAL_HEALTH', 'MEDICAL']), [0, 0, 0, 0]);
});
