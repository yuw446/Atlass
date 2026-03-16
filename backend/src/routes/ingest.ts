import { Router, type Request, type Response } from 'express';
import { scanInbox, getInboxStatus } from '../lib/perplexity/index.js';

const router = Router();

/**
 * POST /api/ingest/run
 * Scans backend/data/inbox/, processes all .json files, returns a run summary.
 */
router.post('/run', async (_req: Request, res: Response) => {
  try {
    const result = await scanInbox();
    return res.json(result);
  } catch (err) {
    console.error('[Ingest route] Error during scan:', err);
    return res.status(500).json({ error: 'Ingest failed', detail: (err as Error).message });
  }
});

/**
 * GET /api/ingest/status
 * Returns file counts across inbox/processed/failed and the last run summary.
 * Does not process any files.
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getInboxStatus();
    return res.json(status);
  } catch (err) {
    console.error('[Ingest route] Error reading status:', err);
    return res.status(500).json({ error: 'Status check failed', detail: (err as Error).message });
  }
});

export default router;
