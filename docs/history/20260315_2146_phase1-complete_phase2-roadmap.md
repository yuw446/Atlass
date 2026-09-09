# ATLAS — Build Progress

**Date:** 2026-03-15
**Status:** Phase 1 complete. Phase 2 not started.

---

## What's Built (Phase 1)

### Frontend — `frontend/`
Vite + React 19 + TypeScript + Tailwind v4 + `react-globe.gl@2.37.0`

| File | Purpose |
|---|---|
| `src/components/Globe/GlobeRenderer.tsx` | Globe.gl integration — polygons, arcs, hover/click handlers, all 5 visual layers stubbed |
| `src/components/Globe/GlobeContainer.tsx` | ResizeObserver wrapper, shrinks globe width when panel is open |
| `src/components/Globe/colorUtils.ts` | LAB-space stability→hex color interpolation (d3-color, d3-interpolate) |
| `src/components/Globe/useGlobeData.ts` | Fetches GeoJSON, merges hardcoded stability data into features |
| `src/components/DigestPanel/DigestPanel.tsx` | Slide-in digest panel with CSS transition; Phase 1 content is hardcoded |
| `src/store/globeStore.ts` | Zustand store — all globe interaction state (hover, selected, panel open, auto-rotate) |
| `src/data/hardcoded.ts` | 34 countries across full stability spectrum (0–100) + 10 typed arcs |
| `src/types/index.ts` | Shared TypeScript interfaces for CountryData, ArcData, GlobeFeature, DigestData |
| `public/data/countries.geojson` | Natural Earth 110m country polygons (838KB, `ISO_A2` property) |

**Visual layers implemented:**
- **L1 — Nation fill:** Stability score → LAB-interpolated color (volatile red `#7A1515` → neutral amber `#8B6914` → stable blue `#1B4F8A`)
- **L2 — Border stroke:** Stability-tinted border color; white on hover/select (full pulsing glow deferred to Phase 4)
- **L3 — Relationship arcs:** Animated dashed arcs, color-coded by type (teal = trade, red = conflict, amber = diplomacy), thickness by intensity
- **L4 — Unrest altitude:** Polygon altitude scales with unrest level as Phase 1 substitute for pulse shader (real shimmer deferred to Phase 4)
- **L5 — Digest panel:** Slide-in panel with country name, stability meter, unrest dots, hardcoded analysis text, placeholder news links

### Backend — `backend/`
Node.js + Express 5 + TypeScript, `tsx` for dev

| File | Purpose |
|---|---|
| `src/server.ts` | Express entry point, CORS, route registration |
| `src/routes/globeData.ts` | `GET /api/globe-data` — hardcoded country data, Redis-cacheable (5min TTL) |
| `src/routes/digest.ts` | `POST /api/digest` — Claude API with 2h Redis cache; degrades gracefully if key not set |
| `src/lib/claude.ts` | Anthropic SDK wrapper using `claude-haiku-4-5-20251001`; editorial prompt |
| `src/lib/redis.ts` | ioredis singleton with retry strategy and offline queue disabled |
| `src/lib/schema.ts` | Zod schemas for all data contracts — CountryData, Relationship, DigestResponse, GlobeDataResponse |
| `src/middleware/errorHandler.ts` | Express error handler |
| `.env.example` | Template — `ANTHROPIC_API_KEY`, `REDIS_URL`, `CORS_ORIGIN`, `PORT` |

**API endpoints:**
- `GET  /api/health` — liveness check
- `GET  /api/globe-data` — all country composite data
- `POST /api/digest` — body `{ country_code, country_name?, stability_score?, unrest_level? }` → Claude narrative

### Root Workspace
- `package.json` — npm workspaces with `concurrently` for `npm run dev` (starts both frontend + backend)

---

## How to Run

```bash
# Frontend only (works with hardcoded data, no backend needed):
cd frontend && npm run dev      # → http://localhost:5173

# Backend only:
cd backend && npm run dev       # → http://localhost:3001

# Both together:
npm run dev                     # from repo root
```

**To enable live Claude digests:** Add `ANTHROPIC_API_KEY=sk-...` to `backend/.env`. Without it the backend returns a graceful fallback message.

**Redis:** Not required for Phase 1. Backend falls through to hardcoded data if Redis is unavailable.

---

## What's Not Built Yet

### Phase 2 — Data Pipeline (~1 week)

**GDELT integration:**
- [ ] Google BigQuery client setup (requires GCP project + billing account)
- [ ] GDELT query: aggregate Goldstein scores per country over rolling 72h window
- [ ] Normalize Goldstein scale (−10 to +10) → stability score (0–100)
- [ ] Extract `SOURCEURL` for top 3 events per country
- [ ] Write to Redis: `country:{ISO2}:gdelt` hash
- [ ] Cron job (every 15min) or BigQuery scheduled query

**Perplexity agent integration:**
- [ ] BullMQ job queue setup (on Redis) — prevents concurrent pipeline runs
- [ ] Per-country-pair Perplexity API calls (80 pairs: G20 + conflict zones)
- [ ] Zod validation on every Perplexity output — reject malformed JSON, keep previous cache
- [ ] Write to Redis: `relationship:{ISO2_A}:{ISO2_B}`
- [ ] Composite score merge: GDELT + Perplexity → `country:{ISO2}:composite`
- [ ] `score_source` and `data_confidence` fields populated
- [ ] Retry logic with exponential backoff
- [ ] Monitoring endpoint: last N validation failures

**Backend updates:**
- [ ] `/api/globe-data` reads from Redis composite keys instead of hardcoded data
- [ ] `data_confidence` field exposed in API response
- [ ] Staleness indicator in response (timestamp + source)

**Country code alignment:**
- [ ] `countryCodeMap.ts` — explicit ISO2 → GDELT FIPS mapping for all known exceptions
- [ ] Validated against: Norway, Kosovo, France overseas territories, Taiwan edge cases

### Phase 3 — Claude Digest Panel (~3–4 days)

- [ ] Frontend: `POST /api/digest` call on country click (replace placeholder content)
- [ ] Loading skeleton in DigestPanel while Claude responds
- [ ] Real `top_events` from GDELT SOURCEURL (scraped headlines)
- [ ] 2h cache hit shown with subtle "cached" indicator
- [ ] Error state in panel (Claude unavailable → graceful message)
- [ ] Prompt refinement: test across 20+ countries, tune editorial voice
- [ ] Rate limit queue in backend (prevent 429 bursts on traffic spikes)
- [ ] Model decision documented: claude-haiku vs claude-sonnet tradeoff

### Phase 4 — Arc Relationships + Unrest Pulse (~1 week)

**Arc system:**
- [ ] Arcs driven by live relationship data from Perplexity pipeline (replace hardcoded)
- [ ] Arc filter UI: toggle by type (trade / conflict / diplomacy)
- [ ] Arc culling: only render arcs for countries on visible globe face (dot product test)
- [ ] Arc thickness scaled from Perplexity `intensity` float

**Unrest pulse shader:**
- [ ] Access Globe.gl internal scene: `globe.scene()` and `globe.renderer()`
- [ ] Custom Three.js shader material per polygon (noise-based shimmer)
- [ ] OR: `EffectComposer` bloom pass for L2 border glow — attach to Globe.gl renderer
- [ ] Prototype shader separately before integrating to avoid Globe.gl internals breaking on upgrade

**L2 border glow:**
- [ ] `UnrealBloomPass` via Three.js `EffectComposer` attached to Globe.gl's renderer
- [ ] Pulsing red glow on disputed/conflict borders

### Phase 5 — Polish + Deploy (ongoing)

- [ ] Vercel deployment for frontend (`vercel.json` config)
- [ ] Railway deployment for backend + Redis
- [ ] Environment variable management (Railway secrets, Vercel env)
- [ ] Mobile: test WebGL on Safari iOS; provide 2D SVG fallback if WebGL fails
- [ ] Initial load state: skeleton/spinner while GeoJSON + Globe.gl initialize (2–3s)
- [ ] Bundle splitting: dynamic import Globe.gl to reduce initial chunk (currently 1.9MB)
- [ ] Performance: arc culling, polygon LOD at high zoom
- [ ] Accessibility: keyboard navigation for country selection
- [ ] Time-scrubber (deferred from original scope — requires PostgreSQL time-series store, not Redis)

---

## Known Design Decisions & Risks

| Decision | Rationale |
|---|---|
| `claude-haiku` over `claude-sonnet` | ~100x cost difference; validate haiku quality before upgrading |
| Globe.gl over raw Three.js | Week-1 speed; L2/L4 shaders require reaching into internals (documented above) |
| BigQuery over GDELT CSV dumps | CSV dumps are 50MB gzip every 15min — not tractable for a single Node process |
| BullMQ over raw cron | Prevents concurrent Perplexity runs; child job retries and validation |
| Zod on all pipeline outputs | Perplexity schema drift is the most likely silent failure mode |
| `data_confidence` field in schema | GDELT undercounts instability in low English-language-media countries |
| Redis as cache not DB | Time-scrubber would require PostgreSQL + backfill — deferred to post-Phase-5 |
| ISO_A2 → GDELT code mapping | Three-way mismatch (GeoJSON / REST Countries / GDELT FIPS) has ~30-40 known exceptions |
