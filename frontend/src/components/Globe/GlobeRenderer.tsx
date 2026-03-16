import { useRef, useCallback, useMemo, useEffect } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useGlobeStore } from '../../store/globeStore';
import {
  ARC_COLORS,
  UNREST_ALTITUDE,
  FILL_CONFLICT,
  FILL_PEACEFUL,
  FILL_HOVER_CONFLICT,
  FILL_HOVER_PEACEFUL,
  FILL_SELECTED_CONFLICT,
  FILL_SELECTED_PEACEFUL,
} from './colorUtils';
import type { GlobeFeature, ArcData } from '../../types';

interface GlobeRendererProps {
  width: number;
  height: number;
}

interface ConflictMarker {
  lat: number;
  lng: number;
  code: string;
}

// Generate a solid-color canvas texture for the ocean surface
function makeOceanTexture(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#061828';
  ctx.fillRect(0, 0, 2, 2);
  return canvas.toDataURL();
}

const OCEAN_TEXTURE_URL = makeOceanTexture();

// Stroke colors: sea-boundary look — light coastal blue on hover/select
const STROKE_BASE     = '70'; // hex alpha suffix for flag color at rest
const STROKE_HOVER    = 'rgba(80, 160, 220, 0.85)';
const STROKE_SELECTED = 'rgba(140, 210, 255, 0.95)';

export default function GlobeRenderer({ width, height }: GlobeRendererProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  const features        = useGlobeStore(s => s.features);
  const arcs            = useGlobeStore(s => s.arcs);
  const countryMap      = useGlobeStore(s => s.countryMap);
  const hoveredCountry  = useGlobeStore(s => s.hoveredCountry);
  const selectedCountry = useGlobeStore(s => s.selectedCountry);
  const autoRotate      = useGlobeStore(s => s.autoRotate);

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

  // Fly camera to selected country centroid
  useEffect(() => {
    if (!selectedCountry || !globeRef.current) return;
    const country = countryMap.get(selectedCountry);
    if (!country?.centroid) return;
    const [lat, lng] = country.centroid;
    globeRef.current.pointOfView({ lat, lng, altitude: 1.5 }, 1000);
  }, [selectedCountry, countryMap]);

  const handleGlobeReady = useCallback(() => {
    if (!globeRef.current) return;

    // Initial camera position
    globeRef.current.pointOfView({ lat: 20, lng: 15, altitude: 2.5 }, 0);

    // Start auto-rotate
    const controls = globeRef.current.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;

    // Add star field to Three.js scene
    const scene = globeRef.current.scene();
    const starCount = 3000;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 400 + Math.random() * 200;
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.75,
    });
    scene.add(new THREE.Points(geom, mat));
  }, []);

  // --- Polygon color functions ---
  const polygonCapColor = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const code = f.properties.ISO_A2;
    const isConflict = f.properties.in_conflict ?? false;

    if (code === selectedCountry) return isConflict ? FILL_SELECTED_CONFLICT : FILL_SELECTED_PEACEFUL;
    if (code === hoveredCountry)  return isConflict ? FILL_HOVER_CONFLICT    : FILL_HOVER_PEACEFUL;
    return isConflict ? FILL_CONFLICT : FILL_PEACEFUL;
  }, [hoveredCountry, selectedCountry]);

  const polygonAltitude = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const unrest = f.properties.unrest_level ?? 0;
    const code   = f.properties.ISO_A2;

    if (code === selectedCountry) return 0.04;
    if (code === hoveredCountry)  return 0.02;
    return UNREST_ALTITUDE[unrest as 0 | 1 | 2 | 3];
  }, [hoveredCountry, selectedCountry]);

  // Coastal/sea boundary highlight on hover and select
  const polygonStrokeColor = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const code      = f.properties.ISO_A2;
    const flagColor = f.properties.flag_color ?? '#334466';

    if (code === selectedCountry) return STROKE_SELECTED;
    if (code === hoveredCountry)  return STROKE_HOVER;
    return flagColor + STROKE_BASE;
  }, [hoveredCountry, selectedCountry]);

  const polygonLabel = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const data = f.properties.countryData;
    const name  = data?.name ?? f.properties.ADMIN ?? f.properties.ISO_A2 ?? '';
    const flag  = data?.flag ?? '';
    const inConflict = f.properties.in_conflict ?? false;
    const statusColor = inConflict ? '#e05050' : '#4a9a6a';
    const statusLabel = inConflict ? 'ACTIVE CONFLICT' : 'NO ACTIVE CONFLICT';
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
        <div style="font-size:12px;font-weight:600;margin-bottom:4px;">
          ${flag} ${name}
        </div>
        <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${statusColor};">
          ${statusLabel}
        </div>
      </div>
    `;
  }, []);

  // --- Arc color functions ---
  const arcColor = useCallback((arc: object) => {
    const a = arc as ArcData;
    const base = ARC_COLORS[a.type];
    return [base, base];
  }, []);

  const arcStroke = useCallback((arc: object) => {
    return (arc as ArcData).intensity * 0.6 + 0.1;
  }, []);

  const arcDashLength = useCallback(() => 0.3, []);
  const arcDashGap    = useCallback(() => 0.7, []);

  // --- Conflict markers ---
  const conflictMarkers = useMemo<ConflictMarker[]>(() => {
    return features
      .filter(f => f.properties.in_conflict && f.properties.countryData?.centroid)
      .map(f => ({
        lat: f.properties.countryData!.centroid[0],
        lng: f.properties.countryData!.centroid[1],
        code: f.properties.ISO_A2,
      }));
  }, [features]);

  const buildConflictElement = useCallback((_d: object): HTMLElement => {
    const el = document.createElement('div');
    el.textContent = '⚔';
    el.style.cssText = [
      'font-size: 14px',
      'line-height: 1',
      'pointer-events: none',
      'user-select: none',
      'filter: drop-shadow(0 0 4px rgba(220, 50, 50, 0.9))',
      'opacity: 0.9',
    ].join(';');
    return el;
  }, []);

  // --- Event handlers ---
  const onPolygonHover = useCallback((feat: object | null) => {
    if (!feat) { setHoveredCountry(null); return; }
    const f = feat as GlobeFeature;
    setHoveredCountry(f.properties.ISO_A2 ?? null);
  }, [setHoveredCountry]);

  const onPolygonClick = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const code = f.properties.ISO_A2;
    if (!code || code === '-99') return;
    selectCountry(code);
  }, [selectCountry]);

  // Only resume auto-rotate on mouse leave if no country is selected
  const onMouseEnter = useCallback(() => setAutoRotate(false), [setAutoRotate]);
  const onMouseLeave = useCallback(() => {
    if (!selectedCountry) setAutoRotate(true);
  }, [setAutoRotate, selectedCountry]);

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
        globeImageUrl={OCEAN_TEXTURE_URL}
        backgroundColor="rgba(4,6,12,1)"
        showGraticules={false}
        showAtmosphere={true}
        atmosphereColor="#1a3a5c"
        atmosphereAltitude={0.18}

        // --- L1: Nation fill — conflict vs peaceful ---
        polygonsData={features}
        polygonCapColor={polygonCapColor}
        polygonSideColor={() => '#080B14'}
        polygonStrokeColor={polygonStrokeColor}
        polygonAltitude={polygonAltitude}
        polygonLabel={polygonLabel}
        onPolygonHover={onPolygonHover}
        onPolygonClick={onPolygonClick}

        // --- L2: Conflict markers ---
        htmlElementsData={conflictMarkers}
        htmlElement={buildConflictElement}
        htmlLat={(d: object) => (d as ConflictMarker).lat}
        htmlLng={(d: object) => (d as ConflictMarker).lng}
        htmlAltitude={0.01}

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
