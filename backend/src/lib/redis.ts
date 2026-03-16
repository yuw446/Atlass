import { Redis } from 'ioredis';

// Singleton Redis client
// REDIS_URL defaults to local Redis for development
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 5) return null; // Stop retrying, let caller handle
    return Math.min(times * 200, 2000);
  },
  enableOfflineQueue: false,
});

redis.on('error', (err: Error) => {
  // Log but don't crash — backend can serve hardcoded data if Redis is unavailable
  console.error('[Redis] Connection error:', err.message);
});
