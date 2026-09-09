# Lens precision check

> First run: 2026-09-09, six GKG batches (9,263 rows, 7,294 placed), one batch hand-labelled.
> Re-run: `npm run audit -- <batch id>` prints what a batch would put on the globe; label the headlines, count.

## Why

The panel showed "20 of the best afternoon teas in Dubai" under Unrest and five reviews of *The Uprising*, a film about
the 1381 Peasants' Revolt, under Conflict. GKG themes are keyword matches, and the rule was "two occurrences of any
lens theme".

## Method

1. Fetch six batches (10:45, 13:00, 14:00, 14:15, 15:00, 16:30 UTC on 2026-09-09) and the fixture batch.
2. For every lensed article record score, distinct themes, first offset, word count (V1.5Tone field 7), URL, headline.
3. Label the 16:30 batch by headline: 221 distinct lensed stories, 54 on-topic. Anniversaries, history, trade,
   markets, crime and policy were labelled off-topic; military and political-violence stories on-topic.
4. Score candidate rules on the labelled set (precision, recall) and count sole-theme lensing across all six batches.

## What was wrong

| Theme | Sole conflict/disaster theme on | Examples |
|-------|-------------------------------|----------|
| `WB_2433_CONFLICT_AND_VIOLENCE` | 158 of 725 articles | penis-enlargement death, a comic about arguing, drug charges |
| `ARMEDCONFLICT` | 94 of 730 | "trade war", "war on drugs", *Band of Brothers* |
| `PROTEST` | 77 of 131 | Arsenal transfer, a Series A round |
| `MILITARY` | 33 of 266 | reality-show winner, BTS Jungkook, an earnings call |
| `NATURAL_DISASTER_ICE` | 27 of 64 | ICE the agency, ice cream, the ICE exchange, *ICE* magazine |
| `PROTEST`+`STRIKE` once each | | Fat Bear Week, pumpkin beer, Navier-Stokes |

Baseline on the labelled batch: **24% precision** (54 of 221).

## Rules tested (labelled batch, 54 on-topic)

| Rule | Kept | On-topic | Precision | Recall |
|------|-----:|---------:|----------:|-------:|
| two occurrences (before) | 221 | 54 | 24% | 100% |
| three occurrences | 134 | 45 | 34% | 83% |
| first mention within 500 chars | 96 | 37 | 39% | 69% |
| two distinct themes or three occurrences | 176 | 49 | 28% | 91% |
| **density ≥ 1 per 200 words** | 120 | 50 | 42% | 93% |
| density, drop `WB_2433` | 93 | 44 | 47% | 81% |
| density, `WB_2433` support-only, trade veto, non-news filter (**shipped**) | 89 | 48 | **54%** | **89%** |

Density (theme occurrences per word) beat every position or count rule: a real story repeats its subject; an aside
does not. Dropping `WB_2433` outright lost short breaking news ("Blast rocks ammunition depot in Idlib" carries it
plus one `ARMEDCONFLICT`), so it counts only alongside a core theme. `ECON_TRADE_DISPUTE` was on 83 conflict-lensed
articles and none was about armed conflict. GCAM's culture and drama dimensions scored real war reports as high as
film reviews and were not used. Counting distinct offsets instead of occurrences lost recall (`PROTEST` and `STRIKE`
fire on the same word) and was not used. Support themes count at most one for one with a core theme, so one `MILITARY`
and eight `WB_2433` score 2, not 9.

The non-news filter (`NON_NEWS_PATH`, `NON_NEWS_TITLE` in `worker/tick.ts`) matched 354 placed articles across the six
batches; the only news among them was a trailer thief. Review then pinned the false negatives the first version had with
tests: `hurricane-season-2026` slugs, trailer parks, "film shows" and mid-slug "review" are left alone. A brand name such
as Netflix still drops a headline, a known ceiling.

## Result

Six batches: 1,522 lensed → 766 (conflict 994 → 459, disaster 399 → 238, unrest 119 → 61, displacement 10 → 8).
Labelled batch: 24% → 54% precision at 89% recall; conflict 47%, disaster 67%, unrest 67%.
Lost on-topic stories (six): Kiev's Patriot request, the NDC/Sowore piece on the Peter Obi convoy attack, Sokoto's
election-violence warning (each names its subject once or twice in 500 to 800 words), a Netanyahu Oct. 7 piece, a
sea-lion El Niño feature, a North Carolina peatland feature.

## Still wrong, by class

- Anniversaries and history: "25 years ago, Canada headed for war in Afghanistan", the Rwandan genocide explained.
- Entertainment with no section in the URL and no review word in the headline (Collider-style slugs).
- Crime and courts reaching Conflict through `TERROR` and `MILITARY`.
- Markets lensed by the war they cite: "oil tops $100 as Iran war escalates".
- Local weather forecasts under Disaster.

Country placement was not checked in this run.
