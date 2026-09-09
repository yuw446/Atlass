import { useRef, useCallback, useMemo, useEffect } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useGlobeStore } from '../../store/globeStore';
import { lighten, withAlpha } from '../../lib/color.ts';
import { fillFor, fillAlphaFor, UNLIT_ALPHA } from '../../lib/fill.ts';
import { useTweenedColors } from '../../lib/useTween.ts';
import { attentionWords } from '../../lib/text.ts';
import { LENSES, BASE_NAVY } from '../../../../shared/lenses.ts';
import type { GlobeFeature } from '../../types';

interface GlobeRendererProps { width: number; height: number }
interface Spark { lat: number; lng: number; lens: number }

// NASA Blue Marble (daylight) surface, served with the GeoJSON (preloaded from index.html). Country caps are
// translucent so the imagery reads through them: unlit countries take a light navy tint, lensed countries take their
// lens colour at an alpha that rises with attention (see fill.ts).
const EARTH_TEXTURE_URL = `${import.meta.env.BASE_URL}geo/earth-blue-marble.jpg`;
const UNLIT_FILL = withAlpha(BASE_NAVY, UNLIT_ALPHA);

interface Bounds { minLat: number; maxLat: number; minLng: number; maxLng: number }
function boundsOf(feat: GlobeFeature): Bounds | null {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  const pt = (c: number[]) => { if (c[0] < minLng) minLng = c[0]; if (c[0] > maxLng) maxLng = c[0]; if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1]; };
  const g = feat.geometry;
  if (g.type === 'Polygon') (g.coordinates as number[][][]).forEach(r => r.forEach(pt));
  else if (g.type === 'MultiPolygon') (g.coordinates as number[][][][]).forEach(p => p.forEach(r => r.forEach(pt)));
  return Number.isFinite(minLat) ? { minLat, maxLat, minLng, maxLng } : null;
}

const codeOf = (feat: object) => (feat as GlobeFeature).properties.code ?? '';

export default function GlobeRenderer({ width, height }: GlobeRendererProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  const features        = useGlobeStore(s => s.features);
  const names           = useGlobeStore(s => s.names);
  const snapshot        = useGlobeStore(s => s.snap.snapshot);
  const lensFilter      = useGlobeStore(s => s.lensFilter);
  const hoveredCountry  = useGlobeStore(s => s.hoveredCountry);
  const selectedCountry = useGlobeStore(s => s.selectedCountry);
  const autoRotate      = useGlobeStore(s => s.autoRotate);
  const setHoveredCountry = useGlobeStore(s => s.setHoveredCountry);
  const selectCountry     = useGlobeStore(s => s.selectCountry);

  // Target fill per country as rgba: recomputed only when the snapshot or the lens filter changes. `features` never
  // changes identity after load, so the polygon data-join is never re-run by a colour update. The tween interpolates
  // the alpha along with the colour (d3's LAB interpolator carries opacity).
  const target = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of features) {
      const code = f.properties.code;
      if (!code) continue;
      const c = snapshot?.countries[code];
      m.set(code, withAlpha(fillFor(c, lensFilter), fillAlphaFor(c, lensFilter)));
    }
    return m;
  }, [features, snapshot, lensFilter]);
  const displayed = useTweenedColors(target);

  const sparks = useMemo<Spark[]>(() =>
    (snapshot?.sparks ?? [])
      .filter(([, , l]) => lensFilter === null || l === lensFilter)
      .map(([lat, lng, lens]) => ({ lat, lng, lens })),
  [snapshot, lensFilter]);

  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.3;
  }, [autoRotate]);

  useEffect(() => {
    if (!selectedCountry || !globeRef.current) return;
    const feat = features.find(f => f.properties.code === selectedCountry);
    const b = feat && boundsOf(feat);
    if (!b) return;
    const extent = Math.max(b.maxLat - b.minLat, b.maxLng - b.minLng);
    const altitude = Math.max(0.35, Math.min(2.4, 0.35 + (extent / 90) * 1.85));
    globeRef.current.pointOfView({ lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2, altitude }, 1000);
  }, [selectedCountry, features]);

  // One-time scene setup on mount. Not in `onGlobeReady`: three-globe fires that only after the texture download
  // succeeds, and a lost 770 KB request would otherwise silently leave the scene without stars or a starting view.
  // react-globe.gl builds the globe in a layout effect, so the ref is populated by the time this effect runs.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointOfView({ lat: 20, lng: 15, altitude: 2.5 }, 0);
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    const scene = globe.scene();
    const N = 3000, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2, phi = Math.acos(2 * Math.random() - 1), r = 450 + Math.random() * 150;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta); pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta); pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const stars = new THREE.BufferGeometry();
    stars.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, sizeAttenuation: false, transparent: true, opacity: 0.72 })));
  }, []);

  const polygonCapColor = useCallback((feat: object) => {
    const code = codeOf(feat);
    const base = displayed.get(code) ?? UNLIT_FILL;
    if (code === selectedCountry) return lighten(base, 0.3);
    if (code === hoveredCountry) return lighten(base, 0.15);
    return base;
  }, [displayed, hoveredCountry, selectedCountry]);

  const polygonAltitude = useCallback((feat: object) => {
    const code = codeOf(feat);
    return code === selectedCountry ? 0.04 : code === hoveredCountry ? 0.02 : 0.006;
  }, [hoveredCountry, selectedCountry]);

  const polygonStrokeColor = useCallback((feat: object) => {
    const code = codeOf(feat);
    if (code === selectedCountry) return '#A8DCFF';
    if (code === hoveredCountry) return '#3FA8E0';
    return 'rgba(255, 255, 255, 0.35)';
  }, [hoveredCountry, selectedCountry]);

  const polygonLabel = useCallback((feat: object) => {
    const code = codeOf(feat);
    const c = snapshot?.countries[code];
    const name = names.get(code) ?? code;
    const line = c && c.n > 0
      ? `${c.n} ${c.n === 1 ? 'story' : 'stories'} · ${LENSES[c.dom]?.label ?? ''} · ${attentionWords(c.z)}`
      : 'no lensed stories in the last two hours';
    const color = c && c.n > 0 ? LENSES[c.dom]?.color ?? '#aaa' : 'rgba(232,236,244,0.45)';
    return `<div style="background:rgba(8,11,20,0.92);border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:8px 12px;font-family:'Space Mono',monospace;color:#e8ecf4;pointer-events:none;">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px;">${name}</div>
      <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${color};">${line}</div>
    </div>`;
  }, [snapshot, names]);

  const onPolygonHover = useCallback((feat: object | null) => setHoveredCountry(feat ? codeOf(feat) || null : null), [setHoveredCountry]);
  const onPolygonClick = useCallback((feat: object) => { const code = codeOf(feat); if (code) selectCountry(code); }, [selectCountry]);

  const pointColor = useCallback((d: object) => LENSES[(d as Spark).lens]?.color ?? '#ffffff', []);

  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      globeImageUrl={EARTH_TEXTURE_URL}
      backgroundColor="rgba(4,6,12,1)"
      showGraticules={false}
      showAtmosphere={true}
      atmosphereColor="#5aa9ff"
      atmosphereAltitude={0.2}

      polygonsData={features}
      polygonCapColor={polygonCapColor}
      polygonSideColor={() => 'rgba(8, 11, 20, 0.35)'}
      polygonStrokeColor={polygonStrokeColor}
      polygonAltitude={polygonAltitude}
      polygonLabel={polygonLabel}
      polygonsTransitionDuration={0}
      onPolygonHover={onPolygonHover}
      onPolygonClick={onPolygonClick}

      pointsData={sparks}
      pointsMerge={true}
      pointLat={(d: object) => (d as Spark).lat}
      pointLng={(d: object) => (d as Spark).lng}
      pointColor={pointColor}
      pointAltitude={0.012}
      pointRadius={0.22}
    />
  );
}
