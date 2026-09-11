# ATLAS — Tasks & Progress

> Last updated: 2026-09-09
> Stack: Node 24 worker (stdlib) · Vite + React 19 + react-globe.gl + Tailwind v4 · GitHub Actions + Pages
> Design of record: `~/.gstack/projects/yuw446-Atlass/faye-claude-project-revival-core-e38374-design-20260907-115409.md`
> Tests: `npm test` (node --test; 65 tests across shared/, worker/, frontend/src/lib). Render paths are checked by `/qa` on the deployed page.

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete |
| 🔄 | In progress |
| ⬜ | Not started |

## Revival (September 2026)

The March 2026 attempt (a conflict globe with hand-fed data) is superseded. Its notes live in `docs/history/`.

### PR1 — the feed ✅ (merged #4, #5)
- ✅ `shared/`: lens theme sets + scoring, FIPS→ISO generated from the GeoJSON, snapshot type + guard
- ✅ `worker/tick.ts`: slot walk, stdlib zip, publish gate, place vote, lenses, URL validation, dedupe, domain cap, 2 h window, seeded baselines, hours buckets
- ✅ `tick.yml` (*/15, no install, tests gate), `keepalive.yml`; gh-pages single-commit force-push
- ✅ Pages enabled from `gh-pages`; `https://yuw446.github.io/Atlass/data/latest.json` serves
- ✅ Publish-race retry after the first live failure

### PR2 — the globe ✅ (merged #6, #7)
- ✅ `frontend/src/lib`: snapshot state machine, fill colour, tween math, text helpers, densify — all tested
- ✅ `useSnapshot` (poll, localStorage last-good, schema guard, nodata/stale/error), `useTweenedColors`
- ✅ `useGlobeData` shrunk to fetch + densify + one `code`; renderer reads only `code`; sparks with `pointsMerge`
- ✅ `StoryPanel` in the old panel's shell: lens groups, images with fallback, hardened links, per-story times, empty state
- ✅ App shell: feed status header, legend with lens toggles and honesty line, lazy globe chunk, vendor chunk
- ✅ Backend, Perplexity spec, hardcoded data, taxonomy, arcs, markers deleted; `tsc -b` green
- ✅ `pages.yml`; docs rewritten
- ✅ Merged; lockfile regenerated for the Linux bundler binding; Three.js aligned to one copy
- ✅ Site live at https://yuw446.github.io/Atlass/ (GeoJSON moved to `geo/` so the site copy ships it). QA on the live page:
  load, fill by lens, click → panel with images/sources/times, lens toggle, phone layout (clock and hint hidden under 640 px),
  older-than-window stories labelled. Not yet checked on a real phone over 4G.
- ✅ `infra/tick-dispatch/` deployed (token by the owner; Durable Object alarm because Cloudflare cron never fired here)
- ✅ Daylight Earth: NASA Blue Marble (4096×2048, re-encoded to 770 KB, from the three-globe package) replaces the black
  surface and the Three.js ocean sphere; caps are translucent (`fillAlphaFor`: 0.35 unlit, 0.53–0.75 lensed by attention)
  so the imagery reads through. Preloaded from `index.html`. Night texture and a bump map not tried yet.
- ⬜ Send the link to three people and write down what they say first

## Next, in order (after the link is out)
- ✅ **Precision check, lens only** (2026-09-09): 221 lensed stories from one batch labelled by headline; 24% → 54% precision at 89% recall
  after the density rule, support/veto themes and the non-news filter (`docs/precision-check.md`; re-run with `npm run audit -- <batch id>`)
- ✅ **Syndication dedupe** (2026-09-09): headlines reduced to content words in `shared/title.ts`; 80% of the shorter and half of the longer headline's
  words shared, within one country, = one story; applied after the domain cap, in the eight-batch ring and in the story ring. Live snapshot had 86 near-duplicate pairs in 843 panel stories; five batches replayed: none.
- ⬜ **Precision check, country**: 50 placed stories, right country ≥ 40/50, same file
- ⬜ **Week-one measurements**: Actions minutes used, tick-age median and p90, gh-pages size (same file)
- ⬜ **Drift warnings**: `warnings[]` in the snapshot when placement or lens ratios deviate > 50% from the 7-day mean; glyph in the header
- ⬜ **Time scrubber**: replay on `data/hours/` (retained since the first tick); frontend-only. Docs before 2026-09-11 are
  four wide with no `lenses` field; index `lens[i]` for `i < LENSES.length` and sort hour keys (see LIMITATIONS.md)
- ⬜ **Country-pair arcs** from the event export's actor codes (the brief's macro scale)
- ⬜ **Translated feed** (65 languages) as a second worker input
- ✅ **Displacement lens dropped** (2026-09-11): eight lensed stories in six batches; `migrateState()` handles stored state
- ⬜ **Health lens**, only if a week of data shows a narrow enough theme set
- ⬜ **Hex region view** (coordinates are already in the snapshot)
- ⬜ **Correspondent briefing**, grounded only in `top[]` sources, only after the read-only panel proves people click
- ⬜ **Spark cascade** on tick (polish)

## Known Issues / Technical Debt

| Issue | Impact | Plan |
|-------|--------|------|
| GDELT tagging noise: about half of Conflict stories still off-lens (history, crime, markets); place vote unchecked | Wrong-lens or wrong-country story in the panel | Classes in `LIMITATIONS.md`; label 50 stories for country; `npm run audit` again after a week of data |
| GitHub `schedule` drops most runs (2 of 44 on night one) | Feed hours stale without the dispatcher | Deploy `infra/tick-dispatch/`; keepalive keeps the fallback alive |
| Actions budget on Pro is tight (~2,900 of 3,000 min) | Overage or stopped cron at month end | Measure in week one; drop to */20 if needed |
| "Multiple instances of Three.js" console warning | None visible; react-globe.gl bundles its own three | Align versions when upgrading |
| Greenland tessellation artifacts | Cosmetic at some zooms | Higher-resolution GeoJSON or great-circle densification |
