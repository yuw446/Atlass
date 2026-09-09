import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rgb } from 'd3-color';
import { fillFor, fillAlphaFor, UNLIT_ALPHA } from './fill.ts';
import { LENSES, BASE_NAVY } from '../../../shared/lenses.ts';
import type { CountrySnap } from '../../../shared/snapshot.ts';

const c = (over: Partial<CountrySnap> = {}): CountrySnap => ({ n: 5, lens: [5, 0, 0, 0], dom: 0, att: 0.5, z: 2, tone: null, top: [], ...over });
const hex = (s: string) => rgb(s).formatHex();

test('no stories → base navy; undefined → base navy', () => {
  assert.equal(fillFor(undefined, null), BASE_NAVY);
  assert.equal(fillFor(c({ n: 0, lens: [0, 0, 0, 0], dom: -1 }), null), BASE_NAVY);
});

test('att 1 is the full lens colour; att 0 is a quarter of the way from navy', () => {
  assert.equal(hex(fillFor(c({ att: 1 }), null)), LENSES[0].color.toLowerCase());
  const quarter = rgb(fillFor(c({ att: 0 }), null));
  const navy = rgb(BASE_NAVY), full = rgb(LENSES[0].color);
  assert.ok(quarter.r > navy.r && quarter.r < full.r, 'between navy and the lens colour');
});

test('lens filter hides countries with nothing under that lens and recolours the rest', () => {
  const country = c({ lens: [3, 2, 0, 0], dom: 0, att: 1 });
  assert.equal(fillFor(country, 2), BASE_NAVY);
  assert.equal(hex(fillFor(country, 1)), LENSES[1].color.toLowerCase());
});

test('cap alpha: unlit is the navy tint, lensed rises with attention, filtered-out drops to unlit', () => {
  assert.equal(fillAlphaFor(undefined, null), UNLIT_ALPHA);
  assert.equal(fillAlphaFor(c({ n: 0, lens: [0, 0, 0, 0], dom: -1 }), null), UNLIT_ALPHA);
  const low = fillAlphaFor(c({ att: 0 }), null), high = fillAlphaFor(c({ att: 1 }), null);
  assert.ok(low > UNLIT_ALPHA && high > low && high <= 1, `${low} < ${high}`);
  assert.equal(fillAlphaFor(c({ lens: [3, 2, 0, 0], dom: 0 }), 2), UNLIT_ALPHA);
});
