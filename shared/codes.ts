// Country-code knowledge, one home: FIPS (GDELT) -> ISO (Atlas), and GeoJSON props -> ISO.
import { FIPS_TO_ISO, POLYGON_CODES } from './codes.generated.ts';
export { geoCode } from './geocode.ts';
export { POLYGON_CODES };

/** GDELT FIPS 10-4 code -> ISO 3166-1 alpha-2, or undefined when no polygon country uses it. */
export function fipsToIso(fips: string): string | undefined {
  return FIPS_TO_ISO[fips];
}

/** Regional-indicator flag emoji from an ISO alpha-2 code ("SD" -> 🇸🇩). XK (Kosovo) has no flag. */
export function flagEmoji(iso: string): string {
  if (!/^[A-Z]{2}$/.test(iso) || iso === 'XK') return '';
  return String.fromCodePoint(...[...iso].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}
