import { useEffect } from 'react';
import { useGlobeStore } from '../../store/globeStore';
import { HARDCODED_COUNTRIES, HARDCODED_ARCS, COUNTRY_MAP } from '../../data/hardcoded';
import type { GlobeFeature } from '../../types';

// Force full page reload when hardcoded data changes during HMR
// so the GeoJSON enrichment useEffect always runs with fresh data
if (import.meta.hot) {
  import.meta.hot.accept('../../data/hardcoded', () => {
    import.meta.hot!.invalidate();
  });
}

interface GeoJSON {
  type: 'FeatureCollection';
  features: GlobeFeature[];
}

// Densify polygon edges longer than MAX_EDGE_DEG degrees to prevent Globe.gl
// tessellation artifacts on large/high-latitude polygons (e.g. Greenland, Russia).
const MAX_EDGE_DEG = 3;

function densifyRing(ring: number[][]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    out.push(ring[i]);
    const dLng = ring[i + 1][0] - ring[i][0];
    const dLat = ring[i + 1][1] - ring[i][1];
    const dist  = Math.sqrt(dLng * dLng + dLat * dLat);
    if (dist > MAX_EDGE_DEG) {
      const steps = Math.ceil(dist / MAX_EDGE_DEG);
      for (let s = 1; s < steps; s++) {
        out.push([ring[i][0] + dLng * (s / steps), ring[i][1] + dLat * (s / steps)]);
      }
    }
  }
  out.push(ring[ring.length - 1]);
  return out;
}

function densifyFeature(f: GlobeFeature): GlobeFeature {
  const g = f.geometry;
  if (g.type === 'Polygon') {
    return { ...f, geometry: { ...g, coordinates: (g.coordinates as number[][][]).map(densifyRing) } };
  }
  if (g.type === 'MultiPolygon') {
    return { ...f, geometry: { ...g, coordinates: (g.coordinates as number[][][][]).map(poly => poly.map(densifyRing)) } };
  }
  return f;
}

export function useGlobeData() {
  const setFeatures = useGlobeStore(s => s.setFeatures);
  const setArcs = useGlobeStore(s => s.setArcs);
  const setCountryMap = useGlobeStore(s => s.setCountryMap);

  useEffect(() => {
    setCountryMap(COUNTRY_MAP);
    setArcs(HARDCODED_ARCS);

    fetch('/data/countries.geojson')
      .then(r => r.json())
      .then((geo: GeoJSON) => {
        // Enrich GeoJSON features with hardcoded stability data
        const enriched = geo.features
          .filter(f => {
            const code = f.properties.ISO_A2;
            return code && code !== '-99';
          })
          .map(f => {
            const code = f.properties.ISO_A2;
            const data = HARDCODED_COUNTRIES.find(c => c.code === code);
            return {
              ...f,
              properties: {
                ...f.properties,
                stability_score: data?.stability_score ?? 50,
                unrest_level: data?.unrest_level ?? 0,
                in_conflict: data?.in_conflict ?? false,
                flag_color: data?.flag_color ?? '#334466',
                countryData: data ?? null,
              },
            } as GlobeFeature;
          });

        // Warn on any hardcoded country that didn't match a GeoJSON feature
        const geoCodes = new Set(enriched.map(f => f.properties.ISO_A2));
        for (const country of HARDCODED_COUNTRIES) {
          if (!geoCodes.has(country.code)) {
            console.warn(`[ATLAS] No GeoJSON match for country code: ${country.code} (${country.name})`);
          }
        }

        setFeatures(enriched.map(densifyFeature));
      })
      .catch(err => console.error('[ATLAS] Failed to load GeoJSON:', err));
  }, [setFeatures, setArcs, setCountryMap]);
}
