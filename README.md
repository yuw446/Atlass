# Atlas

**The news, by place.** News is organised by topic; Atlas re-projects it onto the globe so the people and the
environment behind a story stay in frame. Every hour a few thousand stories from GDELT's Global Knowledge Graph
(published every 15 minutes) land on the country they are about. Three lenses, chosen because those topics are spatial by nature: conflict,
disaster and climate, unrest. Click a country to read what is being written about it right now.

Live: **https://yuw446.github.io/Atlass/** · data: `https://yuw446.github.io/Atlass/data/latest.json`

## How it works

```
GDELT GKG (every 15 min)  →  worker/tick.ts, hourly on GitHub Actions (dispatched by infra/tick-dispatch)
                          →  gh-pages branch: data/latest.json, data/hours/, data/state.json  (one commit, always)
                          →  GitHub Pages serves the site and the data from the same origin
frontend (Vite + React + Globe.gl) polls data/latest.json every minute and paints the globe
```

- **Fill colour** is the country's dominant lens over the last two hours; **brightness** is how unusual its
  attention is against its own one-week baseline, so a small country can outshine a large one.
- **Sparks** are the current batch's stories at their coordinates.
- **The panel** shows real headlines, images, sources and times from the feed. No language model anywhere.
- Media attention, not ground truth; English-language sources; automatic tagging that is sometimes wrong. The page says so.

## Run it

```bash
nvm use                           # Node 24 (.nvmrc); the worker runs TypeScript directly
npm install                       # installs the frontend workspace
npm test                          # shared/, worker/, frontend/src/lib tests, no dependencies needed
npm run dev:frontend              # http://localhost:5173/Atlass/ — reads the live feed from Pages via a dev proxy
npm run tick -- --site ./site     # run the worker once into ./site/data (needs network)
npm run gen:codes                 # regenerate shared/codes.generated.ts after changing the GeoJSON
```

## Layout

```
shared/        lenses, country codes (generated from the GeoJSON), the snapshot contract    ← used by both sides
worker/        tick.ts: one GDELT batch in, three files out; tests against a real fixture batch
frontend/      Vite + React 19 + react-globe.gl + Tailwind v4; frontend/src/lib is pure and tested
scripts/       gen-codes.ts
.github/       tick.yml (hourly), pages.yml (site build on push to main), keepalive.yml (weekly)
docs/history/  the original brief and the first attempt's planning notes
```

See `CLAUDE.md` for conventions and gotchas, `LIMITATIONS.md` for what is known to be imperfect, `TASKS.md` for what is next.

## License

AGPL-3.0, see `LICENSE`. The network-use clause is deliberate: anyone running a modified Atlas as a service must offer
their users the source.

Country outlines are Natural Earth 110m (public domain). The globe surface is NASA Blue Marble (public domain), taken
from the [three-globe](https://github.com/vasturiano/three-globe) example images (MIT). Stories are GDELT's.
