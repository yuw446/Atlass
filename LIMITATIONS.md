# Atlas — Known Limitations

> Last updated: 2026-09-09

Confirmed limitations, their root causes, and what is in place. `TASKS.md` tracks work; this file records what is
accepted, deferred, or waiting on something external.

## Data

### GDELT tagging is automatic and sometimes wrong
**Symptom:** a story lands on the wrong country (an Arlington Cemetery story on Iraq) or under the wrong lens (a
politics story tagged `NATURAL_DISASTER`).
**Root cause:** GKG themes and locations come from keyword and gazetteer matching over the article text.
**In place (measured 2026-09-09, `docs/precision-check.md`):** primary country is the most-mentioned mapped country,
not the first-mentioned; a lens needs two theme occurrences and one per 200 words of text, so a passing mention in a
long feature does not count; `WB_2433_CONFLICT_AND_VIOLENCE` only confirms a conflict story, `ECON_TRADE_DISPUTE`
vetoes one, and `NATURAL_DISASTER_ICE`/`ICY`/`CHILL` never count (ICE the agency, ice cream); entertainment sections,
review slugs and headline words drop the article; a domain cap stops aggregators dominating. On a labelled batch this
took lens precision from 24% to 54% at 89% recall on that batch. A larger check on 2026-09-23 (1,689 stories over six days,
double-labelled, fitted and held out) measured 25% to 29% on what was actually shipping; the theme-mix rule
(`crowdedOut`: the lens is an aside to politics, courts, economy, markets, rights or society themes; conflict with no
fighting reported; "strike" with no labour theme) raised it to 40% at 90% recall on held-out days.
**Still wrong, by class:** anniversary and history pieces carry the same themes as live conflict; a film about a
historical revolt survives when its outlet has no section in the URL and no review word in the headline, and so does
a review whose slug has "review" in the middle (`the-uprising-review-andrew-garfield`): a mid-slug rule fitted to one
day's slugs dropped a live New Zealand flood story for two film reviews caught, so there is none; crime and
court stories reach Conflict through `TERROR` and `MILITARY`; market stories are lensed by the war they cite; local
weather forecasts reach Disaster; war diplomacy and UN speeches reach Conflict. No GKG field separates these: GCAM's culture dimension scores real war news as high
as reviews. A small LLM reading only the headline and URL scored 69% at 82% recall on the same held-out days.
Country placement has not been checked.

### Syndicated copies are merged by headline, not by event
**Symptom (before 2026-09-09):** a wire story ran nine times in one country's panel under nine radio-station URLs, and
"Hunter River Forum … | Dungog Chronicle" sat next to three sister papers' copies. 86 near-duplicate pairs in 843
panel stories on the live snapshot.
**Root cause:** the worker deduped by URL, and the story ring compared exact lowercased headlines.
**In place:** `shared/title.ts` reduces a headline to content words (site tag off, possessives and plurals folded,
stop words out); two headlines from the same country are one story when 80% of the shorter one's words appear in
the longer one and cover half of it (four words minimum, exact match below that), so a templated wire headline that
differs only by place name stays two stories. Applied after the domain cap, against the last eight batches by
country-keyed normalised headline, and in each country's story ring. Five batches through a fresh state: no pairs left. About 30 to 50
copies are dropped per batch and no longer inflate `n`, the fill, or the sparks.
**Still separate:** three outlets' own headlines for one event ("Massive blast at weapons depot in Syria kills 14"
/ "14 killed in blast at arms depot in northwest Syria") share too few words to merge; a wire copy that arrives two
batches later with an edited headline is caught only in the panel ring, not in the counts.

### Displacement is not a lens
Dropped on 2026-09-11. `REFUGEES`, `DISPLACED`, `EVACUATION` and `SELF_IDENTIFIED_HUMANITARIAN_CRISIS` produced eight
lensed stories across six batches, too few to score reliably, to label, or to learn from. Displacement news still
reaches the globe when it also carries conflict or disaster themes, which is most of it. The worker truncates state
written with the fourth lens on load; the 32 stored stories on it were dropped at the first tick after the change.
Tone and the attention baseline keep those stories' contribution until the two-hour window and the one-week EMA
roll over. `data/hours/` files written before the change have four-wide buckets and no `lenses` field; files written
after carry `lenses` so the order is never ambiguous again. A reader of the history must index `lens[i]` for
`i < LENSES.length`, never sum the whole array, and sort the hour keys, which JSON objects enumerate as `"10"`..`"23"`
before `"00"`..`"09"`.

### English-language sources only
GDELT's main GKG feed is English. A separate translated feed covering 65 languages exists and is a later addition.
The legend says "English-language media".

### Fifteen-minute batches, hourly ticks, two-hour window
The tick runs hourly and applies each of the hour's four batches in turn. Fill colour, lens mix, and the panel's
stories aggregate the last 8 batches; sparks and the header totals are the last hour's batches, kept in
`state.hour`, so a late fallback `schedule` run between two dispatches publishes the same rolling hour. A single
batch holds one or two lensed stories for a typical country, which is why the window exists.

### Publish race, lag, and clock drift in the feed
`lastupdate.txt` is written before the GKG file finishes uploading, so a run minutes after the hour can see a
404 for the latest file; the worker retries four times 30 seconds apart, then leaves it for the next run. Those
retries used to go to the `data.gdeltproject.org` CDN, which caches a 404 for an hour, so they could only repeat the
first miss; the worker now reads the origin bucket, whose 404 is not cached. The GKG
file can also lag the export file by more than half an hour (seen 2026-09-09: 13:30, 13:45 and 14:00 exports
present, GKG files absent, index already at 14:00). Missing non-latest slots therefore go to `state.pending` and are
retried at the start of every run (so twice, hourly) for two hours before being recorded as skipped; a late batch feeds the window and
the hour buckets but never overwrites `latest.json` with an older tick. Batch labels can run up to ten minutes ahead
of wall-clock; the page clamps "last tick" at zero minutes and calls the feed late past 90 minutes.

## Hosting

### Public repository, free Actions (since 2026-09-23)
While the repository was private on GitHub Pro, the tick ran every 15 minutes and used about 2,900 of the 3,000 included
Actions minutes a month. With the double dispatch of 2026-09-10/11 on top, GitHub stopped starting jobs on 2026-09-16
("recent account payments have failed or your spending limit needs to be increased") and the feed froze for a week.
Fewer runs would not have lifted the refusal, and there was no budget to, so the repository was made public on
2026-09-23: Actions minutes on standard runners and Pages are free for public repositories. The tick stayed hourly.
If jobs are ever refused again, the header turns amber ("feed is late"); the runs show no log, and the reason is in the
check-run annotation.

### GitHub's scheduler drops most runs on this repository
**Symptom:** the header says "feed is late" for hours; `state.skipped` holds whole ranges of batches.
**Root cause:** GitHub documents that `schedule` events "can be delayed or dropped during periods of high load."
While this repository was private it ran the tick twice in the first eleven hours instead of 44 times.
**In place:** `infra/tick-dispatch/`, a Cloudflare Worker that calls the workflow-dispatch API hourly at :02
from a Durable Object alarm (punctual to the second; the owner deploys it with a repo-scoped token). Cloudflare's
Cron Trigger (every 15 minutes) slept through its first six hours, then fired; it now only re-arms the alarm if the
chain has died and never dispatches (from 2026-09-09 until the fix was deployed it did, and every slot ran the tick
twice: about 100 extra billed minutes a day). The workflow's own `schedule:` stays as a second fallback. When a run does
happen after a gap it catches up 32 slots (eight hours); older gaps are recorded in `state.skipped` and stay holes in
`hours/`. Expected tick age with the dispatcher is about half an hour at the median; the next run publishes at about 65
minutes, and the Pages cache (below) can hold the page on the old tick until about 75.

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
