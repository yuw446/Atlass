# Daily audit routine

The prompt the `atlas-audit` cloud routine runs every day at 06:00 UTC ("Follow docs/routines/audit.md in this
repository exactly"). It judges the stories the globe serves that nobody has judged yet, files the verdicts as label
rows, and writes the day's report. Any failure stops the run with nothing committed.

## Steps

1. `node --version` must be 22.6 or later (the npm scripts pass `--experimental-strip-types`). Nothing needs installing.
2. Fetch the served snapshot:
   `git fetch --depth 1 origin gh-pages && git show FETCH_HEAD:data/latest.json > /tmp/latest.json`.
   If that fails, `curl -sf https://yuw446.github.io/Atlass/data/latest.json -o /tmp/latest.json`.
3. `npm run -s audit:served -- /tmp/latest.json --todo > /tmp/todo.jsonl`. Each line is one unjudged served story:
   `{iso, lens, title, url, source, batch}`, where `lens` and `iso` are what the globe shows. Stories judged on earlier
   days keep their labels, so usually only the last day's are listed. If the list is empty, go to step 5.
4. Judge every line against the rubric below, in chunks of about 50, and write `/tmp/verdicts.jsonl` with exactly one
   line per todo line: `{"url": …, "lens": …, "kind": …, "iso": …, "reason": …}`. Then
   `npm run -s audit:served -- /tmp/latest.json --append /tmp/verdicts.jsonl`. It files all rows or none; if it lists
   problems, fix those verdicts and run it again.
5. `npm run -s audit:served -- /tmp/latest.json` writes `docs/audits/<date>.md`. It exits 1 if any story is unjudged:
   go back to step 3.
6. `npm test` must pass (it validates every label file).
7. `git add docs/labels docs/audits`, check `git status` shows nothing else changed, commit as
   `docs(audits): <date>` and `git push origin HEAD:main`. If the push is refused, push the same commit to a branch
   `claude/audit-<date>` and open a pull request against main; if that is not possible either, stop and say so.
8. End with one line: stories judged today, and the report's precision and right-country figures.

Do not edit any other file, and never change or delete an existing label row. Judge from the headline, the domain and
the URL slug only; do not open the URLs.

## Rubric

A story belongs on a lens only if its MAIN SUBJECT is a current event of that kind. Headlines may carry a site-name
suffix; ignore it.

**conflict**
- ON: war and armed conflict; military strikes, operations, clashes, casualties, hostages; military threats,
  mobilisation or exercises signalling tension between states or armed groups; military aid to a warring party;
  terrorist attacks, plots and their immediate aftermath; insurgency, rebellion, militia or armed political violence,
  assassinations; war crimes; ceasefires, peace talks and sanctions directly about an active armed conflict.
- OFF: anniversaries, memorials, commemorations and history; veterans' events, benefits, reunions; routine military
  life (recruiting, base events, air shows, personnel profiles, celebrity visits); defence business and budgets not tied
  to an active conflict; ordinary crime, policing, courts, lawsuits; politics, elections, rhetoric, culture-war
  "fights"; markets, oil prices, stocks, business even when they cite a war; entertainment, culture, sports, books.

**disaster**
- ON: natural hazards happening, imminent, or in recent aftermath with real impact or risk: earthquakes, floods,
  hurricanes, typhoons, tornadoes, wildfires, drought, heatwaves, landslides, eruptions, tsunamis, severe-weather
  warnings; man-made disasters: industrial accidents, explosions, spills, building collapses, major transport disasters;
  climate change as the main subject (science, impacts, policy, summits, emissions).
- OFF: routine weather forecasts; preparedness programmes, grants, insurance and calendars with no current hazard;
  anniversaries of old disasters; environment stories not about climate or a disaster (pollution, wildlife, parks);
  entertainment, sports, business.

**unrest**
- ON: protests, demonstrations, marches, rallies against something, riots, labour strikes and walkouts, mass boycotts,
  civil unrest, crackdowns on protesters.
- OFF: military strikes (that is conflict), sports, products, lawsuits, figurative "protest", politics without mass
  action.

## Verdict fields

| Field | Value |
|---|---|
| `lens` | The lens whose ON list the main subject fits, even if the globe shows it under another lens; `none` if it fits none. An anniversary, memorial or history piece takes the lens of its topic. A borderline story keeps the served lens. |
| `kind` | `live` for a current event on-topic for `lens`; `history` for anniversaries and history; `commemoration` for memorials and veterans; `review` for reviews of films, books, games or shows; `other` for everything else, borderline stories included. |
| `iso` | The country where the story's event happens, as an uppercase ISO 3166-1 alpha-2 code (Gaza and the West Bank `PS`, Taiwan `TW`, Kosovo `XK`); `null` when it is global, spans several countries equally, or the headline does not say. |
| `reason` | `<class>: <note of at most 12 words>`. Class is `on_topic` for live on-topic stories, otherwise one of politics_rhetoric, crime_courts_policing, business_markets, military_routine, entertainment_culture, preparedness_funding, weather_routine, history_anniversary, commemoration_veterans, environment_not_climate, figurative_keyword, ambiguous, sports, other. Start the note with "borderline" when it is. |

When unsure, do not guess on-topic: a borderline story is `kind: other`.
