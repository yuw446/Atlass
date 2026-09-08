// The one rule for turning a Natural Earth polygon into the ISO code Atlas uses.
// Natural Earth 110m sets ISO_A2 = "-99" for France, Norway, Kosovo (and some territories);
// ISO_A2_EH carries the right value there. Taiwan is "CN-TW" in ISO_A2 and "TW" in ISO_A2_EH.
// Kept free of imports so scripts/gen-codes.ts can use it before codes.generated.ts exists.

export interface GeoProps { ISO_A2?: string; ISO_A2_EH?: string }

const ALIASES: Record<string, string> = { 'CN-TW': 'TW' };

export function geoCode(props: GeoProps): string | undefined {
  const pick = (v?: string) => (v && v !== '-99' ? v : undefined);
  const raw = pick(props.ISO_A2_EH) ?? pick(props.ISO_A2);
  if (!raw) return undefined;
  return ALIASES[raw] ?? raw;
}
