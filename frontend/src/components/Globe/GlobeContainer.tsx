import { useRef, useState, useEffect } from 'react';
import GlobeRenderer from './GlobeRenderer';

interface GlobeContainerProps {
  /** Width to subtract when the story panel is open (px) */
  panelWidth?: number;
}

export default function GlobeContainer({ panelWidth = 0 }: GlobeContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // The globe chunk loads lazily and can mount while the tab is hidden or still laying out, in which case the
    // observer's first reading is 0×0 and, in some hosts, never fires again. Measure on mount, ignore zero
    // readings, and also listen for window resizes so a late layout still mounts the renderer.
    const apply = (width: number, height: number) => {
      if (width > 0 && height > 0) setDimensions({ width: Math.max(0, width - panelWidth), height });
    };
    const measure = () => { const r = el.getBoundingClientRect(); apply(r.width, r.height); };
    const observer = new ResizeObserver(entries => { for (const e of entries) apply(e.contentRect.width, e.contentRect.height); });
    observer.observe(el);
    measure();
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [panelWidth]);

  return (
    <div ref={containerRef} className="globe-container w-full h-full">
      {dimensions.width > 0 && <GlobeRenderer width={dimensions.width} height={dimensions.height} />}
    </div>
  );
}
