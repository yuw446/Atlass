import { z } from 'zod';

export const UnrestLevel = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3),
]);

export const CountryDataSchema = z.object({
  code: z.string().length(2),
  name: z.string(),
  stability_score: z.number().min(0).max(100),
  unrest_level: UnrestLevel,
  in_conflict: z.boolean().default(false),
  flag_color: z.string().optional(),
  centroid: z.tuple([z.number(), z.number()]),
  flag: z.string().optional(),
  score_source: z.enum(['hardcoded', 'gdelt', 'perplexity']).default('hardcoded'),
  data_confidence: z.enum(['high', 'medium', 'low']).default('high'),
  updated_at: z.string().datetime().optional(),
});

export const RelationshipSchema = z.object({
  partner_code: z.string().length(2),
  type: z.enum(['trade', 'conflict', 'diplomacy', 'neutral']),
  score: z.number().min(-1).max(1),
  intensity: z.number().min(0).max(1),
});

export const EventCardSchema = z.object({
  summary: z.string().min(10),
  image_url: z.string().url().optional(),
});

export const DigestResponseSchema = z.object({
  country_code: z.string().length(2),
  country_name: z.string(),
  in_conflict: z.boolean(),
  events: z.array(EventCardSchema).min(1).max(3),
  updated_at: z.string(),
  cached: z.boolean().default(false),
});

export const GlobeDataResponseSchema = z.object({
  countries: z.array(CountryDataSchema),
  updated_at: z.string(),
  source: z.enum(['live', 'cached', 'hardcoded']),
});

export type CountryData      = z.infer<typeof CountryDataSchema>;
export type Relationship     = z.infer<typeof RelationshipSchema>;
export type EventCard        = z.infer<typeof EventCardSchema>;
export type DigestResponse   = z.infer<typeof DigestResponseSchema>;
export type GlobeDataResponse = z.infer<typeof GlobeDataResponseSchema>;
