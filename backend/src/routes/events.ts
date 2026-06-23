import { Router, type Request, type Response } from 'express';
import { redis } from '../lib/redis.js';
import { fetchGdeltEvents, type GdeltEvent } from '../lib/gdelt.js';

const router = Router();

const CACHE_TTL_SECONDS = 3600; // 1 hour

function cacheKey(hours: number) {
  return `atlas:gdelt:events:${hours}`;
}

router.get('/', async (req: Request, res: Response) => {
  const hours = Math.min(Math.max(parseInt(String(req.query.hours ?? '24'), 10) || 24, 1), 48);

  // Cache hit
  try {
    const cached = await redis.get(cacheKey(hours));
    if (cached) {
      return res.json({ ...JSON.parse(cached), cached: true });
    }
  } catch { /* Redis unavailable — proceed */ }

  try {
    const events: GdeltEvent[] = await fetchGdeltEvents(hours);

    const payload = {
      events,
      generated_at: new Date().toISOString(),
      source: 'gdelt',
      hours,
      cached: false,
    };

    try {
      await redis.setex(cacheKey(hours), CACHE_TTL_SECONDS, JSON.stringify(payload));
    } catch { /* non-fatal */ }

    return res.json(payload);
  } catch (err) {
    console.error('[Events] GDELT fetch error:', err);

    // Return stale cache if available
    try {
      const stale = await redis.get(cacheKey(hours));
      if (stale) {
        return res.status(503).json({ ...JSON.parse(stale), stale: true, error: 'GDELT_UNAVAILABLE' });
      }
    } catch { /* Redis also unavailable */ }

    return res.status(503).json({
      events: [],
      generated_at: new Date().toISOString(),
      source: 'gdelt',
      hours,
      cached: false,
      error: 'GDELT_UNAVAILABLE',
    });
  }
});

export default router;
