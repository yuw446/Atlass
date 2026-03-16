import { Router, type Request, type Response } from 'express';
import { redis } from '../lib/redis.js';

const router = Router();

const REDIS_KEY = 'atlas:globe_data';

// Hardcoded Phase 1 data — mirrored from frontend for backend serving
// Phase 2: replace with live GDELT + Perplexity data
const HARDCODED_DATA = {
  countries: [
    { code: 'NO', name: 'Norway',       stability_score: 94, unrest_level: 0, centroid: [60.5, 8.5],     flag: '🇳🇴', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'CH', name: 'Switzerland',  stability_score: 91, unrest_level: 0, centroid: [46.8, 8.2],     flag: '🇨🇭', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'NZ', name: 'New Zealand',  stability_score: 90, unrest_level: 0, centroid: [-40.9, 174.9],  flag: '🇳🇿', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'FI', name: 'Finland',      stability_score: 89, unrest_level: 0, centroid: [61.9, 25.7],    flag: '🇫🇮', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'CA', name: 'Canada',       stability_score: 85, unrest_level: 0, centroid: [56.1, -106.3],  flag: '🇨🇦', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'AU', name: 'Australia',    stability_score: 83, unrest_level: 0, centroid: [-25.3, 133.8],  flag: '🇦🇺', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'JP', name: 'Japan',        stability_score: 82, unrest_level: 0, centroid: [36.2, 138.2],   flag: '🇯🇵', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'DE', name: 'Germany',      stability_score: 79, unrest_level: 0, centroid: [51.2, 10.4],    flag: '🇩🇪', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'GB', name: 'UK',           stability_score: 76, unrest_level: 0, centroid: [55.4, -3.4],    flag: '🇬🇧', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'FR', name: 'France',       stability_score: 75, unrest_level: 1, centroid: [46.2, 2.2],     flag: '🇫🇷', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'US', name: 'USA',          stability_score: 72, unrest_level: 1, centroid: [37.1, -95.7],   flag: '🇺🇸', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'KR', name: 'South Korea',  stability_score: 74, unrest_level: 1, centroid: [35.9, 127.8],   flag: '🇰🇷', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'IT', name: 'Italy',        stability_score: 68, unrest_level: 1, centroid: [41.9, 12.6],    flag: '🇮🇹', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'CN', name: 'China',        stability_score: 62, unrest_level: 1, centroid: [35.9, 104.2],   flag: '🇨🇳', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'BR', name: 'Brazil',       stability_score: 60, unrest_level: 1, centroid: [-14.2, -51.9],  flag: '🇧🇷', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'IN', name: 'India',        stability_score: 57, unrest_level: 1, centroid: [20.6, 78.9],    flag: '🇮🇳', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'ZA', name: 'South Africa', stability_score: 52, unrest_level: 1, centroid: [-30.6, 22.9],   flag: '🇿🇦', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'AR', name: 'Argentina',    stability_score: 49, unrest_level: 1, centroid: [-38.4, -63.6],  flag: '🇦🇷', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'MX', name: 'Mexico',       stability_score: 47, unrest_level: 2, centroid: [23.6, -102.5],  flag: '🇲🇽', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'EG', name: 'Egypt',        stability_score: 43, unrest_level: 2, centroid: [26.8, 30.8],    flag: '🇪🇬', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'TR', name: 'Turkey',       stability_score: 42, unrest_level: 2, centroid: [38.9, 35.2],    flag: '🇹🇷', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'PK', name: 'Pakistan',     stability_score: 38, unrest_level: 2, centroid: [30.4, 69.3],    flag: '🇵🇰', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'NG', name: 'Nigeria',      stability_score: 35, unrest_level: 2, centroid: [9.1, 8.7],      flag: '🇳🇬', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'VE', name: 'Venezuela',    stability_score: 32, unrest_level: 3, centroid: [6.4, -66.6],    flag: '🇻🇪', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'RU', name: 'Russia',       stability_score: 30, unrest_level: 2, centroid: [61.5, 105.3],   flag: '🇷🇺', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'IL', name: 'Israel',       stability_score: 28, unrest_level: 3, centroid: [31.0, 34.9],    flag: '🇮🇱', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'ET', name: 'Ethiopia',     stability_score: 25, unrest_level: 3, centroid: [9.1, 40.5],     flag: '🇪🇹', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'UA', name: 'Ukraine',      stability_score: 20, unrest_level: 3, centroid: [48.4, 31.2],    flag: '🇺🇦', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'MM', name: 'Myanmar',      stability_score: 15, unrest_level: 3, centroid: [21.9, 95.9],    flag: '🇲🇲', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'SD', name: 'Sudan',        stability_score: 12, unrest_level: 3, centroid: [12.9, 30.2],    flag: '🇸🇩', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'HT', name: 'Haiti',        stability_score: 9,  unrest_level: 3, centroid: [18.9, -72.3],   flag: '🇭🇹', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'SY', name: 'Syria',        stability_score: 8,  unrest_level: 3, centroid: [34.8, 38.9],    flag: '🇸🇾', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'YE', name: 'Yemen',        stability_score: 6,  unrest_level: 3, centroid: [15.6, 48.5],    flag: '🇾🇪', score_source: 'hardcoded', data_confidence: 'high' },
    { code: 'AF', name: 'Afghanistan',  stability_score: 5,  unrest_level: 3, centroid: [33.9, 67.7],    flag: '🇦🇫', score_source: 'hardcoded', data_confidence: 'high' },
  ],
};

router.get('/', async (_req: Request, res: Response) => {
  // Try Redis cache first
  try {
    const cached = await redis.get(REDIS_KEY);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
  } catch {
    // Redis unavailable — fall through to hardcoded data
  }

  const payload = {
    ...HARDCODED_DATA,
    updated_at: new Date().toISOString(),
    source: 'hardcoded',
  };

  // Cache in Redis for 5 minutes if available
  try {
    await redis.setex(REDIS_KEY, 300, JSON.stringify(payload));
  } catch {
    // Non-fatal
  }

  return res.json(payload);
});

export default router;
