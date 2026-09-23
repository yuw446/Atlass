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

Mid-slug `-review-` was tried on 2026-09-11 with a guard for the verb forms (`to-review-`, `review-of`, `review-plans`,
`review-finds`), fitted to all 54 review slugs in the six batches, where it dropped one film review and no news. On the
live 818-story ring it caught two more film reviews and dropped a New Zealand flood story
(`rates-review-consultation-extended`). Two reviews for one lost flood story is the wrong trade, and a list fitted to
one day's slugs cannot bound that rate, so there is no mid-slug rule. The news shapes are pinned in the tests so a
future rule has to keep them.

## Stored stories after a rule change

The rules run on incoming rows. Stories already in the per-country rings keep their old scores and their old mistakes,
and because the ring sorts by score, inflated pre-change entries outrank correct new ones indefinitely.
`npm run clean:state -- <dir>` applies the shipped predicates (`nonNewsReason`, `dedupeStories`, the same functions the
worker calls) to a copy of the published `state.json` and `latest.json`; no rescoring, themes are not stored. Every drop
prints with its URL and reason. Run once after #16 on 2026-09-09: 34 stories dropped, 30 copies collapsed, published by
force-pushing the two files to `gh-pages` between ticks.

## Result

Six batches: 1,522 lensed → 766 (conflict 994 → 459, disaster 399 → 238, unrest 119 → 61, displacement 10 → 8; the
displacement lens was dropped on 2026-09-11 on that count).
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

## Sweep, 2026-09-23: 1,689 stories, double-labelled, with a holdout

> Re-run: `scripts/lens-audit.ts` now lists what the theme mix crowds out; the corpus builder and scorer below are
> described so the check can be repeated, not committed.

**Why.** The globe still read as off-topic. The 09-09 figure (54%) came from one batch labelled by one reader.

**Method.**
1. Corpus: what the shipped pipeline (`processBatch`: filters, domain cap, syndication merge) put on the globe from
   16 batches on 2026-09-21..23 (train, 1,033 stories) and 14 batches on 2026-09-18..20 (holdout, 656), deduplicated
   across batches, with every V2Themes count kept so rules can be scored offline.
2. Labels: two independent LLM readers per story, headline and URL only, one written rubric per lens ("is the main
   subject a current event of this lens?": on, off, borderline, plus a reason class); a third decides disagreements.
   Agreement: 95.1% on the three-way label, 97.8% on on-versus-not. Both readers are the same model, so this overstates
   how often the labels are right; it does show the question is answerable from the headline.
3. Four rule designers (themes, source/URL, headline wording, structure) worked on the train labels only. Every rule
   was then scored once on the holdout.

**What is on the globe (before this change).** Precision 24.9% (train) and 28.8% (holdout): conflict 21% / 26%,
disaster 33% / 34%, unrest 28% / 36%. By reason, the off-topic stories are politics and rhetoric (357), crime and
courts (154), business and markets (129), routine military (85), entertainment (70), preparedness and funding (64),
anniversaries (44), routine weather (43), commemorations (28). 27% of lensed stories are US, from 789 outlets, 462 of
which contributed one story.

**Holdout results (656 stories, 189 on-topic).**

| Rule | Kept | Precision | Recall |
|------|-----:|----------:|-------:|
| shipped (09-09 rules) | 656 | 28.8% | 100% |
| source/URL sections | 584 | 30.8% | 95.2% |
| structure (score, density, theme shares) | 481 | 34.7% | 88.4% |
| headline wording (seven shape families) | 447 | 37.6% | 88.9% |
| **theme mix: civic + nofight + strike (shipped)** | 430 | **39.8%** | **90.5%** |
| theme mix + election and past headlines | 402 | 42.3% | 89.9% |
| all four designs, as delivered | 248 | 54.0% | 70.9% |
| a small LLM (Haiku) reading headline + URL, eight-line prompt | 225 | **69.3%** | 82.5% |

On-topic stories lost, train (of 257) / holdout (of 189), per component: headline court 0/5, routine 0/6, market
0/6, opinion 3/4, past 0/1, election 0/0, listing 0/0; theme mix civic 10/14, nofight 2/4, strike 1/0, aside 0/3.
Court, routine and market were fitted word lists (the mid-slug review lesson again). Election and past held up, and on
top of the theme mix give 42.3% at 89.9%, but both are word lists that name parties (BJP, AAP, GOP, Labour) and years,
over a three-day holdout: 2.5 points was not worth a list that has to be kept current. The theme mix lost 5.1% of
on-topic stories on train and 9.5% on the holdout, the smallest rise of any family that dropped more than a handful,
so it shipped (`crowdedOut` in `shared/lenses.ts`). The subset was chosen after scoring (`aside` was left out for its
three holdout losses), so 39.8% is slightly optimistic. Two changes after scoring, both neutral on the holdout (430
kept, 39.8%, 90.5% either way): the markets family counts its most-mentioned theme, not the sum, because one
"oil prices" phrase fires five price themes (it keeps the fixture's "US destroys 5 Iranian oil tankers after missile
attack"); and only Hamas and Hezbollah are exempt from politics as armed parties, because GDELT's `TAX_TERROR_GROUP_`
twin also tags the BJP, the BNP and a German communist party.

**Lost by the shipped rule (18 of 189 on the holdout):** mostly war policy (sanctions bills signed, war cost estimates,
an air-defence sale, Red Sea escort calls), three live events ("Houthis did try to attack Riyadh with ballistic
missile", "Iran says it strikes an oil tanker", an Amritsar canal-breach flood) and climate-policy pieces.

**Still wrong, by class:** war diplomacy and UN speeches carry the same themes as war reporting; preparedness,
funding and routine-weather stories carry the same hazard themes as live events; crime reaches Conflict and Unrest
through generic security themes. No theme separates these. A reader of the headline does: the judge above, at matched
recall, is 22 points more precise than the best hand rules. That is the measured case for a headline judge;
record it here when it is built.

**Story age.** The per-country story ring is score-ordered and never expired, so a strong old story outranked new
ones indefinitely, and after the 2026-09-16 outage every panel would have opened on the previous week. Stories now
leave the ring a day after their batch (`STORY_TTL_MS`).
