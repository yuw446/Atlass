import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LENSES, parseThemes, scoreLenses, dominantLens, lensOf, crowdedOut } from './lenses.ts';

test('three lenses in a fixed order with valid hex colours', () => {
  assert.deepEqual(LENSES.map(l => l.id), ['conflict', 'disaster', 'unrest']);
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
  assert.deepEqual(scoreLenses(['NATURAL_DISASTER_FLOOD', 'NATURAL_DISASTER_HEAVY_RAIN']), [0, 2, 0]);
  assert.deepEqual(scoreLenses(['MANMADE_DISASTER_IMPLIED', 'MANMADE_DISASTER_IMPLIED']), [0, 0, 0]);
  assert.deepEqual(scoreLenses(['MANMADE_DISASTER', 'MANMADE_DISASTER']), [0, 2, 0]);
});

test('ties break by lens order; KILL and GENERAL_HEALTH score nothing', () => {
  assert.equal(dominantLens([2, 2, 0]), 0);
  assert.equal(dominantLens([0, 2, 3]), 2);
  assert.deepEqual(scoreLenses(['KILL', 'GENERAL_HEALTH', 'MEDICAL']), [0, 0, 0]);
  assert.deepEqual(scoreLenses(['REFUGEES', 'DISPLACED', 'EVACUATION']), [0, 0, 0], 'displacement themes score nothing since 2026-09-11');
});

test('noise prefixes never count; WB_2433 supports a conflict theme but cannot carry one; a trade dispute vetoes conflict', () => {
  assert.deepEqual(scoreLenses(['NATURAL_DISASTER_ICE', 'NATURAL_DISASTER_ICY', 'NATURAL_DISASTER_CHILL']), [0, 0, 0]);
  assert.deepEqual(scoreLenses(['WB_2433_CONFLICT_AND_VIOLENCE', 'WB_2433_CONFLICT_AND_VIOLENCE']), [0, 0, 0]);
  assert.deepEqual(scoreLenses(['ARMEDCONFLICT', 'WB_2433_CONFLICT_AND_VIOLENCE']), [2, 0, 0]);
  assert.deepEqual(scoreLenses(['MILITARY', ...Array(8).fill('WB_2433_CONFLICT_AND_VIOLENCE'), ...Array(5).fill('NATURAL_DISASTER_FLOOD')]), [2, 5, 0], 'support counts at most one for one');
  assert.deepEqual(scoreLenses(['ARMEDCONFLICT', 'ARMEDCONFLICT', 'ECON_TRADE_DISPUTE', 'PROTEST', 'PROTEST']), [0, 0, 2]);
});

test('lensOf: core and support themes map to their lens, noise and unknown themes to none', () => {
  assert.equal(lensOf('ARMEDCONFLICT'), 0);
  assert.equal(lensOf('WB_2433_CONFLICT_AND_VIOLENCE'), 0);
  assert.equal(lensOf('NATURAL_DISASTER_FLOOD'), 1);
  assert.equal(lensOf('NATURAL_DISASTER_ICE'), -1);
  assert.equal(lensOf('TAX_FNCACT_ACTOR'), -1);
});

test('density: two mentions carry a 300-word brief, not a 1,000-word feature; an unknown word count skips the check', () => {
  assert.equal(dominantLens([2, 0, 0], 300), 0);
  assert.equal(dominantLens([2, 0, 0], 1000), -1);
  assert.equal(dominantLens([2, 0, 0]), 0);
  assert.equal(dominantLens([3, 5, 0], 1000), 1, 'the lens that clears the density bar wins');
});

test('crowdedOut nofight: a conflict story with no fighting must name the war and not be about the armed forces', () => {
  const x = (n: number, t: string) => Array<string>(n).fill(t);
  assert.equal(crowdedOut(0, x(2, 'MILITARY'), 2), 'nofight', 'exercises, procurement, a celebrity at the Pentagon');
  assert.equal(crowdedOut(0, [...x(2, 'ARMEDCONFLICT'), 'MILITARY'], 3), 'nofight');
  assert.equal(crowdedOut(0, x(2, 'TERROR'), 2), 'nofight', 'terror rhetoric with no attack reported');
  assert.equal(crowdedOut(0, x(2, 'ARMEDCONFLICT'), 2), undefined, 'the war named, the army not the subject');
  assert.equal(crowdedOut(0, ['ARMEDCONFLICT', 'MILITARY', 'KILL'], 2), undefined, 'fighting reported');
  assert.equal(crowdedOut(0, ['MILITARY', 'MILITARY', 'DRONES'], 2), undefined);
});

test('crowdedOut strike: "strike" alone with no labour theme is lightning, sport or a single; a walkout keeps its workers', () => {
  assert.equal(crowdedOut(2, ['PROTEST', 'STRIKE'], 2), 'strike');
  assert.equal(crowdedOut(2, ['PROTEST', 'STRIKE', 'TAX_FNCACT_WORKERS'], 2), undefined);
  assert.equal(crowdedOut(2, ['PROTEST', 'STRIKE', 'ECON_UNIONS'], 2), undefined);
  assert.equal(crowdedOut(2, ['PROTEST', 'PROTEST', 'STRIKE'], 3), undefined, 'more protest than strike: a protest');
});

test('crowdedOut civic: a competing subject at half the lens and its fighting crowds the lens out', () => {
  const x = (n: number, t: string) => Array<string>(n).fill(t);
  const war = [...x(2, 'ARMEDCONFLICT'), 'KILL'];   // score 2, fighting 1: the bar is 1.5 mentions
  assert.equal(crowdedOut(0, [...war, ...x(2, 'TAX_FNCACT_CANDIDATE')], 2), 'civic', 'an election story that cites the war');
  assert.equal(crowdedOut(0, [...war, 'TAX_FNCACT_CANDIDATE'], 2), undefined, 'one mention of a candidate in a war report');
  assert.equal(crowdedOut(0, [...war, ...x(2, 'TRIAL')], 2), 'civic', 'a trial over an attack');
  assert.equal(crowdedOut(0, [...war, ...x(2, 'TAX_POLITICAL_PARTY_HAMAS'), 'TAX_TERROR_GROUP_HAMAS'], 2), undefined, 'an armed party is not politics');
  assert.equal(crowdedOut(0, [...war, ...x(2, 'TAX_POLITICAL_PARTY_BHARATIYA_JANATA_PARTY'), 'TAX_TERROR_GROUP_BHARATIYA_JANATA_PARTY'], 2), 'civic', 'GDELT also files the BJP as a terror group; it is politics');
  assert.equal(crowdedOut(0, [...x(2, 'ARMEDCONFLICT'), ...x(2, 'TAX_ECON_PRICE')], 2), 'civic', 'oil tops $100 as the war escalates');
  // The fixture's tanker story: score 9, one blockade, one oil-price paragraph firing five price themes at once.
  const tanker = [...x(3, 'ARMEDCONFLICT'), ...x(3, 'MILITARY'), 'BLOCKADE', ...x(3, 'TAX_ECON_PRICE'), 'FUELPRICES', 'ECON_OILPRICE', 'ECON_GASOLINEPRICE', 'ECON_HEATINGOIL'];
  assert.equal(crowdedOut(0, tanker, 9), undefined, 'co-firing price themes count once: markets takes its most-mentioned theme');
  const flood = x(2, 'NATURAL_DISASTER_FLOOD');
  assert.equal(crowdedOut(1, [...flood, ...x(3, 'SCIENCE')], 2), undefined, 'climate and disaster coverage is science by nature');
  assert.equal(crowdedOut(1, [...flood, ...x(2, 'LEGISLATION')], 2), 'civic', 'a flood bill');
  assert.equal(crowdedOut(2, [...x(2, 'PROTEST'), ...x(5, 'TAX_FNCACT_CANDIDATE')], 2), undefined, 'rallies are politics by nature: nothing competes with unrest');
});
