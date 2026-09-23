# Labels

Judged GDELT articles: the ground truth every precision check, judge comparison and trained model is scored against.
The contract is `shared/labels.ts` (`Label`, `isLabel`, `parseLabels`); `shared/labels.test.ts` parses every file here,
and the tick's test step runs it, so a malformed label fails the tests before anything scores on it.

## Format

One file per GDELT batch, `<batch id>.jsonl`, one JSON object per line:

| Field | Type | Meaning |
|-------|------|---------|
| `url` | string | Article URL as the worker keeps it (http or https, at most 2 KB). Trainers rejoin the batch on it. |
| `title` | string | Headline as `pageTitle()` reads it. |
| `source` | string | GKG SourceCommonName. |
| `batch` | string | 14-digit batch id; always equals the file name. |
| `lens` | `conflict` \| `disaster` \| `unrest` \| `none` | The topic. A 9/11 anniversary is `conflict`. |
| `kind` | `live` \| `commemoration` \| `review` \| `history` \| `other` | Whether it reports a current event. |
| `iso` | ISO 3166-1 alpha-2 \| `null` | The judged country; `null` when the judge did not place it. |
| `judge` | `human` \| `deepseek-flash` \| `claude` | Who judged it. |
| `judged_at` | `YYYY-MM-DD` | When (a calendar date that exists). |
| `reason` | string, optional | The judge's own note. |

**Shown is derived, never stored:** `lens != none && kind == live` (`shown()`), which is what the globe should carry.

## Conventions

- **Key:** `batch + url + judge`, unique in a file. The same URL under two judges is two rows. Judges are compared, not merged.
- **Truth order:** `human`, then the newest `judged_at`.
- **Nothing derived is stored.** Theme counts, the worker's lens, the placement and scores all come from rejoining the
  raw batch by id and URL. The batch zips are served permanently at
  `https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/<batch id>.gkg.csv.zip` and are never committed.

## What is here

### `20260909163000.jsonl`: the 09-09 precision check (221 rows, `human`)
All placed and titled articles in one batch, labelled by headline. 54 are live on a lens. The 9/11 anniversaries are
`conflict` + `commemoration`, one history piece is `conflict` + `history`, two reviews are `none` + `review`, and the
rest are `none` + `other`. Rows with no V2Locations are kept. The other five batches of that check (20260909104500,
130000, 140000, 141500, 150000) were counted, not labelled; they are still served, so fetch by id. `docs/precision-check.md`
has the method and numbers. That check's rubric counted military stories as on-topic (for example "Greece signs deal
with Italy for two frigates"). The 09-23 sweep's rubric does not: it counts procurement and routine military news as
off. Compare the two files with that difference in mind.

### 30 files from 2026-09-18 to 09-23: the 09-23 sweep (1,689 rows, `claude`)
These are what the pre-2026-09-23 rules (commit `e346ca0`) put on the globe, deduplicated by URL and headline across
batches. Train is 16 batches from 09-21 to 09-23 (1,033 rows). Holdout is 14 batches from 09-18 to 09-20 (656 rows).

- **How they were judged:** two independent Claude readers per article, from headline and URL only, against one written
  rubric per lens. A third reader decided where they disagreed. Agreement was 95.1% on the three-way verdict and 97.8%
  on on-versus-not. Both readers were the same model, so the labels share its blind spots. No human spot check has
  been done.
- **`reason`:** keeps the reader's raw verdict against the lens the rules had assigned:
  `on|off|borderline under <assigned lens>, <class>: <note>`, with `[adjudicated]` when the third reader decided.
  When the reader judged the story squarely on-topic for another lens, `lens` is that lens and `kind` is `live`,
  while the reason still reads `off under conflict`. Example: "NCRI supporters mobilize global protests" is
  `unrest` + `live`, reason `off under conflict, other: …`. The classes are on_topic,
  politics_rhetoric, crime_courts_policing, business_markets, military_routine, entertainment_culture,
  preparedness_funding, weather_routine, history_anniversary, commemoration_veterans, environment_not_climate,
  figurative_keyword, ambiguous, sports and other.
- **Mapping into `lens` and `kind`:**

  | Verdict | `lens` | `kind` |
  |---|---|---|
  | on | the assigned lens | live |
  | squarely another lens | that lens | live |
  | anniversary / history | the assigned lens | history |
  | commemoration / veterans | the assigned lens | commemoration |
  | borderline | the assigned lens | other |
  | anything else | none | other |

- **Known disputes, left as judged.** These are the starting set for a human spot check. A `human` row for the same
  URL overrides them.
  - **The same event judged two ways:** Governor Newsom's El Niño state of emergency appears under seven headlines
    across batches. Two are `live` (20260921213000) and five are `other` as borderline preparedness (20260921181500,
    20260922030000, 20260922061500, 20260922213000).
  - **Rubric edge cases a review questioned:**
    - South Korea declining to send troops to the Iran war (20260918154500, live).
    - Taiwan's live-fire drills (20260918113000, live: the rubric counts "exercises signalling tension").
    - A war-crimes complaint filed in France over Lebanon (20260922181500, live: the rubric counts war crimes but not
      courts).
- **Reproducing the sweep's precision:** rejoin each batch, run `processBatch` at `e346ca0`, and count shown rows whose
  `lens` equals the worker's lens. This gives 257 / 1,033 = 24.9% on train and 189 / 656 = 28.8% on holdout, as in
  `docs/precision-check.md`.
