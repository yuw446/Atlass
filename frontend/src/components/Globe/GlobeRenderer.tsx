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
  STATUS_FILLS,
  STATUS_HOVER_FILLS,
  STATUS_SELECTED_FILLS,
} from './colorUtils';
import type { GlobeFeature, ArcData, ConflictStatus, GdeltEvent } from '../../types';

// ---------------------------------------------------------------------------
// Civ strategic globe material — satellite texture + desaturation shader
// ---------------------------------------------------------------------------
const STRATEGIC_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STRATEGIC_FRAG = /* glsl */`
  uniform sampler2D globeTexture;
  uniform sampler2D bumpTexture;
  uniform float saturation;
  uniform vec3 colorGrade;
  uniform float bumpStrength;
  varying vec2 vUv;

  void main() {
    vec4 color = texture2D(globeTexture, vUv);

    // Desaturate
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    vec3 desaturated = mix(vec3(luma), color.rgb, saturation);

    // Cool-olive strategic color grade
    desaturated *= colorGrade;

    // Terrain relief via derivative-based bump (screen-space UV offset, WebGL 1 safe)
    float bumpCenter = texture2D(bumpTexture, vUv).r;
    float bumpDx = texture2D(bumpTexture, vUv + vec2(0.001, 0.0)).r - bumpCenter;
    float bumpDy = texture2D(bumpTexture, vUv + vec2(0.0, 0.001)).r - bumpCenter;
    float bumpLight = 1.0 + (bumpDx + bumpDy) * bumpStrength * 3.0;
    bumpLight = clamp(bumpLight, 0.6, 1.4);
    desaturated *= bumpLight;

    gl_FragColor = vec4(desaturated, 1.0);
  }
`;

function createStrategicGlobeMaterial(): THREE.ShaderMaterial {
  const loader = new THREE.TextureLoader();
  const satelliteTexture = loader.load('/textures/earth-blue-marble.jpg');
  const topologyTexture  = loader.load('/textures/earth-topology.png');
  satelliteTexture.minFilter = THREE.LinearMipmapLinearFilter;
  topologyTexture.minFilter  = THREE.LinearMipmapLinearFilter;

  return new THREE.ShaderMaterial({
    uniforms: {
      globeTexture: { value: satelliteTexture },
      bumpTexture:  { value: topologyTexture },
      saturation:   { value: 0.45 },
      colorGrade:   { value: new THREE.Vector3(0.88, 0.92, 0.82) },
      bumpStrength: { value: 0.8 },
    },
    vertexShader:   STRATEGIC_VERT,
    fragmentShader: STRATEGIC_FRAG,
  });
}

const STRATEGIC_MATERIAL = createStrategicGlobeMaterial();

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
// Bounding-box helpers — shared by centroid fallback + altitude computation
// ---------------------------------------------------------------------------
interface Bounds { minLat: number; maxLat: number; minLng: number; maxLng: number }

function getFeatureBounds(features: GlobeFeature[], code: string): Bounds | null {
  const feat = features.find(f => f.properties.ISO_A2 === code);
  if (!feat) return null;

  let minLat =  Infinity, maxLat = -Infinity;
  let minLng =  Infinity, maxLng = -Infinity;

  const pt  = (c: number[]) => {
    if (c[0] < minLng) minLng = c[0]; if (c[0] > maxLng) maxLng = c[0];
    if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
  };
  const ring  = (r: number[][])     => r.forEach(pt);
  const poly  = (p: number[][][])   => p.forEach(ring);
  const multi = (m: number[][][][]) => m.forEach(poly);

  const g = feat.geometry;
  if      (g.type === 'Polygon')      poly(g.coordinates  as number[][][]);
  else if (g.type === 'MultiPolygon') multi(g.coordinates as number[][][][]);

  return isFinite(minLat) ? { minLat, maxLat, minLng, maxLng } : null;
}

function computeAltitude(features: GlobeFeature[], code: string): number {
  const b = getFeatureBounds(features, code);
  if (!b) return 1.5;
  const extent = Math.max(b.maxLat - b.minLat, b.maxLng - b.minLng);
  // extent 2° → alt ~0.4   |   extent 90° → alt ~2.2
  return Math.max(0.35, Math.min(2.4, 0.35 + (extent / 90) * 1.85));
}

function computeCentroid(features: GlobeFeature[], code: string): [number, number] | null {
  const b = getFeatureBounds(features, code);
  if (!b) return null;
  return [(b.minLat + b.maxLat) / 2, (b.minLng + b.maxLng) / 2];
}

// ---------------------------------------------------------------------------
// GDELT hex bin helpers
// ---------------------------------------------------------------------------

/** GDELT SQLDATE is YYYYMMDD. Convert to epoch ms (noon UTC on that day). */
function parseGdeltDate(sqldate: string): number {
  if (sqldate.length < 8) return 0;
  const y = parseInt(sqldate.slice(0, 4), 10);
  const m = parseInt(sqldate.slice(4, 6), 10) - 1;
  const d = parseInt(sqldate.slice(6, 8), 10);
  return Date.UTC(y, m, d, 12, 0, 0);
}

/** Map GDELT EventRootCode to a hex bin fill color. */
function hexEventColor(code: number, alpha = 0.85): string {
  if (code >= 18) return `rgba(192,57,43,${alpha})`;   // assault/fight/mass violence — crimson
  if (code >= 14) return `rgba(230,126,34,${alpha})`;  // protest/force/coerce — amber
  if (code >= 10) return `rgba(142,68,173,${alpha})`;  // demand/disapprove/threaten — purple
  if (code >= 2 && code <= 5) return `rgba(26,82,118,${alpha})`; // diplomatic — steel blue
  return `rgba(13,24,41,${alpha})`;                    // default — dark navy
}

export default function GlobeRenderer({ width, height }: GlobeRendererProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  const features        = useGlobeStore(s => s.features);
  const arcs            = useGlobeStore(s => s.arcs);
  const countryMap      = useGlobeStore(s => s.countryMap);
  const hoveredCountry  = useGlobeStore(s => s.hoveredCountry);
  const selectedCountry = useGlobeStore(s => s.selectedCountry);
  const autoRotate      = useGlobeStore(s => s.autoRotate);
  const activeLayer     = useGlobeStore(s => s.activeLayer);
  const gdeltEvents     = useGlobeStore(s => s.gdeltEvents);
  const hexCurrentTime  = useGlobeStore(s => s.hexCurrentTime);

  const setHoveredCountry = useGlobeStore(s => s.setHoveredCountry);
  const selectCountry     = useGlobeStore(s => s.selectCountry);

  // Sync autoRotate to OrbitControls
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate      = autoRotate;
    controls.autoRotateSpeed = 0.3;
  }, [autoRotate]);

  // Fly camera to selected country.
  // Prefers hardcoded centroid (hand-tuned); falls back to GeoJSON bbox centre
  // so any country in the GeoJSON (e.g. Cuba, Bahamas) is handled.
  useEffect(() => {
    if (!selectedCountry || !globeRef.current) return;
    const hardcoded = countryMap.get(selectedCountry);
    const centroid  = hardcoded?.centroid ?? computeCentroid(features, selectedCountry);
    if (!centroid) return;
    const [lat, lng] = centroid;
    globeRef.current.pointOfView({ lat, lng, altitude: computeAltitude(features, selectedCountry) }, 1000);
  }, [selectedCountry, countryMap, features]);

  const handleGlobeReady = useCallback(() => {
    if (!globeRef.current) return;

    globeRef.current.pointOfView({ lat: 20, lng: 15, altitude: 2.5 }, 0);

    const controls       = globeRef.current.controls();
    controls.autoRotate      = true;
    controls.autoRotateSpeed = 0.3;

    const scene = globeRef.current.scene();

    // ---- Semi-transparent ocean layer ------------------------------------
    // Sits at radius 100.2 (slightly above globe sphere at 100).
    // Transparent, depth-tested: only renders over bare globe (ocean areas),
    // not over country polygons which are at altitude 0.005+ (radius 100.5+).
    const oceanMesh = new THREE.Mesh(
      new THREE.SphereGeometry(100.2, 64, 64),
      new THREE.MeshBasicMaterial({
        color:       new THREE.Color(0x0a1e1e),  // dark teal — Civ ocean
        transparent: true,
        opacity:     0.58,
        depthWrite:  false,
      }),
    );
    scene.add(oceanMesh);

    // ---- Star field -------------------------------------------------------
    const N   = 3000;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 450 + Math.random() * 150;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(starGeom, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.5, sizeAttenuation: false,
      transparent: true, opacity: 0.72,
    })));
  }, []);

  // --- Polygon color functions ---
  const polygonCapColor = useCallback((feat: object) => {
    const f = feat as GlobeFeature;
    const code   = f.properties.ISO_A2;
    const status = (f.properties.countryData?.conflict_status ?? (f.properties.in_conflict ? 'active_conflict' : 'peaceful')) as ConflictStatus;
    if (code === selectedCountry) return STATUS_SELECTED_FILLS[status];
    if (code === hoveredCountry)  return STATUS_HOVER_FILLS[status];
    return STATUS_FILLS[status];
  }, [hoveredCountry, selectedCountry]);

  const polygonAltitude = useCallback((feat: object) => {
    const f    = feat as GlobeFeature;
    const code = f.properties.ISO_A2;
    if (code === selectedCountry) return 0.04;
    if (code === hoveredCountry)  return 0.02;
    return UNREST_ALTITUDE[(f.properties.unrest_level ?? 0) as 0 | 1 | 2 | 3];
  }, [hoveredCountry, selectedCountry]);

  // Coastline / sea-boundary borders — always visible, brighter on interaction
  const polygonStrokeColor = useCallback((feat: object) => {
    const code = (feat as GlobeFeature).properties.ISO_A2;
    if (code === selectedCountry) return '#A8DCFF';          // bright coastal cyan
    if (code === hoveredCountry)  return '#3FA8E0';          // ocean blue
    return 'rgba(80, 150, 220, 0.45)';                       // always-on thin coastline
  }, [hoveredCountry, selectedCountry]);

  const polygonLabel = useCallback((feat: object) => {
    const f    = feat as GlobeFeature;
    const data = f.properties.countryData;
    const name = data?.name ?? f.properties.ADMIN ?? f.properties.ISO_A2 ?? '';
    const flag = data?.flag ?? '';
    const status = data?.conflict_status ?? (f.properties.in_conflict ? 'active_conflict' : 'peaceful');
    const STATUS_LABEL: Record<string, string> = {
      active_conflict:    'ACTIVE CONFLICT',
      military_operation: 'MILITARY OPERATION',
      impacted:           'CONFLICT IMPACTED',
      civil_unrest:       'CIVIL UNREST',
      ceasefire:          'CEASEFIRE',
      peaceful:           'NO ACTIVE CONFLICT',
    };
    const STATUS_COLOR: Record<string, string> = {
      active_conflict:    '#e05050',
      military_operation: '#e07030',
      impacted:           '#d4a030',
      civil_unrest:       '#c060c0',
      ceasefire:          '#60a0d0',
      peaceful:           '#4ab870',
    };
    const statusLabel = STATUS_LABEL[status] ?? 'UNKNOWN';
    const statusColor = STATUS_COLOR[status] ?? '#aaa';
    return `<div style="
        background:rgba(8,11,20,0.92);border:1px solid rgba(255,255,255,0.12);
        border-radius:4px;padding:8px 12px;font-family:'Space Mono',monospace;
        color:#e8ecf4;pointer-events:none;">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px;">${flag} ${name}</div>
      <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${statusColor};">${statusLabel}</div>
    </div>`;
  }, []);

  // --- Arc functions ---
  const arcColor      = useCallback((a: object) => { const c = ARC_COLORS[(a as ArcData).type]; return [c, c]; }, []);
  const arcStroke     = useCallback((a: object) => (a as ArcData).intensity * 0.6 + 0.1, []);
  const arcDashLength = useCallback(() => 0.3, []);
  const arcDashGap    = useCallback(() => 0.7, []);

  // --- Conflict markers ---
  const conflictMarkers = useMemo<ConflictMarker[]>(() =>
    features
      .filter(f => f.properties.in_conflict && f.properties.countryData?.centroid)
      .map(f => ({
        lat:  f.properties.countryData!.centroid[0],
        lng:  f.properties.countryData!.centroid[1],
        code: f.properties.ISO_A2,
      })),
  [features]);

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

  // --- Hex bin layer (GDELT events) ---
  // Filter events by current scrubber time (if set); show all if null
  const hexData = useMemo<GdeltEvent[]>(() => {
    if (activeLayer !== 'gdelt-hex') return [];
    if (!hexCurrentTime) return gdeltEvents;
    // Show events from (hexCurrentTime - 24h) to hexCurrentTime
    const cutoff = hexCurrentTime.getTime() - 24 * 60 * 60 * 1000;
    return gdeltEvents.filter(e => {
      const ts = parseGdeltDate(e.timestamp);
      return ts >= cutoff && ts <= hexCurrentTime.getTime();
    });
  }, [activeLayer, gdeltEvents, hexCurrentTime]);

  const hexAltitude = useCallback((hex: object) => {
    // Height based on sumWeight (conflict intensity); age-decay if scrubber active
    const h = hex as { sumWeight: number };
    const base = Math.min(0.005 + h.sumWeight * 0.004, 0.15);
    return base;
  }, []);

  const hexTopColor = useCallback((hex: object) => {
    const h = hex as { points: GdeltEvent[] };
    // Use the highest-severity event code to determine color
    const maxCode = h.points.reduce((mx, e) => Math.max(mx, e.eventCode), 0);
    return hexEventColor(maxCode);
  }, []);

  const hexSideColor = useCallback((hex: object) => {
    const h = hex as { points: GdeltEvent[] };
    const maxCode = h.points.reduce((mx, e) => Math.max(mx, e.eventCode), 0);
    return hexEventColor(maxCode, 0.6);
  }, []);

  const onHexClick = useCallback((hex: object) => {
    const h = hex as { center: { lat: number; lng: number }; points: GdeltEvent[] };
    // Dispatch a custom event so App can open the hex digest panel
    window.dispatchEvent(new CustomEvent('atlas:hex-click', {
      detail: { lat: h.center.lat, lon: h.center.lng, pointCount: h.points.length },
    }));
  }, []);

  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      globeMaterial={STRATEGIC_MATERIAL}
      backgroundColor="rgba(4,6,12,1)"
      showGraticules={false}
      showAtmosphere={true}
      atmosphereColor="#142e2e"
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

      hexBinPointsData={hexData}
      hexBinPointLat={(d: object) => (d as GdeltEvent).lat}
      hexBinPointLng={(d: object) => (d as GdeltEvent).lon}
      hexBinPointWeight={(d: object) => Math.abs((d as GdeltEvent).goldstein)}
      hexBinResolution={3}
      hexMargin={0.2}
      hexAltitude={hexAltitude}
      hexTopColor={hexTopColor}
      hexSideColor={hexSideColor}
      onHexClick={onHexClick}

      onGlobeReady={handleGlobeReady}
    />
  );
}
