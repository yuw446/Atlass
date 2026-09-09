import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rgb } from 'd3-color';
import { mixAt, easeInOut } from './tween.ts';

const hex = (s: string) => rgb(s).formatHex();

test('t = 0 is the start colour, t = 1 is the target, keys new to the target start there', () => {
  const from = new Map([['SD', '#081228']]);
  const to = new Map([['SD', '#e5484d'], ['FR', '#f0a340']]);
  assert.equal(hex(mixAt(from, to, 0).get('SD')!), '#081228');
  assert.equal(hex(mixAt(from, to, 1).get('SD')!), '#e5484d');
  assert.equal(hex(mixAt(from, to, 0).get('FR')!), '#f0a340');
});

test('halfway is between the two in LAB, and easing is monotonic', () => {
  const mid = rgb(mixAt(new Map([['x', '#081228']]), new Map([['x', '#e5484d']]), 0.5).get('x')!);
  assert.ok(mid.r > rgb('#081228').r && mid.r < rgb('#e5484d').r);
  assert.equal(easeInOut(0), 0); assert.equal(easeInOut(1), 1);
  assert.ok(easeInOut(0.3) < easeInOut(0.6));
});
