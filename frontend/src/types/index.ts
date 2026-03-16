export interface CountryData {
  code: string;           // ISO 3166-1 alpha-2
  name: string;
  stability_score: number; // 0-100
  unrest_level: 0 | 1 | 2 | 3;
  centroid: [number, number]; // [lat, lng]
  flag?: string;           // emoji flag
}

export interface ArcData {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  type: 'trade' | 'conflict' | 'diplomacy';
  intensity: number; // 0-1
  label: string;
}

export interface GlobeFeatureProperties {
  ISO_A2: string;
  ADMIN: string;
  [key: string]: unknown;
}

export interface GlobeFeature {
  type: 'Feature';
  properties: GlobeFeatureProperties & {
    stability_score?: number;
    unrest_level?: 0 | 1 | 2 | 3;
    countryData?: CountryData;
  };
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

export interface DigestData {
  country_code: string;
  country_name: string;
  stability_score: number;
  unrest_level: 0 | 1 | 2 | 3;
  digest_text: string;
  top_events: { headline: string; url: string }[];
  updated_at: string;
}
