# Atlas — Known Limitations

> Last updated: 2026-03-16

This document records confirmed technical limitations, root causes, and the status of any workarounds. It is distinct from TASKS.md (which tracks work to be done) — items here are limitations that are either accepted, deferred, or require external dependencies to resolve.

---

## Globe Rendering

### Large polygon tessellation artifacts (Greenland, Russia, Canada, Antarctica)

**Symptom:** Country fill has zigzag edges, triangular gaps, or regions that appear to extend beyond the actual border.

**Root cause:** Globe.gl tessellates GeoJSON polygon edges as straight line segments in 3D space. For large or high-latitude polygons, long edges between vertices become chords that cut through the interior of the sphere rather than following the surface, producing visible artifacts.

**Workaround in place:** `densifyRing()` in `useGlobeData.ts` inserts intermediate vertices along any edge longer than 3° so the tessellator approximates the curved surface. This eliminates the worst artifacts but does not fully correct all cases — Greenland in particular still shows minor imperfections at some zoom levels due to the extreme latitude of its northern coastline.

**What was tried and failed:**
- Polygon winding-order correction using the shoelace signed-area formula. The formula is unreliable for geographic polygons: it produces incorrect sign for large-extent shapes, antimeridian-crossing polygons, and polar regions. Applying it to all features caused every polygon to fill its complement area (the entire globe except the country), making the globe fully red and extremely slow. Reverted.

**Proper fix (not yet implemented):** Densification threshold could be reduced further (e.g., 1°) at the cost of significantly more vertices and slower rendering. Alternatively, switching to a higher-resolution GeoJSON source (Natural Earth 10m vs current 50m or 110m) would reduce the edge length of problematic polygons without code changes. A spherical geometry library (e.g., `@turf/great-circle`) could split long edges along great-circle arcs rather than straight-line interpolation.

---

### Polygon border width not configurable

**Symptom:** Country sea-boundary / coastline strokes are always 1px regardless of styling.

**Root cause:** Globe.gl's `polygonStrokeColor` prop does not expose a width control. The underlying Three.js `LineSegments` renderer on WebGL ignores `linewidth > 1` on most platforms (WebGL 1 limitation).

**Workaround in place:** Bright colors (`#A8DCFF` selected, `#3FA8E0` hover, `rgba(80,150,220,0.45)` default) compensate visually for the thin stroke.

**Proper fix:** Implement country borders as a separate `arcsData` layer using fat-line geometry, or upgrade to a Globe.gl version that supports polygon stroke width if one becomes available.

---

### Taiwan GeoJSON code mismatch

**Symptom:** Taiwan's polygon uses `ISO_A2: "CN-TW"` in the Natural Earth GeoJSON, which differs from the standard `"TW"` used everywhere else in Atlas.

**Root cause:** Natural Earth's political classification encodes Taiwan as a subdivision of China in its ISO field.

**Workaround in place:** `hardcoded.ts` uses `code: "CN-TW"` for polygon enrichment matching. The backend digest route has `GEO_ALIASES: { "CN-TW": "TW" }` to resolve it before disk lookup.

**Status:** Accepted — changing the underlying GeoJSON would require patching the source file and revalidating all polygon codes.

---

## Data Pipeline

### Perplexity does not reliably provide image URLs

**Symptom:** Event cards in the digest panel always show the "IMAGE PENDING" placeholder; `image_url` is never populated.

**Root cause:** Perplexity's web search results expose article page URLs, not direct CDN image URLs. Obtaining a direct image URL requires inspecting the page source or right-clicking the image within the Perplexity session — a manual step that is easy to skip.

**Workaround in place:** `INSTRUCTIONS.md` now explicitly describes how to find CDN image URLs and mandates their inclusion. This relies on Perplexity following the spec, which is not guaranteed.

**Proper fix (Phase 3):** GDELT `SOURCEURL` scraping — fetch each event's source URL, extract the Open Graph `og:image` meta tag, and store that as `image_url` during ingestion.

---

### Perplexity fabricates source URLs

**Symptom:** Links in the digest panel return 404 or load unrelated pages.

**Root cause:** Perplexity constructs plausible-looking article paths (e.g., `reuters.com/world/invented-path-2026/`) rather than copying the actual citation URL from its search results.

**Workaround in place:** `INSTRUCTIONS.md` includes a prominent warning section explicitly prohibiting constructed URLs and requiring that only real citation URLs are used. Broken links are preferable to fabricated ones, so the spec instructs omitting `source_url` when uncertain.

**Status:** Data-quality issue dependent on Perplexity compliance. No automated validation possible without making live HTTP requests to all URLs at ingest time (feasible but not yet implemented).

---

### `/api/globe-data` serves hardcoded data only

**Symptom:** The globe's `in_conflict` and `stability_score` values do not update when new Perplexity packages are ingested — they always reflect the values in `frontend/src/data/hardcoded.ts`.

**Root cause:** The backend `/api/globe-data` route serves the same hardcoded dataset as the frontend. The live merge of `normalized/*.json` into the globe data API has not been implemented.

**Status:** Phase 2 remainder task. The digest panel does read live Perplexity data correctly (via `/api/digest`). Only the globe polygon fill colors and conflict markers are affected.

---

### Relationship arc countries missing from frontend dataset

**Symptom:** Countries referenced in Perplexity `relationships[]` data (e.g., ER, TD, AE) have no hardcoded entry, so they receive no polygon enrichment and their arcs cannot be visualised from the frontend.

**Status:** Phase 2 remainder task — add missing countries to `hardcoded.ts`.

---

### No concurrency protection on the ingestion pipeline

**Symptom:** If `POST /api/ingest/run` is called while a previous run is still processing, both runs operate on the same inbox files simultaneously, potentially causing duplicate writes or partial normalized output.

**Status:** Phase 2 remainder task — BullMQ job queue to serialise runs.

---

## Backend Infrastructure

### Redis not available in local development

**Symptom:** All cache writes silently fail; every request reads from disk or calls the Claude API directly. No error is surfaced to the user.

**Root cause:** Redis is not installed or running locally by default.

**Workaround in place:** The Redis client is initialised with `lazyConnect: true`, a 5-retry cap, and `enableOfflineQueue: false`. All cache operations are wrapped in try/catch with non-fatal handling. The system degrades gracefully to disk reads.

**To enable locally:** `brew install redis && redis-server` or point `REDIS_URL` in `backend/.env` to a Railway/Upstash instance.

---

## Frontend

### Globe.gl bundle size

**Symptom:** Initial page load is slow; `react-globe.gl` + Three.js contribute approximately 1.9 MB to the bundle.

**Status:** Phase 5 task — lazy-load the globe component so the initial render is not blocked by the Three.js payload.

---

### No WebGL fallback

**Symptom:** On devices without WebGL support (some mobile browsers, older hardware), the globe does not render and the page shows a blank canvas.

**Status:** Phase 5 task — canvas 2D fallback for low-end devices.
