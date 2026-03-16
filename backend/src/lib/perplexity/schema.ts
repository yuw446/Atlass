import { z } from 'zod';

// ---------------------------------------------------------------------------
// RAW SCHEMAS — permissive, accepts whatever Perplexity might produce
// ---------------------------------------------------------------------------

export const RawEventSchema = z.object({
  summary:      z.string(),
  event_type:   z.string().optional(),
  published_at: z.string().optional(),
  source_url:   z.string().optional(),
  image_url:    z.string().optional(),
}).passthrough();

export const RawRelationshipSchema = z.object({
  partner_code: z.string().optional(),
  partner_name: z.string().optional(),
  type:         z.string().optional(),
  // intensity can arrive as a number, a numeric string, or a verbal label
  intensity:    z.union([z.number(), z.string()]).optional(),
  summary:      z.string().optional(),
}).passthrough();

export const RawCountrySchema = z.object({
  code:          z.string().optional(),
  name:          z.string().optional(),
  // in_conflict can arrive as bool, "true"/"false", "yes"/"no", "active"
  in_conflict:   z.union([z.boolean(), z.string()]).optional(),
  events:        z.array(RawEventSchema).optional(),
  relationships: z.array(RawRelationshipSchema).optional(),
}).passthrough();

// Root package — also supports the single-country shorthand where country
// fields are placed directly at the root level.
export const RawPackageSchema = z.object({
  package_id:    z.string().optional(),
  generated_at:  z.string().optional(),
  query_context: z.string().optional(),
  countries:     z.array(RawCountrySchema).optional(),
  // Single-country shorthand fields
  code:          z.string().optional(),
  name:          z.string().optional(),
  in_conflict:   z.union([z.boolean(), z.string()]).optional(),
  events:        z.array(RawEventSchema).optional(),
  relationships: z.array(RawRelationshipSchema).optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// NORMALIZED SCHEMAS — strict, what the rest of the backend consumes
// ---------------------------------------------------------------------------

export const EVENT_TYPES = ['military', 'diplomatic', 'economic', 'humanitarian', 'political', 'unknown'] as const;
export type EventType = typeof EVENT_TYPES[number];

export const RELATIONSHIP_TYPES = ['conflict', 'trade', 'diplomacy', 'neutral'] as const;
export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

export const NormalizedEventSchema = z.object({
  summary:      z.string().min(10),
  event_type:   z.enum(EVENT_TYPES),
  published_at: z.string().optional(),
  source_url:   z.string().url().optional(),
  image_url:    z.string().url().optional(),
});

export const NormalizedRelationshipSchema = z.object({
  partner_code: z.string().length(2),
  partner_name: z.string().optional(),
  type:         z.enum(RELATIONSHIP_TYPES),
  intensity:    z.number().min(0).max(1),
  summary:      z.string().optional(),
});

export const NormalizedCountrySchema = z.object({
  code:          z.string().length(2),
  name:          z.string(),
  in_conflict:   z.boolean(),
  events:        z.array(NormalizedEventSchema).min(1),
  relationships: z.array(NormalizedRelationshipSchema),
});

export const NormalizedPackageSchema = z.object({
  package_id:   z.string(),
  generated_at: z.string(),
  source_file:  z.string(),
  countries:    z.array(NormalizedCountrySchema).min(1),
});

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type RawPackage      = z.infer<typeof RawPackageSchema>;
export type RawCountry      = z.infer<typeof RawCountrySchema>;
export type RawEvent        = z.infer<typeof RawEventSchema>;
export type RawRelationship = z.infer<typeof RawRelationshipSchema>;

export type NormalizedPackage      = z.infer<typeof NormalizedPackageSchema>;
export type NormalizedCountry      = z.infer<typeof NormalizedCountrySchema>;
export type NormalizedEvent        = z.infer<typeof NormalizedEventSchema>;
export type NormalizedRelationship = z.infer<typeof NormalizedRelationshipSchema>;

export interface ValidationResult {
  success:  boolean;
  package:  NormalizedPackage | null;
  warnings: string[];   // rescued / coerced values
  errors:   string[];   // hard failures that prevented normalisation
}
