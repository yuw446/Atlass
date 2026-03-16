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

// ---------------------------------------------------------------------------
// Ocean texture — 512×512 canvas with gradient + subtle wave shimmer
// ---------------------------------------------------------------------------
function makeOceanTexture(): string {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width  = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  // Base: deep navy gradient
  const base = ctx.createLinearGradient(0, 0, S, S);
  base.addColorStop(0,   '#030d18');
  base.addColorStop(0.35,'#071828');
  base.addColorStop(0.65,'#061522');
  base.addColorStop(1,   '#040e1a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // Mid-depth colour band — faint teal tinge at equatorial latitudes
  const mid = ctx.createLinearGradient(0, S * 0.3, 0, S * 0.7);
  mid.addColorStop(0, 'rgba(0,0,0,0)');
  mid.addColorStop(0.5, 'rgba(5,30,55,0.28)');
  mid.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mid;
  ctx.fillRect(0, 0, S, S);

  // Diagonal wave shimmer lines
  ctx.save();
  ctx.rotate(Math.PI / 8);
  ctx.translate(-S * 0.5, -S * 0.1);
  for (let i = -S; i < S * 2.5; i += 9) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(12,55,110,${0.06 + Math.random() * 0.04})`;
    ctx.lineWidth = 0.8;
    for (let x = 0; x < S * 2; x += 3) {
      const y = i + Math.sin(x * 0.025 + i * 0.01) * 3.5
                  + Math.sin(x * 0.012) * 2;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Soft specular highlight — top-left sun reflection
  const spec = ctx.createRadialGradient(S * 0.3, S * 0.2, 0, S * 0.3, S * 0.2, S * 0.55);
  spec.addColorStop(0,   'rgba(20,80,160,0.18)');
  spec.addColorStop(0.5, 'rgba(10,45,90,0.08)');
  spec.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = spec;
  ctx.fillRect(0, 0, S, S);

  return canvas.toDataURL();
}

const OCEAN_TEXTURE_URL = makeOceanTexture();

// ---------------------------------------------------------------------------
// Altitude from bounding box — small countries zoom in tighter
// ---------------------------------------------------------------------------
function computeAltitude(features: GlobeFeature[], code: string): number {
  const feat = features.find(f => f.properties.ISO_A2 === code);
  if (!feat) return 1.5;

  let minLat =  Infinity, maxLat = -Infinity;
  let minLng =  Infinity, maxLng = -Infinity;

  const processCoord = (coord: number[]) => {
    if (coord[0] < minLng) minLng = coord[0];
    if (coord[0] > maxLng) maxLng = coord[0];
    if (coord[1] < minLat) minLat = coord[1];
    if (coord[1] > maxLat) maxLat = coord[1];
  };
  const processRing    = (ring: number[][])     => ring.forEach(processCoord);
  const processPoly    = (poly: number[][][])   => poly.forEach(processRing);
  const processMulti   = (multi: number[][][][])=> multi.forEach(processPoly);

  const geom = feat.geometry;
  if      (geom.type === 'Polygon')      processPoly(geom.coordinates as number[][][]);
  else if (geom.type === 'MultiPolygon') processMulti(geom.coordinates as number[][][][]);

  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const extent  = Math.max(latSpan, lngSpan);

  // Linear map: extent 2° → altitude 0.35, extent 90° → altitude 2.2
  const alt = 0.35 + (extent / 90) * 1.85;
  return Math.max(0.35, Math.min(2.4, alt));
}

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

  // Sync autoRotate to OrbitControls whenever the store value changes.
  // OrbitControls already pauses rotation during active user drag
  // (mousedown/touchstart) and resumes after, so no mouse-enter/leave
  // handlers are needed here.
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate      = autoRotate;
    controls.autoRotateSpeed = 0.3;
  }, [autoRotate]);

  // Fly camera to selected country; altitude adapts to country bounding box
  useEffect(() => {
    if (!selectedCountry || !globeRef.current) return;
    const country = countryMap.get(selectedCountry);
    if (!country?.centroid) return;
    const [lat, lng] = country.centroid;
    const altitude   = computeAltitude(features, selectedCountry);
    globeRef.current.pointOfView({ lat, lng, altitude }, 1000);
  }, [selectedCountry, countryMap, features]);

  const handleGlobeReady = useCallback(() => {
    if (!globeRef.current) return;

    globeRef.current.pointOfView({ lat: 20, lng: 15, altitude: 2.5 }, 0);

    const controls       = globeRef.current.controls();
    controls.autoRotate      = true;
    controls.autoRotateSpeed = 0.3;

    // ---- Star field --------------------------------------------------------
    const scene     = globeRef.current.scene();
    const starCount = 3000;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 450 + Math.random() * 150;
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color:            0xffffff,
      size:             0.5,
      sizeAttenuation:  false,
      transparent:      true,
      opacity:          0.72,
    });

    scene.add(new THREE.Points(geom, mat));
  }, []);

  // --- Polygon color functions ---
  const polygonCapColor = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const code       = f.properties.ISO_A2;
    const isConflict = f.properties.in_conflict ?? false;

    if (code === selectedCountry) return isConflict ? FILL_SELECTED_CONFLICT : FILL_SELECTED_PEACEFUL;
    if (code === hoveredCountry)  return isConflict ? FILL_HOVER_CONFLICT    : FILL_HOVER_PEACEFUL;
    return isConflict ? FILL_CONFLICT : FILL_PEACEFUL;
  }, [hoveredCountry, selectedCountry]);

  const polygonAltitude = useCallback((feat: object) => {
    const f    = feat as GlobeFeature;
    const unrest = f.properties.unrest_level ?? 0;
    const code   = f.properties.ISO_A2;

    if (code === selectedCountry) return 0.04;
    if (code === hoveredCountry)  return 0.02;
    return UNREST_ALTITUDE[unrest as 0 | 1 | 2 | 3];
  }, [hoveredCountry, selectedCountry]);

  // Sea-boundary highlight: bright coastal blue on hover, white-cyan on select.
  // Uses solid opaque colors so Three.js LineBasicMaterial renders them reliably.
  const polygonStrokeColor = useCallback((feat: object) => {
    const f         = feat as GlobeFeature;
    const code      = f.properties.ISO_A2;
    const flagColor = f.properties.flag_color ?? '#334466';

    if (code === selectedCountry) return '#A8DCFF';   // bright coastal cyan
    if (code === hoveredCountry)  return '#3FA8E0';   // ocean blue
    return flagColor + '66';                          // flag color at 40% opacity
  }, [hoveredCountry, selectedCountry]);

  const polygonLabel = useCallback((feat: object) => {
    const f    = feat as GlobeFeature;
    const data = f.properties.countryData;
    const name  = data?.name ?? f.properties.ADMIN ?? f.properties.ISO_A2 ?? '';
    const flag  = data?.flag ?? '';
    const inConflict  = f.properties.in_conflict ?? false;
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
  const arcColor     = useCallback((arc: object) => {
    const base = ARC_COLORS[(arc as ArcData).type];
    return [base, base];
  }, []);
  const arcStroke    = useCallback((arc: object) => (arc as ArcData).intensity * 0.6 + 0.1, []);
  const arcDashLength = useCallback(() => 0.3, []);
  const arcDashGap    = useCallback(() => 0.7, []);

  // --- Conflict markers ---
  const conflictMarkers = useMemo<ConflictMarker[]>(() => {
    return features
      .filter(f => f.properties.in_conflict && f.properties.countryData?.centroid)
      .map(f => ({
        lat:  f.properties.countryData!.centroid[0],
        lng:  f.properties.countryData!.centroid[1],
        code: f.properties.ISO_A2,
      }));
  }, [features]);

  const buildConflictElement = useCallback((_d: object): HTMLElement => {
    const el = document.createElement('div');
    el.textContent  = '⚔';
    el.style.cssText = 'font-size:14px;line-height:1;pointer-events:none;user-select:none;'
                     + 'filter:drop-shadow(0 0 4px rgba(220,50,50,0.9));opacity:0.9';
    return el;
  }, []);

  // --- Event handlers ---
  const onPolygonHover = useCallback((feat: object | null) => {
    setHoveredCountry(feat ? (feat as GlobeFeature).properties.ISO_A2 ?? null : null);
  }, [setHoveredCountry]);

  const onPolygonClick = useCallback((feat: object) => {
    const code = (feat as GlobeFeature).properties.ISO_A2;
    if (!code || code === '-99') return;
    selectCountry(code);
  }, [selectCountry]);

  const memoArcs = useMemo(() => arcs, [arcs]);

  return (
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

      polygonsData={features}
      polygonCapColor={polygonCapColor}
      polygonSideColor={() => '#080B14'}
      polygonStrokeColor={polygonStrokeColor}
      polygonAltitude={polygonAltitude}
      polygonLabel={polygonLabel}
      onPolygonHover={onPolygonHover}
      onPolygonClick={onPolygonClick}

      htmlElementsData={conflictMarkers}
      htmlElement={buildConflictElement}
      htmlLat={(d: object) => (d as ConflictMarker).lat}
      htmlLng={(d: object) => (d as ConflictMarker).lng}
      htmlAltitude={0.01}

      arcsData={memoArcs}
      arcColor={arcColor}
      arcStroke={arcStroke}
      arcDashLength={arcDashLength}
      arcDashGap={arcDashGap}
      arcDashAnimateTime={2000}
      arcAltitudeAutoScale={0.3}

      onGlobeReady={handleGlobeReady}
    />
  );
}
