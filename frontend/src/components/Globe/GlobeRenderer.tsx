import { useRef, useCallback, useMemo, useEffect } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import { useGlobeStore } from '../../store/globeStore';
import {
  stabilityToHex,
  lightenHex,
  stabilityToRgba,
  ARC_COLORS,
  UNREST_ALTITUDE,
} from './colorUtils';
import type { GlobeFeature, ArcData } from '../../types';

interface GlobeRendererProps {
  width: number;
  height: number;
}

export default function GlobeRenderer({ width, height }: GlobeRendererProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  const features      = useGlobeStore(s => s.features);
  const arcs          = useGlobeStore(s => s.arcs);
  const hoveredCountry  = useGlobeStore(s => s.hoveredCountry);
  const selectedCountry = useGlobeStore(s => s.selectedCountry);
  const autoRotate    = useGlobeStore(s => s.autoRotate);

  // Stable action references from store — safe to use inside Globe.gl callbacks
  const setHoveredCountry = useGlobeStore(s => s.setHoveredCountry);
  const selectCountry     = useGlobeStore(s => s.selectCountry);
  const setAutoRotate     = useGlobeStore(s => s.setAutoRotate);

  // Sync auto-rotation state to Globe.gl controls
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.3;
  }, [autoRotate]);

  // Set initial camera position once on mount
  const handleGlobeReady = useCallback(() => {
    if (!globeRef.current) return;
    globeRef.current.pointOfView({ lat: 20, lng: 15, altitude: 2.5 }, 0);
    const controls = globeRef.current.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
  }, []);

  // --- Polygon color functions ---
  // These must be stable and NOT close over React state.
  // They read from the feature's own properties (set during GeoJSON enrichment).

  const polygonCapColor = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const score = f.properties.stability_score ?? 50;
    const code  = f.properties.ISO_A2;

    if (code === selectedCountry) return lightenHex(stabilityToHex(score), 0.35);
    if (code === hoveredCountry)  return lightenHex(stabilityToHex(score), 0.2);
    return stabilityToRgba(score, 0.88);
  }, [hoveredCountry, selectedCountry]);

  const polygonAltitude = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const unrest = f.properties.unrest_level ?? 0;
    const code   = f.properties.ISO_A2;

    // Selected country floats higher for emphasis
    if (code === selectedCountry) return 0.04;
    // Hovered country slightly lifted
    if (code === hoveredCountry)  return 0.02;
    // Unrest level drives base altitude (Phase 1 substitute for pulse shader)
    return UNREST_ALTITUDE[unrest as 0 | 1 | 2 | 3];
  }, [hoveredCountry, selectedCountry]);

  const polygonStrokeColor = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const score = f.properties.stability_score ?? 50;
    const code  = f.properties.ISO_A2;

    if (code === selectedCountry) return '#ffffff';
    if (code === hoveredCountry)  return 'rgba(255,255,255,0.6)';
    // Stable → cool border, volatile → warm border
    return score > 60 ? '#1a3a5c' : score > 30 ? '#3a2a0a' : '#3a0a0a';
  }, [hoveredCountry, selectedCountry]);

  const polygonLabel = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const data = f.properties.countryData;
    const name  = data?.name ?? f.properties.ADMIN ?? f.properties.ISO_A2 ?? '';
    const score = f.properties.stability_score ?? 50;
    const flag  = data?.flag ?? '';
    return `
      <div style="
        background: rgba(8,11,20,0.92);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 4px;
        padding: 8px 12px;
        font-family: 'Space Mono', monospace;
        color: #e8ecf4;
        pointer-events: none;
      ">
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.6;margin-bottom:4px;">
          ${flag} ${name}
        </div>
        <div style="font-size:13px;font-weight:600;color:${stabilityToHex(score)}">
          Stability: ${score}/100
        </div>
      </div>
    `;
  }, []);

  // --- Arc color functions ---
  const arcColor = useCallback((arc: object) => {
    const a = arc as ArcData;
    const base = ARC_COLORS[a.type];
    return [base, base]; // [start color, end color]
  }, []);

  const arcStroke = useCallback((arc: object) => {
    return (arc as ArcData).intensity * 0.6 + 0.1;
  }, []);

  const arcDashLength = useCallback(() => 0.3, []);
  const arcDashGap    = useCallback(() => 0.7, []);

  // --- Event handlers ---
  // Use Zustand setters directly — no stale closure risk since setters are stable

  const onPolygonHover = useCallback((feat: object | null) => {
    if (!feat) {
      setHoveredCountry(null);
      return;
    }
    const f = feat as GlobeFeature;
    setHoveredCountry(f.properties.ISO_A2 ?? null);
  }, [setHoveredCountry]);

  const onPolygonClick = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const code = f.properties.ISO_A2;
    if (!code || code === '-99') return;
    selectCountry(code);
  }, [selectCountry]);

  // Pause auto-rotate on any mouse interaction with globe
  const onMouseEnter = useCallback(() => {
    setAutoRotate(false);
  }, [setAutoRotate]);

  const onMouseLeave = useCallback(() => {
    setAutoRotate(true);
  }, [setAutoRotate]);

  // Memoize arc data — prevent Globe.gl from re-rendering arcs on every render
  const memoArcs = useMemo(() => arcs, [arcs]);

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ width, height }}
    >
      <Globe
        ref={globeRef}
        width={width}
        height={height}
        globeImageUrl=""
        backgroundColor="rgba(0,0,0,0)"
        showGraticules={false}
        showAtmosphere={true}
        atmosphereColor="#1a3a5c"
        atmosphereAltitude={0.18}

        // --- L1: Nation fill color ---
        polygonsData={features}
        polygonCapColor={polygonCapColor}
        polygonSideColor={() => '#080B14'}
        polygonStrokeColor={polygonStrokeColor}
        polygonAltitude={polygonAltitude}
        polygonLabel={polygonLabel}
        onPolygonHover={onPolygonHover}
        onPolygonClick={onPolygonClick}

        // --- L3: Relationship arcs ---
        arcsData={memoArcs}
        arcColor={arcColor}
        arcStroke={arcStroke}
        arcDashLength={arcDashLength}
        arcDashGap={arcDashGap}
        arcDashAnimateTime={2000}
        arcAltitudeAutoScale={0.3}

        onGlobeReady={handleGlobeReady}
      />
    </div>
  );
}
