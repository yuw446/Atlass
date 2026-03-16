import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import globeDataRouter from './routes/globeData.js';
import digestRouter from './routes/digest.js';
import ingestRouter from './routes/ingest.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

// --- Middleware ---
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// --- Routes ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/globe-data', globeDataRouter);
app.use('/api/digest',     digestRouter);
app.use('/api/ingest',     ingestRouter);

// --- Error handler (must be last) ---
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[ATLAS] Backend running on http://localhost:${PORT}`);
  console.log(`[ATLAS] Claude API: ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'NOT configured (set ANTHROPIC_API_KEY)'}`);
});
