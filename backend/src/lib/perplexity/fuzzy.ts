/**
 * Fuzzy matching utilities for normalising Perplexity output.
 * No external dependencies — everything is implemented here.
 */

import type { EventType, RelationshipType } from './schema.js';

// ---------------------------------------------------------------------------
// Levenshtein distance (iterative, O(mn) space)
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  // Use two rows to save memory
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

function normaliseStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Country code resolution
// ---------------------------------------------------------------------------

// ISO3 → ISO2
const ISO3_TO_ISO2: Record<string, string> = {
  AFG:'AF', AGO:'AO', ALB:'AL', AND:'AD', ARE:'AE', ARG:'AR', ARM:'AM',
  ATG:'AG', AUS:'AU', AUT:'AT', AZE:'AZ', BDI:'BI', BEL:'BE', BEN:'BJ',
  BFA:'BF', BGD:'BD', BGR:'BG', BHR:'BH', BHS:'BS', BIH:'BA', BLR:'BY',
  BLZ:'BZ', BOL:'BO', BRA:'BR', BRB:'BB', BRN:'BN', BTN:'BT', BWA:'BW',
  CAF:'CF', CAN:'CA', CHE:'CH', CHL:'CL', CHN:'CN', CIV:'CI', CMR:'CM',
  COD:'CD', COG:'CG', COL:'CO', COM:'KM', CPV:'CV', CRI:'CR', CUB:'CU',
  CYP:'CY', CZE:'CZ', DEU:'DE', DJI:'DJ', DMA:'DM', DNK:'DK', DOM:'DO',
  DZA:'DZ', ECU:'EC', EGY:'EG', ERI:'ER', ESP:'ES', EST:'EE', ETH:'ET',
  FIN:'FI', FJI:'FJ', FRA:'FR', FSM:'FM', GAB:'GA', GBR:'GB', GEO:'GE',
  GHA:'GH', GIN:'GN', GMB:'GM', GNB:'GW', GNQ:'GQ', GRC:'GR', GRD:'GD',
  GTM:'GT', GUY:'GY', HND:'HN', HRV:'HR', HTI:'HT', HUN:'HU', IDN:'ID',
  IND:'IN', IRL:'IE', IRN:'IR', IRQ:'IQ', ISL:'IS', ISR:'IL', ITA:'IT',
  JAM:'JM', JOR:'JO', JPN:'JP', KAZ:'KZ', KEN:'KE', KGZ:'KG', KHM:'KH',
  KIR:'KI', KNA:'KN', KOR:'KR', KWT:'KW', LAO:'LA', LBN:'LB', LBR:'LR',
  LBY:'LY', LCA:'LC', LIE:'LI', LKA:'LK', LSO:'LS', LTU:'LT', LUX:'LU',
  LVA:'LV', MAR:'MA', MCO:'MC', MDA:'MD', MDG:'MG', MDV:'MV', MEX:'MX',
  MHL:'MH', MKD:'MK', MLI:'ML', MLT:'MT', MMR:'MM', MNE:'ME', MNG:'MN',
  MOZ:'MZ', MRT:'MR', MUS:'MU', MWI:'MW', MYS:'MY', NAM:'NA', NER:'NE',
  NGA:'NG', NIC:'NI', NLD:'NL', NOR:'NO', NPL:'NP', NRU:'NR', NZL:'NZ',
  OMN:'OM', PAK:'PK', PAN:'PA', PER:'PE', PHL:'PH', PLW:'PW', PNG:'PG',
  POL:'PL', PRK:'KP', PRT:'PT', PRY:'PY', PSE:'PS', QAT:'QA', ROU:'RO',
  RUS:'RU', RWA:'RW', SAU:'SA', SDN:'SD', SEN:'SN', SGP:'SG', SLB:'SB',
  SLE:'SL', SLV:'SV', SMR:'SM', SOM:'SO', SRB:'RS', SSD:'SS', STP:'ST',
  SUR:'SR', SVK:'SK', SVN:'SI', SWE:'SE', SWZ:'SZ', SYC:'SC', SYR:'SY',
  TCD:'TD', TGO:'TG', THA:'TH', TJK:'TJ', TKM:'TM', TLS:'TL', TON:'TO',
  TTO:'TT', TUN:'TN', TUR:'TR', TUV:'TV', TZA:'TZ', UGA:'UG', UKR:'UA',
  URY:'UY', USA:'US', UZB:'UZ', VCT:'VC', VEN:'VE', VNM:'VN', VUT:'VU',
  WSM:'WS', YEM:'YE', ZAF:'ZA', ZMB:'ZM', ZWE:'ZW',
};

// Common name variants → ISO2
const NAME_TO_ISO2: Record<string, string> = {
  // United States
  'united states': 'US', 'united states of america': 'US', 'usa': 'US',
  'u.s.': 'US', 'u.s.a.': 'US', 'america': 'US', 'the united states': 'US',
  // United Kingdom
  'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'britain': 'GB',
  'england': 'GB', 'the uk': 'GB',
  // Russia
  'russia': 'RU', 'russian federation': 'RU', 'the russian federation': 'RU',
  // China
  'china': 'CN', "people's republic of china": 'CN', 'prc': 'CN',
  // South Korea
  'south korea': 'KR', 'republic of korea': 'KR', 'korea': 'KR',
  // North Korea
  'north korea': 'KP', "democratic people's republic of korea": 'KP', 'dprk': 'KP',
  // Germany
  'germany': 'DE', 'federal republic of germany': 'DE',
  // France
  'france': 'FR', 'french republic': 'FR',
  // Japan
  'japan': 'JP',
  // India
  'india': 'IN', 'republic of india': 'IN',
  // Brazil
  'brazil': 'BR', 'federative republic of brazil': 'BR',
  // Canada
  'canada': 'CA',
  // Australia
  'australia': 'AU',
  // Italy
  'italy': 'IT', 'italian republic': 'IT',
  // South Africa
  'south africa': 'ZA', 'republic of south africa': 'ZA',
  // Argentina
  'argentina': 'AR', 'argentine republic': 'AR',
  // Mexico
  'mexico': 'MX', 'united mexican states': 'MX',
  // Egypt
  'egypt': 'EG', 'arab republic of egypt': 'EG',
  // Turkey / Türkiye
  'turkey': 'TR', 'turkiye': 'TR', 'türkiye': 'TR', 'republic of turkey': 'TR',
  // Pakistan
  'pakistan': 'PK', 'islamic republic of pakistan': 'PK',
  // Nigeria
  'nigeria': 'NG', 'federal republic of nigeria': 'NG',
  // Venezuela
  'venezuela': 'VE', 'bolivarian republic of venezuela': 'VE',
  // Ukraine
  'ukraine': 'UA',
  // Israel
  'israel': 'IL', 'state of israel': 'IL',
  // Ethiopia
  'ethiopia': 'ET', 'federal democratic republic of ethiopia': 'ET',
  // Myanmar / Burma
  'myanmar': 'MM', 'burma': 'MM', 'republic of the union of myanmar': 'MM',
  // Sudan
  'sudan': 'SD', 'republic of the sudan': 'SD',
  // Haiti
  'haiti': 'HT', 'republic of haiti': 'HT',
  // Syria
  'syria': 'SY', 'syrian arab republic': 'SY',
  // Yemen
  'yemen': 'YE', 'republic of yemen': 'YE',
  // Afghanistan
  'afghanistan': 'AF',
  // Norway
  'norway': 'NO', 'kingdom of norway': 'NO',
  // Switzerland
  'switzerland': 'CH', 'swiss confederation': 'CH',
  // New Zealand
  'new zealand': 'NZ',
  // Finland
  'finland': 'FI', 'republic of finland': 'FI',
  // Sweden
  'sweden': 'SE', 'kingdom of sweden': 'SE',
  // Netherlands
  'netherlands': 'NL', 'the netherlands': 'NL', 'holland': 'NL',
  // Spain
  'spain': 'ES', 'kingdom of spain': 'ES',
  // Poland
  'poland': 'PL', 'republic of poland': 'PL',
  // Iran
  'iran': 'IR', 'islamic republic of iran': 'IR', 'persia': 'IR',
  // Iraq
  'iraq': 'IQ', 'republic of iraq': 'IQ',
  // Saudi Arabia
  'saudi arabia': 'SA', 'kingdom of saudi arabia': 'SA', 'ksa': 'SA',
  // Israel / Palestine
  'palestine': 'PS', 'state of palestine': 'PS', 'west bank and gaza': 'PS',
  // Lebanon
  'lebanon': 'LB', 'lebanese republic': 'LB',
  // Jordan
  'jordan': 'JO', 'hashemite kingdom of jordan': 'JO',
  // Indonesia
  'indonesia': 'ID', 'republic of indonesia': 'ID',
  // Thailand
  'thailand': 'TH', 'kingdom of thailand': 'TH',
  // Vietnam
  'vietnam': 'VN', 'viet nam': 'VN', 'socialist republic of vietnam': 'VN',
  // Philippines
  'philippines': 'PH', 'republic of the philippines': 'PH',
  // Bangladesh
  'bangladesh': 'BD', "people's republic of bangladesh": 'BD',
  // Kenya
  'kenya': 'KE', 'republic of kenya': 'KE',
  // Somalia
  'somalia': 'SO', 'federal republic of somalia': 'SO',
  // South Sudan
  'south sudan': 'SS', 'republic of south sudan': 'SS',
  // DR Congo
  'democratic republic of congo': 'CD', 'dr congo': 'CD', 'drc': 'CD',
  'congo': 'CG', 'republic of congo': 'CG',
  // Mali
  'mali': 'ML', 'republic of mali': 'ML',
  // Libya
  'libya': 'LY', 'state of libya': 'LY',
  // Morocco
  'morocco': 'MA', 'kingdom of morocco': 'MA',
  // Colombia
  'colombia': 'CO', 'republic of colombia': 'CO',
  // UAE
  'united arab emirates': 'AE', 'uae': 'AE', 'emirates': 'AE',
  // Qatar
  'qatar': 'QA', 'state of qatar': 'QA',
  // Kazakhstan
  'kazakhstan': 'KZ', 'republic of kazakhstan': 'KZ',
};

export interface CountryResolution {
  code:       string;
  name:       string;
  confidence: 'high' | 'medium' | 'low';
  method:     string;
}

/**
 * Resolve a country identifier (ISO2, ISO3, or name string) to an ISO2 code.
 * Returns null if no match found with sufficient confidence.
 */
export function resolveCountryCode(
  code?: string,
  name?: string,
): CountryResolution | null {
  const candidates: Array<{ source: string; value: string }> = [];
  if (code) candidates.push({ source: 'code', value: code.trim() });
  if (name) candidates.push({ source: 'name', value: name.trim() });

  for (const { source, value } of candidates) {
    const upper = value.toUpperCase();
    const norm  = normaliseStr(value);

    // 1. Exact ISO2 match (2-char input)
    if (value.length === 2) {
      const iso2 = upper;
      // We don't have an authoritative ISO2 list to validate against, but
      // 2-char codes from Perplexity are almost always correct
      const friendlyName = Object.entries(NAME_TO_ISO2).find(([, v]) => v === iso2)?.[0] ?? iso2;
      return { code: iso2, name: friendlyName, confidence: 'high', method: `direct-iso2 (${source})` };
    }

    // 2. ISO3 → ISO2 mapping
    if (value.length === 3) {
      const iso2 = ISO3_TO_ISO2[upper];
      if (iso2) {
        const friendlyName = Object.entries(NAME_TO_ISO2).find(([, v]) => v === iso2)?.[0] ?? iso2;
        return { code: iso2, name: friendlyName, confidence: 'high', method: `iso3 (${source})` };
      }
    }

    // 3. Exact name lookup
    const exact = NAME_TO_ISO2[norm];
    if (exact) {
      return { code: exact, name: value, confidence: 'high', method: `exact-name (${source})` };
    }

    // 4. Prefix match (e.g. "United" matches "united states" if unique prefix)
    const prefixMatches = Object.entries(NAME_TO_ISO2).filter(([k]) => k.startsWith(norm));
    if (prefixMatches.length === 1) {
      return {
        code: prefixMatches[0][1],
        name: value,
        confidence: 'medium',
        method: `prefix-match (${source})`,
      };
    }

    // 5. Levenshtein fuzzy match (max distance = 3)
    let bestDist = 4;
    let bestCode: string | null = null;
    let bestName: string | null = null;
    for (const [k, v] of Object.entries(NAME_TO_ISO2)) {
      const dist = levenshtein(norm, k);
      if (dist < bestDist) {
        bestDist = dist;
        bestCode = v;
        bestName = k;
      }
    }
    if (bestCode && bestDist <= 3) {
      return {
        code: bestCode,
        name: bestName ?? value,
        confidence: bestDist <= 1 ? 'medium' : 'low',
        method: `fuzzy-lev(d=${bestDist}) (${source})`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Event type resolution
// ---------------------------------------------------------------------------

const EVENT_TYPE_MAP: Record<string, string> = {
  military: 'military', armed: 'military', combat: 'military', war: 'military',
  conflict: 'military', troops: 'military', offensive: 'military', attack: 'military',
  battle: 'military', airstrikes: 'military', 'air strikes': 'military',
  weapons: 'military', casualties: 'military', ceasefire: 'military',

  diplomatic: 'diplomatic', diplomacy: 'diplomatic', sanctions: 'diplomatic',
  negotiations: 'diplomatic', summit: 'diplomatic', treaty: 'diplomatic',
  talks: 'diplomatic', relations: 'diplomatic', foreign: 'diplomatic',

  economic: 'economic', economy: 'economic', trade: 'economic', finance: 'economic',
  aid: 'economic', reconstruction: 'economic', currency: 'economic',
  investment: 'economic', inflation: 'economic', energy: 'economic',

  humanitarian: 'humanitarian', displacement: 'humanitarian', refugees: 'humanitarian',
  famine: 'humanitarian', food: 'humanitarian', civilian: 'humanitarian',
  aid_delivery: 'humanitarian', 'aid delivery': 'humanitarian', crisis: 'humanitarian',

  political: 'political', election: 'political', protest: 'political', coup: 'political',
  government: 'political', parliament: 'political', domestic: 'political',
  leadership: 'political', opposition: 'political', law: 'political',
};

export function resolveEventType(input?: string): { type: string; confidence: 'high' | 'medium' | 'low' } {
  if (!input) return { type: 'unknown', confidence: 'low' };

  const norm = normaliseStr(input);

  // Exact match
  if (EVENT_TYPE_MAP[norm]) {
    return { type: EVENT_TYPE_MAP[norm], confidence: 'high' };
  }

  // Word-by-word match (any word in the input hits the map)
  for (const word of norm.split(' ')) {
    if (EVENT_TYPE_MAP[word]) {
      return { type: EVENT_TYPE_MAP[word], confidence: 'medium' };
    }
  }

  // Levenshtein against map keys
  let bestDist = 4;
  let bestType: string | null = null;
  for (const [k, v] of Object.entries(EVENT_TYPE_MAP)) {
    const dist = levenshtein(norm, k);
    if (dist < bestDist) { bestDist = dist; bestType = v; }
  }
  if (bestType && bestDist <= 2) {
    return { type: bestType, confidence: 'low' };
  }

  return { type: 'unknown', confidence: 'low' };
}

// ---------------------------------------------------------------------------
// Relationship type resolution
// ---------------------------------------------------------------------------

const REL_TYPE_MAP: Record<string, string> = {
  conflict: 'conflict', war: 'conflict', hostile: 'conflict', adversarial: 'conflict',
  fighting: 'conflict', invasion: 'conflict', blockade: 'conflict',
  trade: 'trade', commerce: 'trade', economic: 'trade', exports: 'trade',
  imports: 'trade', supply: 'trade', market: 'trade',
  diplomacy: 'diplomacy', diplomatic: 'diplomacy', alliance: 'diplomacy',
  allied: 'diplomacy', partner: 'diplomacy', cooperation: 'diplomacy',
  neutral: 'neutral', none: 'neutral', minimal: 'neutral', limited: 'neutral',
};

export function resolveRelationshipType(input?: string): { type: RelationshipType; confidence: 'high' | 'medium' | 'low' } {
  if (!input) return { type: 'neutral', confidence: 'low' };

  const norm = normaliseStr(input);

  if (REL_TYPE_MAP[norm]) return { type: REL_TYPE_MAP[norm] as RelationshipType, confidence: 'high' };

  for (const word of norm.split(' ')) {
    if (REL_TYPE_MAP[word]) return { type: REL_TYPE_MAP[word] as RelationshipType, confidence: 'medium' };
  }

  let bestDist = 4;
  let bestType: string | null = null;
  for (const [k, v] of Object.entries(REL_TYPE_MAP)) {
    const dist = levenshtein(norm, k);
    if (dist < bestDist) { bestDist = dist; bestType = v; }
  }
  if (bestType && bestDist <= 2) return { type: bestType as RelationshipType, confidence: 'low' };

  return { type: 'neutral', confidence: 'low' };
}

// ---------------------------------------------------------------------------
// Intensity resolution
// ---------------------------------------------------------------------------

const INTENSITY_VERBALS: Record<string, number> = {
  maximum: 1.0, critical: 0.95, extreme: 0.9,
  high: 0.8, significant: 0.75, major: 0.7,
  medium: 0.5, moderate: 0.5, notable: 0.45,
  low: 0.2, minor: 0.15, minimal: 0.1, negligible: 0.05,
};

export function resolveIntensity(input?: number | string): { value: number; clamped: boolean; warning?: string } {
  if (input === undefined || input === null) {
    return { value: 0.5, clamped: false, warning: 'intensity missing — defaulted to 0.5' };
  }

  if (typeof input === 'number') {
    if (input >= 0 && input <= 1) return { value: input, clamped: false };
    const clamped = Math.max(0, Math.min(1, input));
    return { value: clamped, clamped: true, warning: `intensity ${input} clamped to ${clamped}` };
  }

  // Numeric string
  const parsed = parseFloat(input);
  if (!isNaN(parsed)) {
    const clamped = Math.max(0, Math.min(1, parsed));
    return {
      value: clamped,
      clamped: clamped !== parsed,
      warning: clamped !== parsed ? `intensity "${input}" clamped to ${clamped}` : undefined,
    };
  }

  // Verbal label
  const norm = normaliseStr(input);
  const verbal = INTENSITY_VERBALS[norm];
  if (verbal !== undefined) return { value: verbal, clamped: false };

  return { value: 0.5, clamped: false, warning: `unrecognized intensity "${input}" — defaulted to 0.5` };
}

// ---------------------------------------------------------------------------
// Boolean coercion (for in_conflict)
// ---------------------------------------------------------------------------

export function resolveBoolean(input?: boolean | string): { value: boolean; warning?: string } {
  if (typeof input === 'boolean') return { value: input };
  if (input === undefined || input === null) {
    return { value: false, warning: 'in_conflict missing — defaulted to false' };
  }
  const norm = normaliseStr(String(input));
  const truthy = new Set(['true', 'yes', 'active', '1', 'ongoing', 'current', 'confirmed']);
  const falsy  = new Set(['false', 'no', 'inactive', '0', 'none', 'peaceful', 'stable']);
  if (truthy.has(norm)) return { value: true };
  if (falsy.has(norm))  return { value: false };
  return { value: false, warning: `unrecognized boolean "${input}" — defaulted to false` };
}
