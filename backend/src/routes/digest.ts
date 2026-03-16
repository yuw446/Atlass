import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { redis } from '../lib/redis.js';
import { generateDigest, DIGEST_TTL_SECONDS } from '../lib/claude.js';

const router = Router();

const RequestSchema = z.object({
  country_code: z.string().length(2).toUpperCase(),
  country_name: z.string().optional(),
  stability_score: z.number().min(0).max(100).optional(),
  unrest_level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { country_code, country_name, stability_score = 50, unrest_level = 0 } = parsed.data;
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

  // Check Claude API key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'Claude API not configured',
      country_code,
      country_name: country_name ?? country_code,
      digest_text: 'Intelligence digest unavailable — API key not configured. Set ANTHROPIC_API_KEY in backend/.env to enable live briefings.',
      top_events: [],
      updated_at: new Date().toISOString(),
      cached: false,
    });
  }

  try {
    const digest_text = await generateDigest({
      code: country_code,
      name: country_name ?? country_code,
      stability_score,
      unrest_level: unrest_level as 0 | 1 | 2 | 3,
    });

    const payload = {
      country_code,
      country_name: country_name ?? country_code,
      stability_score,
      unrest_level,
      digest_text,
      top_events: [],
      updated_at: new Date().toISOString(),
      cached: false,
    };

    // Store with 2h TTL
    try {
      await redis.setex(cacheKey, DIGEST_TTL_SECONDS, JSON.stringify(payload));
    } catch {
      // Non-fatal
    }

    return res.json(payload);
  } catch (err) {
    console.error('[Digest] Claude API error:', err);
    return res.status(502).json({
      error: 'Failed to generate digest',
      country_code,
      digest_text: 'Digest generation temporarily unavailable. Please try again shortly.',
      top_events: [],
      updated_at: new Date().toISOString(),
      cached: false,
    });
  }
});

export default router;
