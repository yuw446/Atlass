export type ConflictStatus =
  | 'active_conflict'      // direct armed hostilities on own territory
  | 'military_operation'   // own forces engaged abroad
  | 'impacted'             // under attack / economic siege but not declared war
  | 'civil_unrest'         // internal political violence or instability
  | 'ceasefire'            // recently paused hostilities
  | 'peaceful';            // no significant conflict involvement

export interface CountryData {
  code: string;           // ISO 3166-1 alpha-2
  name: string;
  stability_score: number; // 0-100, kept for supplementary context
  unrest_level: 0 | 1 | 2 | 3;
  in_conflict: boolean;   // active armed conflict
  flag_color: string;     // dominant hex color from national flag (for border)
  conflict_status: ConflictStatus;
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
    in_conflict?: boolean;
    flag_color?: string;
    countryData?: CountryData;
  };
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

export interface EventCard {
  summary: string;
  source_url?: string;
  image_url?: string;
  event_type?: string;
  published_at?: string;
}

export interface DigestData {
  country_code: string;
  country_name: string;
  in_conflict: boolean;
  events: EventCard[];
  updated_at: string;
  cached: boolean;
}
