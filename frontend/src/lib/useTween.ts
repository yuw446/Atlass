import { useEffect, useMemo, useState } from 'react';
import { mixAt } from './tween.ts';

interface Anim { from: Map<string, string>; to: Map<string, string> }
const EMPTY = new Map<string, string>();

/**
 * Colours that move toward `target` over `durationMs` at 30 fps. three-globe applies cap colours immediately and
 * only tweens altitude, so the app animates. Pure during render: when `target` changes, the animation restarts from
 * whatever is on screen (the "adjust state during render" pattern) and the effect stamps the start time. The first
 * target snaps because there is nothing to start from; reduced-motion users always see the target.
 * The caller must keep `polygonsData` identity stable, or every frame re-tessellates the polygons.
 */
export function useTweenedColors(target: Map<string, string>, durationMs = 1500): Map<string, string> {
  const [reduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [anim, setAnim] = useState<Anim>(() => ({ from: EMPTY, to: target }));
  const [progress, setProgress] = useState(1);

  const displayed = useMemo(
    () => (reduced || progress >= 1 || anim.from.size === 0 ? anim.to : mixAt(anim.from, anim.to, progress)),
    [anim, progress, reduced],
  );

  if (anim.to !== target) {
    // A new target: start from the colours currently displayed. Keys absent from `from` snap to the target.
    setAnim({ from: displayed, to: target });
    setProgress(0);
  }

  useEffect(() => {
    if (reduced || durationMs <= 0 || anim.from.size === 0) return;
    const start = performance.now();
    const id = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      setProgress(t);
      if (t >= 1) clearInterval(id);
    }, 1000 / 30);
    return () => clearInterval(id);
  }, [anim, durationMs, reduced]);

  return displayed;
}
