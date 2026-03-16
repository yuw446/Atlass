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

        setFeatures(enriched);
      })
      .catch(err => console.error('[ATLAS] Failed to load GeoJSON:', err));
  }, [setFeatures, setArcs, setCountryMap]);
}
