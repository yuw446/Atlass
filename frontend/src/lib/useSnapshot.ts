import { useEffect } from 'react';
import { useGlobeStore } from '../store/globeStore';

const KEY = 'atlas.snapshot.v1';
const POLL_MS = 60_000;

/**
 * Fetches data/latest.json (same origin as the page) on mount and every minute, restores the last good copy from
 * localStorage first so a reload during an outage still shows a globe, and ticks the clock so "ok" can age into
 * "stale". All state transitions live in snapshotState.ts. Called from App so it overlaps the globe chunk download.
 */
export function useSnapshot() {
  const dispatch = useGlobeStore(s => s.dispatchSnap);

  useEffect(() => {
    let alive = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) dispatch({ type: 'restore', body: JSON.parse(raw), now: Date.now() });
    } catch { /* private mode, quota, or junk: the live fetch decides */ }

    const url = `${import.meta.env.BASE_URL}data/latest.json`;
    const load = async () => {
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (!alive) return;
        if (r.status === 404) { dispatch({ type: 'notfound', now: Date.now() }); return; }
        if (!r.ok) { dispatch({ type: 'error', message: `HTTP ${r.status}`, now: Date.now() }); return; }
        const body: unknown = await r.json();
        if (!alive) return;
        dispatch({ type: 'ok', body, now: Date.now() });
        try { localStorage.setItem(KEY, JSON.stringify(body)); } catch { /* ignore */ }
      } catch (e) {
        if (alive) dispatch({ type: 'error', message: e instanceof Error ? e.message : String(e), now: Date.now() });
      }
    };

    void load();
    const poll = setInterval(() => { void load(); }, POLL_MS);
    const clock = setInterval(() => dispatch({ type: 'clock', now: Date.now() }), 60_000);
    return () => { alive = false; clearInterval(poll); clearInterval(clock); };
  }, [dispatch]);
}
