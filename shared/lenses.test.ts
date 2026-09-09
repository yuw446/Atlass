import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LENSES, parseThemes, scoreLenses, dominantLens, lensOf } from './lenses.ts';

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

test('noise prefixes never count; WB_2433 supports a conflict theme but cannot carry one; a trade dispute vetoes conflict', () => {
  assert.deepEqual(scoreLenses(['NATURAL_DISASTER_ICE', 'NATURAL_DISASTER_ICY', 'NATURAL_DISASTER_CHILL']), [0, 0, 0, 0]);
  assert.deepEqual(scoreLenses(['WB_2433_CONFLICT_AND_VIOLENCE', 'WB_2433_CONFLICT_AND_VIOLENCE']), [0, 0, 0, 0]);
  assert.deepEqual(scoreLenses(['ARMEDCONFLICT', 'WB_2433_CONFLICT_AND_VIOLENCE']), [2, 0, 0, 0]);
  assert.deepEqual(scoreLenses(['MILITARY', ...Array(8).fill('WB_2433_CONFLICT_AND_VIOLENCE'), ...Array(5).fill('NATURAL_DISASTER_FLOOD')]), [2, 5, 0, 0], 'support counts at most one for one');
  assert.deepEqual(scoreLenses(['ARMEDCONFLICT', 'ARMEDCONFLICT', 'ECON_TRADE_DISPUTE', 'PROTEST', 'PROTEST']), [0, 0, 2, 0]);
});

test('lensOf: core and support themes map to their lens, noise and unknown themes to none', () => {
  assert.equal(lensOf('ARMEDCONFLICT'), 0);
  assert.equal(lensOf('WB_2433_CONFLICT_AND_VIOLENCE'), 0);
  assert.equal(lensOf('NATURAL_DISASTER_FLOOD'), 1);
  assert.equal(lensOf('NATURAL_DISASTER_ICE'), -1);
  assert.equal(lensOf('TAX_FNCACT_ACTOR'), -1);
});

test('density: two mentions carry a 300-word brief, not a 1,000-word feature; an unknown word count skips the check', () => {
  assert.equal(dominantLens([2, 0, 0, 0], 300), 0);
  assert.equal(dominantLens([2, 0, 0, 0], 1000), -1);
  assert.equal(dominantLens([2, 0, 0, 0]), 0);
  assert.equal(dominantLens([3, 5, 0, 0], 1000), 1, 'the lens that clears the density bar wins');
});
