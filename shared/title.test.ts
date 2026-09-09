import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimTitle, titleTokens, sameStory } from './title.ts';

test('trimTitle strips one site suffix only when 20 characters remain, and leaves the rest alone', () => {
  assert.equal(trimTitle('Woman arrested over suspected brothel in Bury St Edmunds | East Anglia Daily Times'), 'Woman arrested over suspected brothel in Bury St Edmunds');
  assert.equal(trimTitle('Explosion in central Mexico kills at least 10 - ABC13'), 'Explosion in central Mexico kills at least 10');
  assert.equal(trimTitle('Short title | Site'), 'Short title | Site');
  assert.equal(trimTitle('Canada, EU plan stronger ties as trade war intensifies'), 'Canada, EU plan stronger ties as trade war intensifies');
  assert.equal(trimTitle('Israel-Iran strikes continue for a third day – Reuters'), 'Israel-Iran strikes continue for a third day');
});

test('titleTokens: site tags off, U.S. joined, possessives and plurals folded, stop words and lone letters out, any script', () => {
  assert.deepEqual([...titleTokens("Arab News | Nepal's floods cut the U.S. embassy road – Winnipeg Free Press")], ['nepal', 'flood', 'cut', 'us', 'embassy', 'road']);
  assert.deepEqual([...titleTokens('Indonesia searches for 8 missing at sea near volcano')], ['indonesia', 'searche', '8', 'missing', 'sea', 'near', 'volcano']);
  assert.deepEqual([...titleTokens('Plan B for the X factor: Türkiye’s 3 options')], ['plan', 'factor', 'türkiye', '3', 'option']);
  assert.deepEqual([...titleTokens('東京で地震')], ['東京で地震']);
  assert.deepEqual([...titleTokens('A to the')], []);
});

const same = (a: string, b: string) => sameStory(titleTokens(a), titleTokens(b));

test('sameStory merges syndicated copies and edited wire headlines, not two outlets\' own stories', () => {
  // seen live 2026-09-09
  assert.ok(same('Hunter River Forum: How messy rivers manage future floods | Dungog Chronicle', 'Hunter River Forum: How messy rivers manage future floods | The Maitland Mercury'));
  assert.ok(same('Indonesia searches for 8 missing at sea near volcano', 'Indonesia searches for 8 missing at sea near Anak Krakatau volcano'));
  assert.ok(same("The psychological toll of Cuba's multiple crises is pushing many islanders to the breaking point", "Psychological toll of Cuba's multiple crises pushing many islanders to breaking point"));
  assert.ok(same('For these Venezuelans in the US, June\'s earthquakes still reverberate', 'For these Venezuelans living in the US, June\'s earthquakes still reverberate across daily life – Taylorville Daily News'));
  assert.ok(same('Cuba denounces U.S. fuel blockade on power generation', 'Cuba denounces U.S. fuel blockade on power generation-Xinhua'));
  assert.ok(same('Liberia: AFL Personnel Arrested With Nearly U.S.$10K Tramadol Shipment', 'AFL Personnel Arrested With Nearly US$10K Tramadol Shipment'));
  assert.ok(!same('Oil rises past $100 a barrel after the latest wave of Middle East attacks', 'Oil surges past $100 a barrel after fresh Middle East attacks'));
  assert.ok(!same('Massive blast at weapons depot in Syria kills 14', 'Syria Arms Depot Explosion Kills at Least 14'));
  // short headlines: exact only
  assert.ok(same('Targeted News Service', 'Targeted News Service'));
  assert.ok(!same('Cap 1', 'Cap 2'));
  assert.ok(!same('Press release', 'Press release on the new coastal flood scheme'));
  // a short headline is not swallowed by a long unrelated one that happens to contain its words
  assert.ok(!same('Floods hit Nepal today', 'Nepal floods today: how a hit song raised money for victims of the disaster'));
  // headlines with no content words never match anything, including each other
  assert.ok(!same('A to the', 'A to the'));
  assert.ok(!same('東京で地震', '北海道で洪水'));
  assert.ok(same('東京で地震', '東京で地震'));
  // symmetric
  assert.equal(same('Indonesia searches for 8 missing at sea near Anak Krakatau volcano', 'Indonesia searches for 8 missing at sea near volcano'), true);
});
