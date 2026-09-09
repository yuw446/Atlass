import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attentionWords, tickClock, agePhrase } from './text.ts';

test('attention words at the design thresholds', () => {
  assert.equal(attentionWords(2.5), 'far above usual');
  assert.equal(attentionWords(1.5), 'above usual');
  assert.equal(attentionWords(0), 'usual');
  assert.equal(attentionWords(-1.5), 'quiet');
  assert.equal(attentionWords(2), 'far above usual');
  assert.equal(attentionWords(-1), 'quiet');
});

test('tickClock and agePhrase', () => {
  assert.equal(tickClock('2026-09-09T00:30:00Z'), '00:30 UTC');
  assert.equal(tickClock('nope'), '');
  assert.equal(agePhrase(0.4), 'just now');
  assert.equal(agePhrase(9.4), '9 min ago');
  assert.equal(agePhrase(150), '3 h ago');
});
