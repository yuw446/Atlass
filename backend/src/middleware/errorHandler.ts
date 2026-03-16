import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[ATLAS Backend] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
}
