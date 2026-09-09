import { useEffect, useMemo, useState } from 'react';
import { mixAt } from './tween.ts';

interface Anim { from: Map<string, string>; to: Map<string, string>; start: number; at: number }
const EMPTY = new Map<string, string>();

/**
 * Colours that move toward `target` over `durationMs` at 30 fps. three-globe applies cap colours immediately and
 * only tweens altitude, so the app animates. Modelled as state, never a ref read during render: when `target`
 * changes, the animation restarts from whatever was on screen (the "adjust state during render" pattern); the
 * first target snaps because there is nothing to start from; reduced-motion users always see the target.
 * The caller must keep `polygonsData` identity stable, or every frame re-tessellates the polygons.
 */
export function useTweenedColors(target: Map<string, string>, durationMs = 1500): Map<string, string> {
  const [reduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [anim, setAnim] = useState<Anim>(() => ({ from: EMPTY, to: target, start: 0, at: 1 }));

  if (anim.to !== target) {
    // A new target: start from the colours currently displayed. Keys absent from `from` snap to the target.
    setAnim({ from: anim.at >= 1 ? anim.to : mixAt(anim.from, anim.to, anim.at), to: target, start: performance.now(), at: 0 });
  }

  useEffect(() => {
    if (reduced || durationMs <= 0 || anim.at >= 1 || anim.from.size === 0) return;
    const { to, start } = anim;
    const id = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      setAnim(a => (a.to === to ? { ...a, at: t } : a));
      if (t >= 1) clearInterval(id);
    }, 1000 / 30);
    return () => clearInterval(id);
    // Restart only when a new animation starts (its start time changes), not on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim.start, durationMs, reduced]);

  return useMemo(
    () => (reduced || anim.at >= 1 || anim.from.size === 0 ? anim.to : mixAt(anim.from, anim.to, anim.at)),
    [anim, reduced],
  );
}
