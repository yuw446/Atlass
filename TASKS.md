# ATLAS — Tasks & Progress

> Last updated: 2026-09-09
> Stack: Node 24 worker (stdlib) · Vite + React 19 + react-globe.gl + Tailwind v4 · GitHub Actions + Pages
> Design of record: `~/.gstack/projects/yuw446-Atlass/faye-claude-project-revival-core-e38374-design-20260907-115409.md`
> Tests: `npm test` (node --test; 50 tests across shared/, worker/, frontend/src/lib). Render paths are checked by `/qa` on the deployed page.

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

### PR2 — the globe 🔄 (this branch)
- ✅ `frontend/src/lib`: snapshot state machine, fill colour, tween math, text helpers, densify — all tested
- ✅ `useSnapshot` (poll, localStorage last-good, schema guard, nodata/stale/error), `useTweenedColors`
- ✅ `useGlobeData` shrunk to fetch + densify + one `code`; renderer reads only `code`; sparks with `pointsMerge`
- ✅ `StoryPanel` in the old panel's shell: lens groups, images with fallback, hardened links, per-story times, empty state
- ✅ App shell: feed status header, legend with lens toggles and honesty line, lazy globe chunk, vendor chunk
- ✅ Backend, Perplexity spec, hardcoded data, taxonomy, arcs, markers deleted; `tsc -b` green
- ✅ `pages.yml`; docs rewritten
- ⬜ Merge, confirm the site publishes, run `/qa` against the saved test plan, send the link to three people

## Next, in order (after the link is out)
- ⬜ **Precision check**: 50 random placed stories from one tick, right country and lens ≥ 40/50, recorded in `docs/precision-check.md`
- ⬜ **Week-one measurements**: Actions minutes used, tick-age median and p90, gh-pages size (same file)
- ⬜ **Drift warnings**: `warnings[]` in the snapshot when placement or lens ratios deviate > 50% from the 7-day mean; glyph in the header
- ⬜ **Time scrubber**: replay on `data/hours/` (retained since the first tick); frontend-only
- ⬜ **Country-pair arcs** from the event export's actor codes (the brief's macro scale)
- ⬜ **Translated feed** (65 languages) as a second worker input
- ⬜ **Health lens**, only if a week of data shows a narrow enough theme set
- ⬜ **Hex region view** (coordinates are already in the snapshot)
- ⬜ **Correspondent briefing**, grounded only in `top[]` sources, only after the read-only panel proves people click
- ⬜ **Spark cascade** on tick (polish)

## Known Issues / Technical Debt

| Issue | Impact | Plan |
|-------|--------|------|
| GDELT tagging noise (place vote, lens false positives) | Occasional wrong-country or wrong-lens story | Precision check, then tune the two-occurrence rule or add a three-occurrence threshold |
| New schedule may not fire until a push to `main` | Feed shows "late" after a fresh deploy | Keepalive commit; verify after each workflow change |
| Actions budget on Pro is tight (~2,900 of 3,000 min) | Overage or stopped cron at month end | Measure in week one; drop to */20 if needed |
| "Multiple instances of Three.js" console warning | None visible; react-globe.gl bundles its own three | Align versions when upgrading |
| Greenland tessellation artifacts | Cosmetic at some zooms | Higher-resolution GeoJSON or great-circle densification |
