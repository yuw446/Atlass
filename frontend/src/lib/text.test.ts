import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attentionWords, trimTitle, tickClock, agePhrase } from './text.ts';

test('attention words at the design thresholds', () => {
  assert.equal(attentionWords(2.5), 'far above usual');
  assert.equal(attentionWords(1.5), 'above usual');
  assert.equal(attentionWords(0), 'usual');
  assert.equal(attentionWords(-1.5), 'quiet');
  assert.equal(attentionWords(2), 'far above usual');
  assert.equal(attentionWords(-1), 'quiet');
});

test('trimTitle strips one site suffix only when 20 characters remain, and leaves the rest alone', () => {
  assert.equal(trimTitle('Woman arrested over suspected brothel in Bury St Edmunds | East Anglia Daily Times'), 'Woman arrested over suspected brothel in Bury St Edmunds');
  assert.equal(trimTitle('Explosion in central Mexico kills at least 10 - ABC13'), 'Explosion in central Mexico kills at least 10');
  assert.equal(trimTitle('Short title | Site'), 'Short title | Site');
  assert.equal(trimTitle('Canada, EU plan stronger ties as trade war intensifies'), 'Canada, EU plan stronger ties as trade war intensifies');
  assert.equal(trimTitle('Israel-Iran strikes continue for a third day – Reuters'), 'Israel-Iran strikes continue for a third day');
});

test('tickClock and agePhrase', () => {
  assert.equal(tickClock('2026-09-09T00:30:00Z'), '00:30 UTC');
  assert.equal(tickClock('nope'), '');
  assert.equal(agePhrase(0.4), 'just now');
  assert.equal(agePhrase(9.4), '9 min ago');
  assert.equal(agePhrase(150), '3 h ago');
});
