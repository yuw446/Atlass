import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fipsToIso, geoCode, flagEmoji, POLYGON_CODES } from './codes.ts';

test('the override covers the polygons whose FIPS_10 is -99', () => {
  assert.equal(fipsToIso('NO'), 'NO');
  assert.equal(fipsToIso('IS'), 'IL');
  assert.equal(fipsToIso('WE'), 'PS');
  assert.equal(fipsToIso('GZ'), 'PS');
  assert.equal(fipsToIso('OD'), 'SS');
});

test('ten sampled FIPS traps come out of the GeoJSON correctly', () => {
  const traps: Array<[string, string]> = [
    ['UK', 'GB'], ['CH', 'CN'], ['SZ', 'CH'], ['AS', 'AU'], ['AU', 'AT'],
    ['GM', 'DE'], ['GB', 'GA'], ['IC', 'IS'], ['UP', 'UA'], ['KV', 'XK'],
  ];
  for (const [fips, iso] of traps) assert.equal(fipsToIso(fips), iso, `${fips} -> ${iso}`);
  assert.equal(fipsToIso('ZZ'), undefined);
});

// CRITICAL regression: France and Norway were never enriched by the old code (ISO_A2 = -99).
test('geoCode resolves France, Norway, Kosovo, Taiwan and rejects codeless territories', () => {
  assert.equal(geoCode({ ISO_A2: '-99', ISO_A2_EH: 'FR' }), 'FR');
  assert.equal(geoCode({ ISO_A2: '-99', ISO_A2_EH: 'NO' }), 'NO');
  assert.equal(geoCode({ ISO_A2: '-99', ISO_A2_EH: 'XK' }), 'XK');
  assert.equal(geoCode({ ISO_A2: 'CN-TW', ISO_A2_EH: 'TW' }), 'TW');
  assert.equal(geoCode({ ISO_A2: 'CN-TW' }), 'TW');
  assert.equal(geoCode({ ISO_A2: '-99', ISO_A2_EH: '-99' }), undefined);
  assert.equal(geoCode({ ISO_A2: 'SD' }), 'SD');
});

test('polygon code list includes the recovered codes and is unique', () => {
  for (const c of ['FR', 'NO', 'XK', 'TW', 'PS', 'SS', 'US']) assert.ok(POLYGON_CODES.includes(c), c);
  assert.equal(new Set(POLYGON_CODES).size, POLYGON_CODES.length);
});

test('flag emoji', () => {
  assert.equal(flagEmoji('SD'), '🇸🇩');
  assert.equal(flagEmoji('XK'), '');
  assert.equal(flagEmoji('cn-tw'), '');
});
