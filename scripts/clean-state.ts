// scripts/clean-state.ts — re-apply the shipped filters to stored stories after a rule change.
//
//   npm run clean:state -- <dir>            # report only
//   npm run clean:state -- <dir> --write    # write *.clean.json beside them; inputs copied to *.orig.json first
//
// <dir> holds a copy of the published state.json and latest.json (git show origin/gh-pages:data/…). The rules in
// articleFrom judge incoming rows only; stories already in the per-country rings keep their old scores and their old
// mistakes, and because the ring sorts by score, inflated entries outrank correct new ones indefinitely. This applies
// the same predicates to the stored stories and nothing else: no rescoring (themes are not stored), no removal of
// anything the current rules would still accept. Every drop is printed with its URL and reason; read the list before
// publishing, because a stored story dropped here cannot be re-derived from GDELT afterwards.
//
// Publish by force-pushing the two files to gh-pages as the workflow does (one orphan commit), right after a tick
// completes (ticks fire hourly at :02); a push that lands while a tick runs is overwritten. Check latest.json
// after the next tick. First run: 2026-09-09 after #16, 34 stories dropped, 30 copies collapsed.

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { nonNewsReason, dedupeStories, migrateState, type State } from '../worker/tick.ts';
import { isSnapshot, type Snapshot, type Story } from '../shared/snapshot.ts';

const dir = process.argv[2];
const write = process.argv.includes('--write');
if (!dir) { console.error('usage: clean-state.ts <dir with state.json and latest.json> [--write]'); process.exit(2); }

const line = (iso: string, s: Story, why: string) => `${iso} s=${String(s.s ?? 0).padStart(3)} ${s.t.slice(0, 60).padEnd(60)} ${why.padEnd(5)} ${s.u}`;
// A story is held twice (the ring and the published snapshot); the set collapses the pair.
const removed = new Set<string>(), collapsed = new Set<string>();

/** Drop what the current rules reject, then collapse syndicated copies (the ring is score-ordered, first wins). */
function clean(list: Story[], iso: string): Story[] {
  const kept: Story[] = [];
  for (const s of list) {
    let path = ''; try { path = new URL(s.u).pathname; } catch { /* unparseable: the headline is still judged */ }
    const why = nonNewsReason(path, s.t);
    if (why) { removed.add(line(iso, s, why)); continue; }
    kept.push(s);
  }
  const out = dedupeStories(kept);
  for (const s of kept) if (!out.includes(s)) collapsed.add(line(iso, s, 'copy'));
  return out;
}

/** A hand-edited file is the one thing between the operator and a stalled tick: refuse anything but arrays. */
function stories<T>(where: string, v: unknown): T[] {
  if (!Array.isArray(v)) { console.error(`ABORT: ${where} is not an array; the worker would stall on it`); process.exit(1); }
  return v as T[];
}

const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as State;
const migrated = migrateState(state);   // the same load-time migration the worker runs
if (migrated) console.log(`migrated: ${migrated} stories on a removed lens dropped`);
for (const [iso, c] of Object.entries(state.countries)) c.stories = clean(stories(`state.countries.${iso}.stories`, c.stories), iso);

const snap = JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8')) as Snapshot;
for (const [iso, c] of Object.entries(snap.countries)) c.top = clean(stories(`latest.countries.${iso}.top`, c.top), iso);

console.log(`rejected by the current rules: ${removed.size}`);
[...removed].sort().forEach(r => console.log('  ' + r));
console.log(`\nsyndicated copies collapsed: ${collapsed.size}`);
[...collapsed].sort().forEach(r => console.log('  ' + r));

const left = Object.values(snap.countries).reduce((a, c) => a + c.top.length, 0);
console.log(`\nstories left in the snapshot: ${left}`);
console.log(`last_batch preserved: ${state.last_batch}`);
if (!isSnapshot(snap)) { console.error('ABORT: the cleaned snapshot fails isSnapshot'); process.exit(1); }
console.log('snapshot passes its own guard: true');

if (write) {
  for (const f of ['state', 'latest']) copyFileSync(join(dir, `${f}.json`), join(dir, `${f}.orig.json`));
  writeFileSync(join(dir, 'state.clean.json'), JSON.stringify(state));
  writeFileSync(join(dir, 'latest.clean.json'), JSON.stringify(snap));
  console.log('wrote state.clean.json and latest.clean.json; originals copied to *.orig.json');
}
