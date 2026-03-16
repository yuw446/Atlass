# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development (from repo root)
```bash
npm run dev              # start frontend (port 5173) + backend (port 3001) concurrently
npm run dev:frontend     # frontend only
npm run dev:backend      # backend only
npm run build:frontend   # tsc + vite build
```

### Frontend (from `frontend/`)
```bash
npm run dev      # vite dev server
npm run build    # tsc -b && vite build
npm run lint     # eslint
npm run preview  # preview production build
```

### Backend (from `backend/`)
```bash
npm run dev      # tsx watch src/server.ts
npm run build    # tsc
npm run start    # node dist/server.js
```

### Ingest (trigger Perplexity pipeline manually)
```bash
# Drop JSON files into backend/data/inbox/ then:
curl -X POST http://localhost:3001/api/ingest/run
curl http://localhost:3001/api/ingest/status
```

## Architecture

### Monorepo layout
```
Atlass/
├── frontend/          # Vite + React 19 + TypeScript + Tailwind v4
├── backend/           # Express 5 + TypeScript + Anthropic SDK
├── TASKS.md           # Phase roadmap
└── package.json       # npm workspaces root
```

### Frontend data flow
1. `useGlobeData` hook fetches `/public/data/countries.geojson` and enriches features with `HARDCODED_COUNTRIES` from `src/data/hardcoded.ts`
2. Enriched GeoJSON features + `HARDCODED_ARCS` are stored in **Zustand** (`globeStore.ts`)
3. `GlobeRenderer` reads from the store; polygon fill color is driven by `ConflictStatus` via `colorUtils.ts` lookup tables
4. Clicking a country opens `DigestPanel`, which POSTs to `/api/digest`
5. Vite proxy forwards `/api/*` → `http://localhost:3001`

### Backend data flow
```
backend/data/inbox/        ← Perplexity drops JSON packages here
         ↓ POST /api/ingest/run
backend/data/normalized/   ← {ISO2}.json per country (primary store)
         ↓
Redis atlas:perplexity:country:{ISO2}  ← 24h cache (best-effort)
         ↓
GET /api/digest  →  reads normalized disk data first, falls back to Claude API
```

### Key design patterns

**Two-source digest priority** (`routes/digest.ts`):
Perplexity disk data → Claude API fallback → static fallback message. Redis is checked first in all cases.

**Two-phase Perplexity validation** (`lib/perplexity/validate.ts`):
Phase 1 rescues/coerces (fuzzy country codes, intensity clamping, boolean coercion). Phase 2 applies strict Zod schemas. Invalid files → `data/failed/`; valid files → `data/processed/`.

**Globe polygon enrichment** (`useGlobeData.ts`):
GeoJSON features for 195+ countries are enriched with hardcoded data (stability, conflict status, centroid). Countries not in `hardcoded.ts` render as peaceful defaults. A `densifyRing()` pass adds intermediate points on edges > 3° to prevent Globe.gl tessellation artifacts at high latitudes (Greenland, Russia).

**HMR invalidation** (`useGlobeData.ts`):
`import.meta.hot.accept('../../data/hardcoded', () => import.meta.hot!.invalidate())` forces a full page reload when `hardcoded.ts` changes, preventing stale-closure bugs in the enrichment effect.

**Globe auto-rotate** (`globeStore.ts`):
`selectCountry()` sets `autoRotate: false`; `closePanel()` sets it back to `true`. No mouse enter/leave handlers on the globe div — they fired on panel-open resize and caused a stale-closure re-enable bug.

**Taiwan GeoJSON alias** (`routes/digest.ts`):
GeoJSON uses `ISO_A2: "CN-TW"` for Taiwan; normalized data uses `TW`. The `GEO_ALIASES` map in the digest route resolves this before disk lookup.

### ConflictStatus taxonomy
Six values drive both globe fill colors and the digest panel status badge:
```
active_conflict | military_operation | impacted | civil_unrest | ceasefire | peaceful
```
Color maps live in `frontend/src/components/Globe/colorUtils.ts` (`STATUS_FILLS`, `STATUS_HOVER_FILLS`, `STATUS_SELECTED_FILLS`). The panel maps them in `DigestPanel.tsx` (`STATUS_DISPLAY`). The globe and panel always read `conflict_status` from `countryMap` (derived from `hardcoded.ts`), not from the API response.

### Adding a new country
1. Add entry to `HARDCODED_COUNTRIES` in `frontend/src/data/hardcoded.ts` — include `code` (ISO_A2 matching GeoJSON), `centroid`, `conflict_status`, `unrest_level`, `in_conflict`, `stability_score`, `flag_color`, `flag`
2. If the country needs arcs, add to `HARDCODED_ARCS`
3. A matching GeoJSON polygon must exist in `/public/data/countries.geojson` — missing codes log a console warning

### Perplexity data packages
Format documented in `backend/perplexity-spec/INSTRUCTIONS.md`. Key rules:
- Drop `*.json` files in `backend/data/inbox/`
- Use **real citation URLs only** — never construct/guess `source_url`
- Use **direct CDN image URLs** for `image_url` (`.jpg/.png/.webp`), or omit
- `conflict_status` field: use one of the 6 `ConflictStatus` values

**Keep the spec in sync.** Whenever the ingestion schema changes — new fields added to `EventCard`, `CountryEntry`, or `Relationship`; new `event_type` or `conflict_status` values; changed validation rules — update **both**:
1. `backend/perplexity-spec/INSTRUCTIONS.md` — human-readable spec Perplexity reads
2. `backend/perplexity-spec/example-package.json` — concrete example that should always reflect valid current format

The spec is the contract between Atlas and Perplexity. An out-of-date spec causes Perplexity to send stale formats that get rescued/coerced by the fuzzy validator rather than arriving correctly structured.

### Keeping LIMITATIONS.md current
`LIMITATIONS.md` documents confirmed technical limitations — things that are accepted, deferred, or blocked on external dependencies. Update it whenever:
- A bug investigation reveals a root cause that can't be fixed cleanly right now
- A fix attempt fails (document *what was tried and why it didn't work* — this prevents re-attempting the same dead end)
- A limitation is resolved (remove or mark it resolved with a note on what fixed it)
- A new external constraint is discovered (API limitation, library restriction, WebGL constraint, etc.)

Do not duplicate items already in TASKS.md unless the limitation needs a root-cause explanation that a task entry can't hold.

### Keeping TASKS.md current
`TASKS.md` is the source of truth for project progress. Update it at the end of every work session:
- Mark completed items `✅`
- Move items from `⬜` to `🔄` when partially done
- Add new issues/debt to the **Known Issues / Technical Debt** table
- Update the `> Last updated:` date at the top

Do not let TASKS.md drift — it is used to orient future Claude sessions and plan the next phase.

### Environment variables
```
# backend/.env
ANTHROPIC_API_KEY=...        # required for Claude fallback in /api/digest
REDIS_URL=redis://...        # optional; system degrades gracefully without Redis
CORS_ORIGIN=http://localhost:5173
PORT=3001
```
