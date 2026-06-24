# ATLAS — Project Tasks & Progress

> Last updated: 2026-06-24
> Stack: Vite + React 19 + TypeScript + Tailwind v4 (frontend) · Express 5 + TypeScript + Anthropic SDK (backend)

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete |
| 🔄 | In progress / partially done |
| ⬜ | Not started |
| 🚫 | Blocked |
| 💡 | Planned / design phase |

---

## Phase 1 — Foundation ✅ COMPLETE

### Globe Rendering
- ✅ Globe.gl integration with react-globe.gl
- ✅ GeoJSON world polygons (`public/data/countries.geojson`)
- ✅ Binary conflict fill: active conflict (crimson) vs peaceful (navy)
- ✅ Flag-color polygon borders per ISO2 country code
- ✅ ⚔ emoji conflict markers at country centroids via `htmlElementsData`
- ✅ Unrest-level altitude extrusion (0–3 tiers)
- ✅ Hover tooltip with country name, flag, conflict status
- ✅ Animated relationship arcs (conflict / diplomacy / trade)
- ✅ Arc legend (bottom-left)
- ✅ Auto-rotate: enabled when idle/no selection, disabled on country select
- ✅ Camera fly-to on country select (altitude adapts to bounding box)
- ✅ Ocean texture (canvas-generated gradient + wave shimmer)
- ✅ Three.js star field background (3000 points)
- ✅ Sea-boundary coastal glow on hover/select

### Digest Panel
- ✅ Slide-in panel (right side, 380px)
- ✅ Real `POST /api/digest` call on country click
- ✅ Loading skeleton (2 card skeletons)
- ✅ Event type badges (military / diplomatic / economic / humanitarian / political)
- ✅ Source URL links (per event card)
- ✅ Conflict status badge (ACTIVE CONFLICT / NO ACTIVE CONFLICT)
- ✅ Stability index (deemphasized footer row)
- ✅ Data source tag: PERPLEXITY or CLAUDE
- ✅ Error state (backend offline)
- ✅ Mobile responsive (panel slides up from bottom)

### Frontend Data
- ✅ 50-country hardcoded dataset (G20 + all active conflict zones)
- ✅ Hardcoded relationship arcs (13 arcs across conflict / diplomacy / trade)
- ✅ Zustand store (features, arcs, countryMap, hover, select, panel, autoRotate)
- ✅ Vite proxy `/api` → `http://localhost:3001`
- ✅ HMR: force full reload on `hardcoded.ts` changes

### Backend Core
- ✅ Express 5 + TypeScript server (`backend/src/server.ts`)
- ✅ `GET /api/health`
- ✅ `GET /api/globe-data` (hardcoded, not yet live-merged)
- ✅ `POST /api/digest` — Perplexity data → Claude fallback
- ✅ Anthropic SDK integration (`generateDigest()` returns EventCard[])
- ✅ Redis best-effort cache (24h TTL; falls back to disk when offline)
- ✅ `.env` / `.gitignore` / npm workspaces with `concurrently`

---

## Phase 2 — Perplexity Data Pipeline ✅ COMPLETE

### Ingestion Infrastructure
- ✅ Inbox drop zone: `backend/data/inbox/`
- ✅ Archive on success: `backend/data/processed/`
- ✅ Quarantine on failure: `backend/data/failed/` + `.error.json` reports
- ✅ Primary persistent store: `backend/data/normalized/{ISO2}.json`
- ✅ Dual Zod schema: `RawPackageSchema` (permissive) + `NormalizedPackageSchema` (strict)
- ✅ Fuzzy resolver (`fuzzy.ts`): country code (ISO2/ISO3/name/Levenshtein), event type, relationship type, intensity (verbal labels → 0–1), boolean
- ✅ Two-phase validation: rescue/coerce → strict Zod; partial packages accepted
- ✅ Redis cache layer (best-effort; disk-first)
- ✅ `POST /api/ingest/run` — process all inbox files
- ✅ `GET /api/ingest/status` — file counts + last run info

### Live Data
- ✅ First package ingested: 15/15 countries, 0 errors
- ✅ Countries: UA RU IL IR SD MM YE SY ET AF HT PK CN US IN
- ✅ Digest panel reads `normalized/{code}.json` first; Claude is fallback
- ✅ Perplexity spec: `backend/perplexity-spec/INSTRUCTIONS.md` + `example-package.json`

---

## Phase 2 — Remainder ⬜ NOT STARTED

### Live Globe Data Integration
- ⬜ **`/api/globe-data` live merge** — merge `normalized/*.json` into API response to override `in_conflict` and `stability_score` dynamically
- ⬜ **Frontend `useGlobeData` → backend API** — optionally fetch `/api/globe-data` instead of (or to patch) the hardcoded frontend dataset
- ⬜ **Live arcs from Perplexity** — `relationships[]` field in normalized data → new endpoint → frontend hook replaces hardcoded arcs
- ⬜ **Missing polygon countries** — ER, TD, SA, AE referenced in relationship data but have no frontend polygon or centroid entries; add to `hardcoded.ts`
- ⬜ **BullMQ job queue** — prevent concurrent Perplexity pipeline runs

### GDELT Integration
- ⬜ BigQuery client setup + credentials
- ⬜ Goldstein score normalisation (maps −10→+10 to 0→100 stability band)
- ⬜ 15-minute polling cron
- ⬜ Merge GDELT Goldstein scores into `normalized/` country records

---

## Phase 3 — Heatmap Layers 💡 DESIGN PHASE

See **Heatmap Strategy** section below for full design.

### Layer Infrastructure
- ⬜ `layerStore.ts` — active layer state (`null` = default binary view)
- ⬜ `heatmapLayers.ts` — layer registry: id, label, colorScale, dataAccessor
- ⬜ Modify `polygonCapColor` in GlobeRenderer to dispatch to active layer renderer
- ⬜ Layer toggle UI component (bottom-left panel, above legend)

### Layers to Build
- ⬜ **Conflict Intensity** — derived from `events[].intensity` average + relationship intensity
- ⬜ **Displacement Index** — IDP/refugee pressure (Perplexity humanitarian events)
- ⬜ **Political Instability** — inverse of `stability_score` with LAB color ramp
- ⬜ **Economic Impact** — trade disruption score (derived from economic-type events)
- ⬜ **Civilian Severity** — humanitarian event density per country
- ⬜ Legend updates to show active layer color scale

---

## Phase 3 — Digest Panel Polish ⬜

- ⬜ Real images via GDELT `SOURCEURL` headline scraping
- ⬜ 2h cache hit indicator in digest footer (`cached: true` already in schema)
- ⬜ Prompt refinement for Claude fallback (test across 20+ countries)
- ⬜ Rate-limit queue for Claude API bursts

---

## Phase 4 — Arc Relationships & Visual FX ⬜

- ⬜ Live arcs from `relationships[]` Perplexity data (backend endpoint + frontend hook)
- ⬜ Arc filter UI — toggle by type (conflict / diplomacy / trade)
- ⬜ Three.js custom shader for conflict-zone border pulse / glow
- ⬜ Atmospheric glow intensity scaled by unrest level

---

## Phase 5 — Deployment ⬜

- ⬜ Vercel config (`vercel.json`) for frontend
- ⬜ Railway config for backend + Redis
- ⬜ Environment variable management (production vs dev)
- ⬜ Redis online (currently disk-only fallback in dev)
- ⬜ Mobile WebGL fallback (canvas 2D for low-end devices)
- ⬜ Bundle splitting — `react-globe.gl` is ~1.9MB; lazy-load it

---

## Phase 6 — Solar System & Satellite View 💡

- ⬜ Replace star field with solar system scene (Sun, planets in orbit)
- ⬜ Satellite data layer — orbital paths from TLE data
- ⬜ Satellite info panel (on click: name, orbit, operator, purpose)
- ⬜ Toggle between Earth focus and solar system overview

---

## Known Issues / Technical Debt

| Issue | Impact | Fix |
|-------|--------|-----|
| Redis not running locally | Disk-only fallback; all writes succeed | `brew install redis && redis-server` or Railway deploy |
| `GET /api/globe-data` still hardcoded | Frontend reads hardcoded data directly; API not used | Phase 2 remainder task |
| ER, TD, SA, AE not in frontend dataset | Relationship arcs reference these; no polygon enrichment | Add to `hardcoded.ts` |
| No images in digest cards | Placeholder shown for all cards | GDELT SOURCEURL scraping in Phase 3 |
| `frontend/dist/` may be tracked by git | Repo bloat | Verify `.gitignore` covers `frontend/dist/` |
| Globe.gl `polygonStrokeColor` is 1px | Sea-boundary glow is subtle | Workaround via bright colors; no width prop in Globe.gl API |

---

## Heatmap Layers — Strategy & Design

### Motivation
The default binary (conflict / peaceful) view shows *what* is happening but not *how severely* or *in what dimension*. Toggleable heatmap layers let users shift from a situational overview to analytical focus — e.g., "which conflict zones produce the most displacement?" or "where is economic disruption radiating from a conflict?"

### Architecture

```
activeLayer (Zustand) ──► polygonCapColor (GlobeRenderer)
       │                          │
       │               heatmapLayers.ts
       │               ┌─────────────────────────────┐
       │               │  Layer registry:             │
       │               │  { id, label, colorScale,    │
       └──────────────►│    dataAccessor(country) }   │
                       └─────────────────────────────┘
                                  │
                       colorUtils.ts (LAB color ramps)
```

**Key principle:** layers are orthogonal to the binary conflict view. A new `activeLayer` prop in the Zustand store (`null` = default binary view) gates which color function fires in `polygonCapColor`.

### Data Flow per Layer

Each layer has a `dataAccessor(code: string, countryData: CountryData, normalizedData?: NormalizedCountry) => number | null` returning a 0–1 score.

Color is then computed via a per-layer LAB color ramp (e.g., cold blue → hot red for intensity).

### Layer Definitions

| Layer ID | Label | Score Derivation | Color Ramp |
|----------|-------|-----------------|------------|
| `conflict_intensity` | Conflict Intensity | avg(`events[].intensity`) where `event_type === 'military'` | navy → crimson |
| `displacement` | Displacement Index | count of `humanitarian` events / max observed | teal → amber → red |
| `political_instability` | Political Instability | `(100 - stability_score) / 100` | green → amber → red |
| `economic_impact` | Economic Impact | count of `economic` events + trade arc disruption weight | blue → yellow |
| `civilian_severity` | Civilian Severity | humanitarian events with `intensity > 0.6` / total events | purple → orange |

### UI Design

- **Layer toggle bar**: positioned above the legend (bottom-left)
- **Chips**: one per layer + a "DEFAULT" chip to reset
- **Active chip**: highlighted with layer's hot-end color
- **Transition**: `polygonCapColor` animates via a brief opacity fade when layer switches (CSS transition on the `digest-panel` approach won't work for 3D; use a short tween in the color function with a timestamp ref)
- **Legend swap**: the legend block replaces the conflict/peaceful swatches with the active layer's color gradient + label when a layer is active

### Implementation Steps

1. Add `activeLayer: string | null` to `globeStore.ts`
2. Add `setActiveLayer: (id: string | null) => void` action
3. Create `frontend/src/data/heatmapLayers.ts`:
   - Export `HEATMAP_LAYERS: HeatmapLayer[]` registry
   - Each entry: `{ id, label, colorScale: (t: number) => string, dataAccessor }`
4. Modify `GlobeRenderer.polygonCapColor`:
   ```ts
   if (activeLayer) {
     const layer = HEATMAP_LAYERS.find(l => l.id === activeLayer);
     const score = layer?.dataAccessor(code, countryData, normalizedData);
     if (score != null) return layer!.colorScale(score);
   }
   // fall through to default binary logic
   ```
5. Create `LayerToggle.tsx` component (renders chips, dispatches `setActiveLayer`)
6. Mount `<LayerToggle />` in `App.tsx` above the legend div
7. Extend `colorUtils.ts` with per-layer LAB ramp functions

### Data Requirements per Layer

| Layer | Needs from Perplexity | Needs from GDELT |
|-------|----------------------|-----------------|
| Conflict Intensity | `events[].intensity` (military) | Goldstein score |
| Displacement | `events[]` humanitarian count | Actor displacement codes |
| Political Instability | `stability_score` | — |
| Economic Impact | `events[]` economic count | Trade event codes |
| Civilian Severity | humanitarian + intensity | Quad class 4 events |

**Phase 3 can build all layers from Perplexity data alone.** GDELT enrichment (Phase 2 remainder) will make scores more accurate but is not a blocker.
