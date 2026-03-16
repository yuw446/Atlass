import { useRef, useState, useEffect } from 'react';
import GlobeRenderer from './GlobeRenderer';
import { useGlobeData } from './useGlobeData';

interface GlobeContainerProps {
  /** Width offset to subtract when the digest panel is open (px) */
  panelWidth?: number;
}

export default function GlobeContainer({ panelWidth = 0 }: GlobeContainerProps) {
  useGlobeData(); // Loads GeoJSON + hardcoded data into store

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(0, width - panelWidth),
          height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [panelWidth]);

  return (
    <div ref={containerRef} className="globe-container w-full h-full">
      {dimensions.width > 0 && (
        <GlobeRenderer width={dimensions.width} height={dimensions.height} />
      )}
    </div>
  );
}
