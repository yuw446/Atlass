// A GeoJSON feature after enrichment: the only property the app reads is `code` (ISO alpha-2, stamped by useGlobeData).
export interface GlobeFeatureProps {
  code?: string;
  ADMIN?: string;
  NAME?: string;
  ISO_A2?: string;
  ISO_A2_EH?: string;
  [key: string]: unknown;
}

export interface GlobeFeature {
  type: 'Feature';
  properties: GlobeFeatureProps;
  geometry: { type: string; coordinates: unknown };
}
