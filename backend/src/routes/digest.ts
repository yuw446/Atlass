import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { redis } from '../lib/redis.js';
import { generateDigest, generateHexDigest, FALLBACK_EVENTS, DIGEST_TTL_SECONDS } from '../lib/claude.js';
import { readCountryFromDisk } from '../lib/perplexity/ingest.js';

const router = Router();

// GeoJSON ISO_A2 codes that differ from our normalised two-letter codes
const GEO_ALIASES: Record<string, string> = {
  'CN-TW': 'TW',
};

const CountryRequestSchema = z.object({
  country_code: z.string().min(2).max(6).toUpperCase(),
  country_name: z.string().optional(),
  in_conflict: z.boolean().optional().default(false),
  stability_score: z.number().min(0).max(100).optional(),
});

const HexRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radius_km: z.number().min(10).max(500).optional().default(80),
  h3_index: z.string().optional(),  // for cache keying
});

// Haversine distance in km
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const RequestSchema = CountryRequestSchema;

// ---- Hex-click digest (lat/lon + radius) ----
router.post('/hex', async (req: Request, res: Response) => {
  const parsed = HexRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { lat, lon, radius_km, h3_index } = parsed.data;
  // Cache by H3 cell index if provided, otherwise by rounded coords
  const cacheKey = h3_index
    ? `atlas:hex-digest:${h3_index}`
    : `atlas:hex-digest:${lat.toFixed(2)}:${lon.toFixed(2)}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ ...JSON.parse(cached), cached: true });
    }
  } catch { /* non-fatal */ }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      lat, lon, radius_km,
      events: FALLBACK_EVENTS,
      updated_at: new Date().toISOString(),
      cached: false,
    });
  }

  try {
    // Fetch the cached GDELT events from Redis to find nearby ones
    let nearbyContext = '';
    try {
      const gdeltCached = await redis.get('atlas:gdelt:events:24');
      if (gdeltCached) {
        interface RawEvent { lat: number; lon: number; eventCode: number; goldstein: number; timestamp: string }
        const { events: gdeltEvents } = JSON.parse(gdeltCached) as { events: RawEvent[] };
        const nearby = gdeltEvents
          .filter((e: RawEvent) => haversineKm(lat, lon, e.lat, e.lon) <= radius_km)
          .slice(0, 50);
        if (nearby.length > 0) {
          nearbyContext = `\n\nGDELT events within ${radius_km}km:\n`
            + nearby.map((e: RawEvent) =>
                `- Code ${e.eventCode}, Goldstein ${e.goldstein.toFixed(1)}, at (${e.lat.toFixed(2)},${e.lon.toFixed(2)})`
              ).join('\n');
        }
      }
    } catch { /* GDELT context unavailable — proceed without it */ }

    const events = await generateHexDigest({ lat, lon, radius_km, nearbyContext });

    const payload = {
      lat, lon, radius_km,
      events,
      updated_at: new Date().toISOString(),
      cached: false,
    };

    try {
      await redis.setex(cacheKey, DIGEST_TTL_SECONDS, JSON.stringify(payload));
    } catch { /* non-fatal */ }

    return res.json(payload);
  } catch (err) {
    console.error('[Digest/Hex] Claude API error:', err);
    return res.status(502).json({
      lat, lon, radius_km,
      events: [{ summary: 'Hex digest temporarily unavailable. Please try again.' }],
      updated_at: new Date().toISOString(),
      cached: false,
    });
  }
});

// ---- Country digest ----
router.post('/', async (req: Request, res: Response) => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { country_name, in_conflict = false, stability_score = 50 } = parsed.data;
  // Resolve GeoJSON alias → normalised code (e.g. CN-TW → TW)
  const country_code = GEO_ALIASES[parsed.data.country_code] ?? parsed.data.country_code;
  const cacheKey = `atlas:digest:${country_code}`;

  // Cache hit — return immediately
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ ...JSON.parse(cached), cached: true });
    }
  } catch {
    // Redis unavailable — proceed to generate
  }

  // Check normalized disk data from Perplexity pipeline
  try {
    const normalized = await readCountryFromDisk(country_code);
    if (normalized && normalized.events.length > 0) {
      const payload = {
        country_code,
        country_name: normalized.name ?? (country_name ?? country_code),
        in_conflict: normalized.in_conflict,
        events: normalized.events,
        updated_at: new Date().toISOString(),
        cached: false,
        source: 'perplexity',
      };
      try {
        await redis.setex(cacheKey, DIGEST_TTL_SECONDS, JSON.stringify(payload));
      } catch { /* non-fatal */ }
      return res.json(payload);
    }
  } catch { /* disk read failed — continue to Claude */ }

  // No API key — return graceful fallback
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      country_code,
      country_name: country_name ?? country_code,
      in_conflict,
      events: FALLBACK_EVENTS,
      updated_at: new Date().toISOString(),
      cached: false,
    });
  }

  try {
    const events = await generateDigest({
      code: country_code,
      name: country_name ?? country_code,
      in_conflict,
      stability_score,
    });

    const payload = {
      country_code,
      country_name: country_name ?? country_code,
      in_conflict,
      events,
      updated_at: new Date().toISOString(),
      cached: false,
    };

    try {
      await redis.setex(cacheKey, DIGEST_TTL_SECONDS, JSON.stringify(payload));
    } catch { /* non-fatal */ }

    return res.json(payload);
  } catch (err) {
    console.error('[Digest] Claude API error:', err);
    return res.status(502).json({
      country_code,
      country_name: country_name ?? country_code,
      in_conflict,
      events: [{ summary: 'Digest generation temporarily unavailable. Please try again shortly.' }],
      updated_at: new Date().toISOString(),
      cached: false,
    });
  }
});

export default router;
