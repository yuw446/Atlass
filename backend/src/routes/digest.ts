import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { redis } from '../lib/redis.js';
import { generateDigest, FALLBACK_EVENTS, DIGEST_TTL_SECONDS } from '../lib/claude.js';
import { readCountryFromDisk } from '../lib/perplexity/ingest.js';

const router = Router();

const RequestSchema = z.object({
  country_code: z.string().length(2).toUpperCase(),
  country_name: z.string().optional(),
  in_conflict: z.boolean().optional().default(false),
  stability_score: z.number().min(0).max(100).optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { country_code, country_name, in_conflict = false, stability_score = 50 } = parsed.data;
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
      // Populate Redis cache while we're here (best-effort)
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
    } catch {
      // Non-fatal
    }

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
