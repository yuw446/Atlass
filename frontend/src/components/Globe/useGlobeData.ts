import { useEffect } from 'react';
import { useGlobeStore } from '../../store/globeStore';
import { geoCode } from '../../../../shared/codes.ts';
import { densifyGeometry } from '../../lib/densify.ts';
import type { GlobeFeature, GlobeFeatureProps } from '../../types';

interface RawFeature { type: 'Feature'; properties: GlobeFeatureProps; geometry: { type: string; coordinates: unknown } }

/**
 * Loads the country polygons once and stamps each with a single `code` (ISO alpha-2) via geoCode, which is what
 * recovers France, Norway and Kosovo (ISO_A2 = -99 in Natural Earth) and aliases Taiwan. Polygons with no code
 * (Northern Cyprus, Somaliland) are dropped. Called from App so the fetch overlaps the globe chunk download.
 */
export function useGlobeData() {
  const setFeatures = useGlobeStore(s => s.setFeatures);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/countries.geojson`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<{ features: RawFeature[] }>; })
      .then(geo => {
        if (cancelled) return;
        const names = new Map<string, string>();
        const features: GlobeFeature[] = [];
        for (const f of geo.features) {
          const code = geoCode(f.properties);
          if (!code) continue;
          names.set(code, f.properties.ADMIN ?? f.properties.NAME ?? code);
          features.push({ type: 'Feature', properties: { ...f.properties, code }, geometry: densifyGeometry(f.geometry) });
        }
        setFeatures(features, names);
      })
      .catch(err => console.error('[ATLAS] Failed to load GeoJSON:', err));
    return () => { cancelled = true; };
  }, [setFeatures]);
}
