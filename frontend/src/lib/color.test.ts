import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rgb } from 'd3-color';
import { lighten, withAlpha } from './color.ts';

test('withAlpha sets the alpha on hex and rgb() input, and leaves garbage alone', () => {
  assert.equal(withAlpha('#081228', 0.55), 'rgba(8, 18, 40, 0.55)');
  assert.equal(withAlpha('rgb(229, 72, 77)', 1), 'rgb(229, 72, 77)');
  assert.equal(withAlpha('rgba(229, 72, 77, 0.2)', 0.7), 'rgba(229, 72, 77, 0.7)');
  assert.equal(withAlpha('not a colour', 0.5), 'not a colour');
});

test('lighten raises lightness and keeps the alpha', () => {
  const base = 'rgba(8, 18, 40, 0.55)';
  const lit = rgb(lighten(base, 0.3));
  assert.ok(lit.r > 8 && lit.g > 18 && lit.b > 40, 'lighter in every channel');
  assert.equal(lit.opacity, 0.55);
  assert.equal(lighten('not a colour', 0.3), 'not a colour');
});
