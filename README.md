# Atlass

An interactive 3D globe for **geospatial conflict intelligence**. It visualises
global conflict zones and geopolitical stability on a Three.js globe and generates
a per-country intelligence digest on demand: click a country, get a short briefing
of what's happening there, assembled from a curated dataset and an LLM analyst.
Conflict status drives the globe's colours and per-country markers.

## Stack

- **Frontend** (`frontend/`) — React 19 + Vite, [`react-globe.gl`](https://github.com/vasturiano/react-globe.gl) (Three.js), Tailwind v4, Zustand for state.
- **Backend** (`backend/`) — Express 5 + TypeScript, the Anthropic SDK (Claude) for digests, Zod for validation, Redis (best-effort) for caching.
- npm-workspaces monorepo.

## Quick start

```bash
npm install                       # installs both workspaces

# the backend needs an Anthropic key for live digests
# (without one it returns a clear placeholder, the app still runs):
echo "ANTHROPIC_API_KEY=sk-ant-..." > backend/.env

npm run dev                       # frontend + backend together (concurrently)
# or individually: npm run dev:frontend  /  npm run dev:backend
```

The frontend opens on Vite's dev port; the backend serves `/api`. Backend env:
`ANTHROPIC_API_KEY` (digests), `PORT`, `CORS_ORIGIN`, optional `REDIS_URL`.

## How it works

1. The globe loads world GeoJSON polygons and enriches them with a curated dataset
   of ~50 countries (`frontend/src/data/hardcoded.ts`: stability, conflict status,
   centroid). Countries not in the set render as peaceful defaults.
2. Each country's **conflict status** (a six-tier taxonomy) drives the globe fill
   colour and a ⚔ centroid marker.
3. Clicking a country opens the **digest panel**, which `POST`s to `/api/digest`.
   The backend reads normalised on-disk data first and falls back to the Claude API,
   caching in Redis (best-effort, 24h).

See **`CLAUDE.md`** for architecture and conventions, **`LIMITATIONS.md`** for known
edge cases, and **`TASKS.md`** for the roadmap. Live GDELT event data and a
coordinate (hex) digest are in progress on the `wip/gdelt-integration` branch.

## License

Atlass is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) — see
[`LICENSE`](LICENSE). © 2026 yuw446. AGPL's network-use clause (§13) is deliberate: because Atlass
is meant to be run as a hosted service, anyone who runs a modified version over a network must offer
their users the corresponding source.
