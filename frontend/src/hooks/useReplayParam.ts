import { useEffect } from 'react';
import { useGlobeStore } from '../store/globeStore';

/**
 * On mount: reads ?replay=true&t={ISO_timestamp} from the URL.
 * If present: enables the GDELT hex layer, initialises the scrubber at `t`,
 * and triggers auto-play.
 *
 * Stale links (t > 24h ago) are clamped to (now - 24h) with a console warning.
 * Unparseable t values are silently ignored.
 */
export function useReplayParam(onAutoPlay?: () => void): void {
  const setActiveLayer    = useGlobeStore(s => s.setActiveLayer);
  const setHexCurrentTime = useGlobeStore(s => s.setHexCurrentTime);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('replay') !== 'true') return;

    const tParam = params.get('t');
    let t: Date | null = null;

    if (tParam) {
      const parsed = new Date(tParam);
      if (!isNaN(parsed.getTime())) {
        const now = Date.now();
        const cutoff = now - 24 * 60 * 60 * 1000;
        if (parsed.getTime() < cutoff) {
          console.warn('[Atlas] Replay link is stale — clamping to 24h ago');
          t = new Date(cutoff);
        } else {
          t = parsed;
        }
      }
    }

    setActiveLayer('gdelt-hex');
    if (t) setHexCurrentTime(t);
    onAutoPlay?.();

    // Clean URL (avoid bookmarking the replay state permanently)
    const clean = new URL(window.location.href);
    clean.searchParams.delete('replay');
    clean.searchParams.delete('t');
    window.history.replaceState(null, '', clean.toString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
