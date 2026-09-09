// Pure state machine for the snapshot the page reads. No React, no fetch, no import.meta: testable under node --test.
//
//           ┌──────── ok body, isSnapshot ✓, age ≤ 60 ────────┐
//           │                                                  ▼
//  loading ─┼─ ok body, isSnapshot ✓, age > 60 ───────────► stale ──(fresh tick)──► ok
//           │                                                  ▲                    │
//           ├─ 404, nothing stored ──► nodata ──(ok body)──────┘                    │
//           └─ error / isSnapshot ✗ ──► error (keeps last good) ◄──────────────────┘ (fetch fails later)
//  every minute: clock → ok may become stale; restore: a stored copy fills an empty state.

import { isSnapshot, type Snapshot } from '../../../shared/snapshot.ts';

export type Status = 'loading' | 'ok' | 'stale' | 'error' | 'nodata';
export interface SnapState { status: Status; snapshot: Snapshot | null; message?: string }
export type SnapEvent =
  | { type: 'ok'; body: unknown; now: number }
  | { type: 'notfound'; now: number }
  | { type: 'error'; message: string; now: number }
  | { type: 'restore'; body: unknown; now: number }
  | { type: 'clock'; now: number };

export const STALE_MINUTES = 60;
export const initialState: SnapState = { status: 'loading', snapshot: null };

/** Minutes since the batch time, never negative: GDELT labels can run up to ten minutes ahead of the clock. */
export function ageMinutes(snapshot: Snapshot, nowMs: number): number {
  const t = Date.parse(snapshot.tick);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (nowMs - t) / 60_000);
}

const freshness = (s: Snapshot, now: number): Status => (ageMinutes(s, now) > STALE_MINUTES ? 'stale' : 'ok');

export function reduce(state: SnapState, ev: SnapEvent): SnapState {
  switch (ev.type) {
    case 'ok':
      if (!isSnapshot(ev.body)) return { status: 'error', snapshot: state.snapshot, message: 'unexpected snapshot format' };
      return { status: freshness(ev.body, ev.now), snapshot: ev.body };
    case 'restore':
      if (state.snapshot || !isSnapshot(ev.body)) return state;
      return { status: freshness(ev.body, ev.now), snapshot: ev.body };
    case 'notfound':
      return state.snapshot ? { status: 'error', snapshot: state.snapshot, message: 'no data at the feed URL' } : { status: 'nodata', snapshot: null };
    case 'error':
      return { status: state.snapshot ? 'error' : 'error', snapshot: state.snapshot, message: ev.message };
    case 'clock':
      if (!state.snapshot || (state.status !== 'ok' && state.status !== 'stale')) return state;
      return { ...state, status: freshness(state.snapshot, ev.now) };
  }
}
