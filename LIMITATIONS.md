# Atlas — Known Limitations

> Last updated: 2026-09-09

Confirmed limitations, their root causes, and what is in place. `TASKS.md` tracks work; this file records what is
accepted, deferred, or waiting on something external.

## Data

### GDELT tagging is automatic and sometimes wrong
**Symptom:** a story lands on the wrong country (an Arlington Cemetery story on Iraq) or under the wrong lens (a
politics story tagged `NATURAL_DISASTER`).
**Root cause:** GKG themes and locations come from keyword and gazetteer matching over the article text.
**In place:** primary country is the most-mentioned mapped country, not the first-mentioned; a lens needs at least
two theme occurrences; `MANMADE_DISASTER_IMPLIED`, `KILL`, `GENERAL_HEALTH`, `MEDICAL` are excluded; a domain cap
stops aggregators dominating. A manual precision check over 50 stories is the first follow-up task.

### English-language sources only
GDELT's main GKG feed is English. A separate translated feed covering 65 languages exists and is a later addition.
The legend says "English-language media".

### Fifteen-minute batches, two-hour window
Fill colour, lens mix, and the panel's stories aggregate the last 8 batches; sparks are the current batch. A single
batch holds one or two lensed stories for a typical country, which is why the window exists.

### Publish race, lag, and clock drift in the feed
`lastupdate.txt` is written before the GKG file finishes uploading, so a run minutes after the quarter hour can see a
404 for the latest file; the worker retries four times 30 seconds apart, then leaves it for the next run. The GKG
file can also lag the export file by more than half an hour (seen 2026-09-09: 13:30, 13:45 and 14:00 exports
present, GKG files absent, index already at 14:00). Missing non-latest slots therefore go to `state.pending` and are
retried at the start of every run for two hours before being recorded as skipped; a late batch feeds the window and
the hour buckets but never overwrites `latest.json` with an older tick. Batch labels can run up to ten minutes ahead
of wall-clock; the page clamps "last tick" at zero minutes.

## Hosting

### Private repository on GitHub Pro
Pages and the Actions budget depend on the paid plan. The cron uses about 2,900 of 3,000 minutes a month. A
month-end overage stops the cron until the budget resets; the header turns amber ("feed is late").

### GitHub's scheduler drops most runs on this repository
**Symptom:** the header says "feed is late" for hours; `state.skipped` holds whole ranges of batches.
**Root cause:** GitHub documents that `schedule` events "can be delayed or dropped during periods of high load."
On this private repository it ran the tick twice in the first eleven hours instead of 44 times.
**In place:** `infra/tick-dispatch/`, a Cloudflare Worker that calls the workflow-dispatch API every 15 minutes
from a Durable Object alarm (punctual to the second; the owner deploys it with a repo-scoped token). Cloudflare's
own Cron Triggers were tried first and never fired on this account, a documented Cloudflare fault in 2026; the cron
stays configured only as a re-arm path. The workflow's own `schedule:` stays as a second fallback. When a run does
happen after a gap it catches up 32 slots (eight hours); older gaps are recorded in `state.skipped` and stay holes in
`hours/`. Expected tick age with the dispatcher is under ten minutes at the median.

### Pages cache
Pages serves `data/latest.json` with `cache-control: max-age=600`. The page polls every minute with `cache: 'no-cache'`,
so a fresh tick shows within roughly ten minutes of publishing.

## Rendering

### Large polygon tessellation artifacts (Greenland, Russia, Canada, Antarctica)
Globe.gl draws polygon edges as chords through the sphere. `densifyRing` (`frontend/src/lib/densify.ts`) inserts
points on edges longer than 3°. Greenland still shows minor artifacts at some zoom levels. A winding-order fix was
tried in the first attempt and reverted: the shoelace formula is unreliable for polar and antimeridian polygons.

### Polygon border width is 1 px
Globe.gl's `polygonStrokeColor` has no width; WebGL ignores `linewidth > 1`. Bright stroke colours compensate.

### Sparks are not interactive
`pointsMerge: true` draws all sparks in one geometry for phone performance; there is no per-spark hover or click.
Stories are read through the country panel.

### Colour changes are tweened by the app, not the library
three-globe's `polygonsTransitionDuration` animates altitude only. `useTweenedColors` interpolates in LAB at 30 fps
for 1.5 s and snaps under `prefers-reduced-motion`.

### Territories without a code are not drawn
Northern Cyprus and Somaliland have no ISO code in Natural Earth 110m and receive no fill. Feed countries with no
polygon (Singapore, Hong Kong, Bahrain, Malta, the Maldives, about 30 more) appear as sparks only.

### Hidden-tab layout
In embedded or background tabs the globe container can measure 0×0 at mount; the container re-measures on mount and
on window resize. Real browsers lay out immediately.

## Resolved from the first attempt
The Perplexity inbox pipeline, the Claude fallback that invented events, the fabricated source URLs, the hardcoded
country data, the `/api/globe-data` route, Redis, and the BullMQ queue are gone. The Taiwan `CN-TW` alias and the
France/Norway `-99` codes are handled by `geoCode()`.
