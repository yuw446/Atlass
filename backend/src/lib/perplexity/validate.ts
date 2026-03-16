/**
 * Validates and normalises a raw Perplexity data package.
 *
 * Two-phase approach:
 * 1. Rescue phase — fuzzy-match and coerce values where possible, log warnings
 * 2. Strict phase — run Zod against the normalised output; hard errors fail the country
 *
 * A package with some valid countries and some invalid ones is partially accepted:
 * valid countries are written to Redis, invalid ones are logged as errors.
 */

import {
  RawPackageSchema,
  NormalizedPackageSchema,
  type RawPackage,
  type RawCountry,
  type RawEvent,
  type RawRelationship,
  type NormalizedCountry,
  type NormalizedEvent,
  type NormalizedRelationship,
  type ValidationResult,
} from './schema.js';

import {
  resolveCountryCode,
  resolveEventType,
  resolveRelationshipType,
  resolveIntensity,
  resolveBoolean,
} from './fuzzy.js';

// ---------------------------------------------------------------------------
// Event normalisation
// ---------------------------------------------------------------------------

function normaliseEvent(
  raw: RawEvent,
  countryCode: string,
  idx: number,
  warnings: string[],
): NormalizedEvent | null {
  const prefix = `[${countryCode}] event[${idx}]`;

  if (!raw.summary || raw.summary.trim().length < 10) {
    warnings.push(`${prefix}: summary too short or missing — skipped`);
    return null;
  }

  const { type: event_type, confidence } = resolveEventType(raw.event_type);
  if (confidence !== 'high') {
    warnings.push(`${prefix}: event_type "${raw.event_type}" → "${event_type}" (${confidence} confidence)`);
  }

  // Validate optional URLs — drop silently if malformed
  let source_url: string | undefined;
  let image_url: string | undefined;
  try {
    if (raw.source_url) { new URL(raw.source_url); source_url = raw.source_url; }
  } catch {
    warnings.push(`${prefix}: source_url "${raw.source_url}" is not a valid URL — dropped`);
  }
  try {
    if (raw.image_url) { new URL(raw.image_url); image_url = raw.image_url; }
  } catch {
    warnings.push(`${prefix}: image_url "${raw.image_url}" is not a valid URL — dropped`);
  }

  return {
    summary:      raw.summary.trim(),
    event_type:   event_type as NormalizedEvent['event_type'],
    published_at: raw.published_at?.trim(),
    source_url,
    image_url,
  };
}

// ---------------------------------------------------------------------------
// Relationship normalisation
// ---------------------------------------------------------------------------

function normaliseRelationship(
  raw: RawRelationship,
  countryCode: string,
  idx: number,
  warnings: string[],
): NormalizedRelationship | null {
  const prefix = `[${countryCode}] relationship[${idx}]`;

  // Resolve partner country
  const resolved = resolveCountryCode(raw.partner_code, raw.partner_name);
  if (!resolved) {
    warnings.push(`${prefix}: could not resolve partner "${raw.partner_code ?? raw.partner_name}" — skipped`);
    return null;
  }
  if (resolved.confidence !== 'high') {
    warnings.push(`${prefix}: partner resolved as "${resolved.code}" (${resolved.method}, ${resolved.confidence} confidence)`);
  }

  const { type, confidence: typeConf } = resolveRelationshipType(raw.type);
  if (typeConf !== 'high') {
    warnings.push(`${prefix}: relationship type "${raw.type}" → "${type}" (${typeConf} confidence)`);
  }

  const intensityResult = resolveIntensity(raw.intensity);
  if (intensityResult.warning) warnings.push(`${prefix}: ${intensityResult.warning}`);

  return {
    partner_code: resolved.code,
    partner_name: raw.partner_name?.trim(),
    type,
    intensity:    intensityResult.value,
    summary:      raw.summary?.trim(),
  };
}

// ---------------------------------------------------------------------------
// Country normalisation
// ---------------------------------------------------------------------------

function normaliseCountry(
  raw: RawCountry,
  warnings: string[],
  errors: string[],
): NormalizedCountry | null {
  // Resolve country identity
  const resolved = resolveCountryCode(raw.code, raw.name);
  if (!resolved) {
    errors.push(`Could not resolve country code/name: code="${raw.code}" name="${raw.name}" — country skipped`);
    return null;
  }
  if (resolved.confidence === 'low') {
    warnings.push(`Country resolved as "${resolved.code}" with LOW confidence (${resolved.method}) — verify manually`);
  } else if (resolved.confidence === 'medium') {
    warnings.push(`Country resolved as "${resolved.code}" via ${resolved.method}`);
  }

  const { value: in_conflict, warning: boolWarn } = resolveBoolean(raw.in_conflict);
  if (boolWarn) warnings.push(`[${resolved.code}] ${boolWarn}`);

  // Normalise events
  const rawEvents = raw.events ?? [];
  if (rawEvents.length === 0) {
    errors.push(`[${resolved.code}] no events provided — country skipped`);
    return null;
  }
  const events: NormalizedEvent[] = rawEvents
    .map((e, i) => normaliseEvent(e, resolved.code, i, warnings))
    .filter((e): e is NormalizedEvent => e !== null);

  if (events.length === 0) {
    errors.push(`[${resolved.code}] all events failed normalisation — country skipped`);
    return null;
  }
  if (events.length < rawEvents.length) {
    warnings.push(`[${resolved.code}] ${rawEvents.length - events.length} event(s) dropped during normalisation`);
  }

  // Normalise relationships
  const relationships: NormalizedRelationship[] = (raw.relationships ?? [])
    .map((r, i) => normaliseRelationship(r, resolved.code, i, warnings))
    .filter((r): r is NormalizedRelationship => r !== null);

  return {
    code:  resolved.code,
    name:  raw.name?.trim() ?? resolved.name,
    in_conflict,
    events,
    relationships,
  };
}

// ---------------------------------------------------------------------------
// Package-level single-country shorthand detection
// ---------------------------------------------------------------------------

function extractCountries(raw: RawPackage): RawCountry[] {
  // Standard: countries array present
  if (Array.isArray(raw.countries) && raw.countries.length > 0) {
    return raw.countries;
  }

  // Shorthand: country fields at root level
  if (raw.code || raw.name) {
    return [{
      code:          raw.code,
      name:          raw.name,
      in_conflict:   raw.in_conflict,
      events:        raw.events,
      relationships: raw.relationships,
    }];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validatePackage(raw: unknown, sourceFile: string): ValidationResult {
  const warnings: string[] = [];
  const errors:   string[] = [];

  // Step 1: Parse against loose schema
  const parsed = RawPackageSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      package: null,
      warnings,
      errors: [`JSON does not match base package structure: ${parsed.error.issues[0]?.message ?? 'unknown'}`],
    };
  }
  const rawPkg = parsed.data;

  // Step 2: Extract country entries (handle shorthand)
  const rawCountries = extractCountries(rawPkg);
  if (rawCountries.length === 0) {
    return {
      success: false,
      package: null,
      warnings,
      errors: ['Package contains no country data — no "countries" array and no root code/name fields'],
    };
  }

  // Warn on duplicate country codes after resolution
  const seenCodes = new Map<string, number>();
  rawCountries.forEach((c, i) => {
    const r = resolveCountryCode(c.code, c.name);
    if (r) {
      const existing = seenCodes.get(r.code);
      if (existing !== undefined) {
        warnings.push(`Duplicate country "${r.code}" at index ${i} (first at ${existing}) — later entry overwrites`);
      }
      seenCodes.set(r.code, i);
    }
  });

  // Step 3: Normalise each country
  const normalized: NormalizedCountry[] = [];
  for (const rawCountry of rawCountries) {
    const country = normaliseCountry(rawCountry, warnings, errors);
    if (country) normalized.push(country);
  }

  if (normalized.length === 0) {
    return { success: false, package: null, warnings, errors };
  }

  // Step 4: Validate normalised output against strict schema
  const pkg = {
    package_id:   rawPkg.package_id ?? `auto-${Date.now()}`,
    generated_at: rawPkg.generated_at ?? new Date().toISOString(),
    source_file:  sourceFile,
    countries:    normalized,
  };

  const strictResult = NormalizedPackageSchema.safeParse(pkg);
  if (!strictResult.success) {
    const zodErrors = strictResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return { success: false, package: null, warnings, errors: [...errors, ...zodErrors] };
  }

  const partialSuccess = normalized.length < rawCountries.length;
  if (partialSuccess) {
    warnings.push(`Partial package: ${normalized.length}/${rawCountries.length} countries accepted`);
  }

  return {
    success:  true,
    package:  strictResult.data,
    warnings,
    errors,  // may be non-empty for partial packages (per-country failures)
  };
}
