import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { isLabel, parseLabels, shown, type Label } from './labels.ts';

const ok: Label = {
  url: 'https://example.com/news/flood', title: 'Flood hits the valley', source: 'example.com', batch: '20260923124500',
  lens: 'disaster', kind: 'live', iso: null, judge: 'claude', judged_at: '2026-09-23', reason: 'on/on_topic: a flood now',
};

test('isLabel: a well-formed label passes; a wrong enum, lowercase iso, 13-digit batch or ftp url fails', () => {
  assert.equal(isLabel(ok), true);
  assert.equal(isLabel({ ...ok, iso: 'NP' }), true);
  assert.equal(isLabel({ ...ok, reason: undefined }), true, 'reason is optional');
  assert.equal(isLabel({ ...ok, lens: 'displacement' }), false);
  assert.equal(isLabel({ ...ok, kind: 'breaking' }), false);
  assert.equal(isLabel({ ...ok, judge: 'gpt' }), false);
  assert.equal(isLabel({ ...ok, iso: 'np' }), false);
  assert.equal(isLabel({ ...ok, batch: '2026092312450' }), false);
  assert.equal(isLabel({ ...ok, url: 'ftp://example.com/x' }), false);
  assert.equal(isLabel({ ...ok, url: 'https://example.com/' + 'x'.repeat(2048) }), false, 'URLs over 2 KB are refused, as in the worker');
  assert.equal(isLabel({ ...ok, judged_at: 'yesterday' }), false);
});

test('shown is derived: a live event under a lens', () => {
  assert.equal(shown(ok), true);
  assert.equal(shown({ ...ok, kind: 'commemoration' }), false, 'a 9/11 anniversary is conflict by topic, not shown');
  assert.equal(shown({ ...ok, lens: 'none' }), false);
});

test('parseLabels: a bad line 2 of 3 is reported as line 2 and the other two are returned', () => {
  const { rows, errors } = parseLabels([JSON.stringify(ok), '{"url": "https://x.example"', JSON.stringify({ ...ok, url: 'https://example.com/2' })].join('\n'));
  assert.equal(rows.length, 2);
  assert.deepEqual(errors, ['line 2: not JSON']);
  assert.deepEqual(parseLabels(JSON.stringify({ ...ok, lens: 'war' })).errors, ['line 1: not a label']);
});

test('parseLabels: a repeated batch+url+judge is an error; the same url under another judge is not', () => {
  const dup = parseLabels([ok, { ...ok, reason: 'again' }].map(l => JSON.stringify(l)).join('\n'));
  assert.deepEqual(dup.errors, ['line 2: repeats batch+url+judge']);
  assert.equal(parseLabels([ok, { ...ok, judge: 'human' }].map(l => JSON.stringify(l)).join('\n')).errors.length, 0);
});

test('every docs/labels/*.jsonl parses clean and holds only its own batch', () => {
  const dir = new URL('../docs/labels/', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  assert.ok(files.length > 0);
  for (const f of files) {
    const { rows, errors } = parseLabels(readFileSync(new URL(f, dir), 'utf8'));
    assert.deepEqual(errors, [], f);
    assert.ok(rows.length > 0, f);
    assert.ok(rows.every(r => `${r.batch}.jsonl` === f), `${f}: one file per batch id`);
  }
});
