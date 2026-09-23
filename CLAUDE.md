# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands (from the repo root)

```bash
nvm use                                 # Node 24; type stripping runs .ts directly, no build step for worker/shared
npm install                             # frontend workspace only; shared/ and worker/ have no dependencies
npm test                                # node --test over shared/*.test.ts, worker/*.test.ts, frontend/src/lib/*.test.ts
npm run tick -- --site ./site           # run one worker tick locally (writes ./site/data; needs network)
npm run gen:codes                       # regenerate shared/codes.generated.ts from the GeoJSON
npm run audit -- <batch id | zip>       # print what one GKG batch would lens (docs/precision-check.md)
npm run clean:state -- <dir> [--write]  # re-apply the filters to a copy of the published state after a rule change
npm run dev:frontend                    # Vite dev server at http://localhost:5173/Atlass/ (live feed via proxy)
npm run build:frontend                  # tsc -b && vite build
cd frontend && npx eslint .             # lint (react-hooks rules are strict: no setState in effects, no refs in render)
```

There is no backend server, no API key, no Redis, no environment variables.

## Architecture

```
shared/    lenses.ts (theme sets, scoring)  codes.ts + codes.generated.ts (FIPS→ISO, geoCode)  snapshot.ts (contract + guard)
           title.ts (trimTitle for the panel; titleTokens + sameStory for the worker's dedupe)
worker/    tick.ts — the whole pipeline, one entry point, stdlib only            tick.test.ts + fixtures/ (real batch, 200 rows + edge rows)
frontend/  src/lib (pure, tested): snapshotState, fill, tween, text, densify; hooks useSnapshot, useTween
           src/components/Globe (renderer, container, useGlobeData)  src/components/StoryPanel  src/store/globeStore.ts
.github/   tick.yml (hourly, no npm ci, tests gate the tick, force-push gh-pages)  pages.yml (build + publish site)  keepalive.yml
```

**Data flow.** `lastupdate.txt` → GKG zip → `worker/tick.ts` → `data/latest.json`, `data/hours/`, `data/state.json`
on the `gh-pages` branch, which also holds the built site. Pages serves both from the same origin. The page polls
`./data/latest.json` every minute. The design of record (approved and eng-reviewed, with the amendments index) is at
`~/.gstack/projects/yuw446-Atlass/faye-claude-project-revival-core-e38374-design-20260907-115409.md`. It predates the
2026-09-11 drop of the displacement lens; `LIMITATIONS.md` is authoritative for the lens set.

## Rules that are load-bearing

- **Lenses, not layers.** Three lenses in `shared/lenses.ts`, chosen because the topic is spatial (displacement was
  dropped on 2026-09-11: too few stories to score or learn from). Lens indices are positional in the snapshot, so a
  lens is only ever removed from the end and `migrateState()` truncates stored state on load. Do not add a layer
  registry, a taxonomy, or a heatmap. A lens needs ≥ 2 theme occurrences and ≥ 1 per 200 words; `support` themes only confirm, `veto` themes remove;
  `MANMADE_DISASTER_IMPLIED` and `NATURAL_DISASTER_ICE`/`ICY`/`CHILL` never count. Entertainment sections and
  headlines are dropped in the worker (`NON_NEWS_PATH`, `NON_NEWS_TITLE`).
- **One contract.** `shared/snapshot.ts` is the type and the runtime guard for `latest.json`, used by the worker
  (before writing) and the frontend (before rendering). Change it in one place; bump `schema` for breaking changes.
- **One country key.** The frontend stamps `properties.code` via `geoCode()` (ISO_A2_EH, then ISO_A2, CN-TW → TW) and
  reads nothing else. GDELT codes are FIPS; `fipsToIso()` maps them through the table generated from the GeoJSON.
- **`features` identity never changes after load.** The colour tween re-reads the accessor 30 times a second; a new
  `polygonsData` array would re-tessellate 175 polygons per frame.
- **three-globe does not tween colour.** `useTweenedColors` does, app-side, in LAB, reduced-motion aware.
- **Sparks use `pointsMerge`.** One draw call, no per-point interaction, by design.
- **Trust boundary is the worker.** URLs must parse as http(s) and be ≤ 2 KB; images https only; headlines are
  entity-decoded there. The panel adds `noopener noreferrer`, `referrerPolicy="no-referrer"`, lazy images with a fallback.
- **The worker must never stall.** A 404 on a non-latest slot is skipped and recorded; a 404 on the latest slot is
  GDELT's publish race, retried 4×30 s then left for the next cron; any other failure exits 1 and the next cron retries.
- **gh-pages is one commit.** Both workflows amend and force-push under the `tick` concurrency group. `hours/` is the history.

## Gotchas

- GDELT publishes `lastupdate.txt` before the GKG upload finishes, and batch labels can run up to ten minutes ahead of
  wall-clock. The frontend clamps age at zero.
- The tick reads the origin bucket `storage.googleapis.com/data.gdeltproject.org/` (`GDELT_ORIGIN`), not the
  `data.gdeltproject.org` CDN: the CDN's 404 for an unpublished zip is `cache-control: public, max-age=3600`, so
  every retry inside the hour got the cached miss; the bucket's 404 is `private, max-age=0`. Same paths, same bytes.
- The repository is private on GitHub Pro. Pages works on private repos. The tick ran every 15 minutes until
  2026-09-23; at about 2,900 of 3,000 Actions minutes a month it had no headroom, and GitHub stopped starting jobs on
  2026-09-16 (the run shows no log; the reason is in the check-run annotation). It now runs hourly (about 720 minutes)
  and walks the hour's four batches; `latest.json` carries the hour's sparks and totals (`mergeHour`). The tick job installs nothing so it stays fast.
- GitHub's `schedule` trigger dropped 42 of the first 44 ticks on this private repo. The punctual trigger is
  `infra/tick-dispatch/`, a Cloudflare Worker whose **Durable Object alarm** calls the workflow-dispatch API at
  :02 each hour (the alarm re-arms itself; `/status` shows the next ring). The Cloudflare cron (still every 15 minutes)
  only re-arms a dead chain and must never dispatch: when it did, every slot ran twice and the Actions budget went to
  the duplicates. `tick.yml` keeps `schedule:` as a fallback, and `keepalive.yml` pushes an empty commit weekly so
  the fallback is never disabled for inactivity.
- Keep `frontend`'s `three` pinned to the version `globe.gl` requires (`npm ls three` must show one copy), or the
  vendor chunk ships two copies of Three.js and the console warns "Multiple instances".
- `pages.yml` copies `dist/` into the `gh-pages` worktree with `rsync --delete`; `.git` must stay excluded or the
  worktree link file is deleted and `git add` silently stages nothing.
- Natural Earth 110m has `ISO_A2 = -99` for France, Norway, Kosovo; `FIPS_10 = -99` for Norway, Israel, Palestine,
  South Sudan (overrides live in `scripts/gen-codes.ts`). Northern Cyprus and Somaliland have no code and are not drawn.
- Node 22.14 needs `--experimental-strip-types` (the npm scripts pass it); Node 24 does not. Node's `fetch` ignores
  proxy environment variables.
- The lazily loaded globe container measures itself on mount and on window resize because a hidden tab's
  ResizeObserver can report 0×0 and never fire again.

## Keeping things in sync

- Changing `frontend/public/geo/countries.geojson`: run `npm run gen:codes` and commit the output; `pages.yml` fails otherwise.
- Changing the snapshot shape: update `shared/snapshot.ts`, the worker, the panel, and the fixture test together.
- `TASKS.md` is the roadmap; update it at the end of a work session. `LIMITATIONS.md` records what is known to be
  imperfect and why; add to it when an investigation ends without a fix.
