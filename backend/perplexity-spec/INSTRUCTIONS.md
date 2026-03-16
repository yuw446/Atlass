# Atlas — Perplexity Data Package Instructions

This document specifies the exact format for data packages that Perplexity drops into
`backend/data/inbox/`. The Atlas ingestion pipeline reads these files, validates and
normalises them, then writes the data to disk (and Redis when available) for the API to serve.

---

## File Naming Convention

```
perplexity_{YYYYMMDD}_{HHMMSS}_{scope}.json
```

Examples:
- `perplexity_20260315_214600_UA-RU-IL.json`  — specific countries
- `perplexity_20260315_214600_conflict-zones.json`  — thematic scope
- `perplexity_20260315_214600_g20.json`  — named group

The ingestion pipeline accepts any `.json` file in `backend/data/inbox/` regardless of
filename, but named files are easier to audit.

---

## Root Object

```json
{
  "package_id": "perplexity_20260315_214600_UA-RU",
  "generated_at": "2026-03-15T21:46:00Z",
  "query_context": "Brief description of what queries produced this package",
  "countries": [ ...CountryEntry ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `package_id` | string | recommended | Any unique string |
| `generated_at` | ISO 8601 datetime | recommended | UTC preferred |
| `query_context` | string | optional | Describe the search scope |
| `countries` | CountryEntry[] | **required** | 1 to 50 entries |

**Single-country shorthand:** If the package covers exactly one country, you may flatten
the country fields to the root object (omit the `countries` array). The ingestion pipeline
will detect and normalize this automatically.

---

## CountryEntry

```json
{
  "code": "UA",
  "name": "Ukraine",
  "in_conflict": true,
  "events": [ ...EventCard ],
  "relationships": [ ...Relationship ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | ISO 3166-1 alpha-2 | recommended | "UA", "US", "GB" etc. |
| `name` | string | recommended | Used to resolve `code` if missing or wrong |
| `in_conflict` | boolean | **required** | `true` = active armed conflict |
| `events` | EventCard[] | **required** | 2–5 entries per country |
| `relationships` | Relationship[] | optional | 0–10 entries per country |

**Country code resolution:** The ingestion pipeline resolves codes with fuzzy matching.
Providing both `code` and `name` enables the highest confidence resolution. Accepted
formats for `code`: ISO2 (`UA`), ISO3 (`UKR`), or omitted (name-only resolution).

---

## EventCard

Represents one recent, specific development in the country.

```json
{
  "summary": "Russian forces intensified operations near Pokrovsk, with Ukrainian defensive lines holding at significant cost. International donors met in Brussels to discuss accelerated air defense deliveries.",
  "event_type": "military",
  "published_at": "2026-03-14T18:30:00Z",
  "source_url": "https://www.reuters.com/world/europe/ukraine-pokrovsk-defenses-2026-03-14/",
  "image_url": "https://cloudfront.reuters.com/images/ukraine-pokrovsk-2026.jpg"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `summary` | string | **required** | 2–4 sentences. Specific, factual, present-tense events. |
| `event_type` | string | recommended | See valid values below |
| `published_at` | ISO 8601 datetime | optional | UTC preferred; date-only (`2026-03-14`) also accepted |
| `source_url` | URL string | optional | **Must be a real, accessible URL** — see rules below |
| `image_url` | URL string | optional | Direct link to image — see rules below |

---

## ⚠ Source URL Rules — Critical

**Only include `source_url` values that are real, live URLs you have actually retrieved
during your web search.** These URLs must appear in your search results or citations.

**DO NOT:**
- Construct or guess article URLs (e.g. `https://reuters.com/world/invented-path-2026/`)
- Use URL patterns that look plausible but were not returned by a search query
- Include URLs from memory or training data without verifying they are live

**DO:**
- Copy the exact URL from your Perplexity search citation/result for that article
- Use the canonical URL shown in the search result, not a shortened or redirect URL
- If you cannot find a real URL for an event, **omit `source_url` entirely** — an empty
  field is far better than a broken link

**Why this matters:** Atlas displays these links to users. A broken link destroys trust
and provides no value. When in doubt, leave it out.

---

## Image URL Rules

Atlas displays images in event cards. Images must be **direct links to image files**
(`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`) that are publicly accessible without authentication.

**Accepted formats:**
```json
"image_url": "https://cdn.example.com/photo.jpg"
"image_url": "https://images.reuters.com/article/photo-2026.jpg"
"image_url": "https://static.bbc.co.uk/news/image-2026.webp"
```

**Not accepted:**
- HTML page URLs (article pages, not direct image files)
- Authenticated or paywalled image endpoints
- Base64-encoded image data (too large for JSON, not supported)
- Hotlinks from sites that block external image requests (try to use CDN/static URLs)

**How to find image URLs from Perplexity search:**
1. When a search result includes an image, right-click → "Copy image address" in your
   Perplexity session to get the direct CDN URL
2. Prefer images from news wire CDNs (Reuters, AFP, AP, Getty) — they are stable
3. If you cannot find a verified direct image URL, **omit `image_url` entirely**

---

### Valid `event_type` values

| Value | Use for |
|---|---|
| `military` | Combat operations, troop movements, weapons, casualties |
| `diplomatic` | Negotiations, summits, sanctions, treaties, statements |
| `economic` | Trade, sanctions, currency, aid, reconstruction |
| `humanitarian` | Displacement, famine, aid delivery, civilian casualties |
| `political` | Elections, government formation, protests, coups |

The ingestion pipeline will fuzzy-match unrecognized values (e.g. `"armed conflict"` →
`"military"`, `"trade war"` → `"economic"`). If no match, defaults to `"political"`.

---

### EventCard quality guidelines

- **Be specific:** "Negotiations stalled over hostage sequencing" not "Situation tense"
- **Use present-tense framing:** "Forces continue…" not "As of March…"
- **One development per card:** Do not combine unrelated events in one summary
- **2–4 sentences:** Long enough to be informative, short enough to render as a card
- **Avoid value judgements about governments:** Describe events, not verdicts
- **Order by recency:** Put the most recent event first in the `events` array

---

## Relationship

Describes the relationship between the country and a partner country.

```json
{
  "partner_code": "RU",
  "partner_name": "Russia",
  "type": "conflict",
  "intensity": 0.95,
  "summary": "Active armed conflict along the eastern front; ceasefire negotiations ongoing."
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `partner_code` | ISO2 or ISO3 | recommended | Will be fuzzy-resolved |
| `partner_name` | string | optional | Used to resolve `partner_code` if missing |
| `type` | string | **required** | See valid values below |
| `intensity` | float 0–1 | recommended | 0 = minimal, 1 = maximal |
| `summary` | string | optional | 1–2 sentences |

### Valid `type` values

| Value | Use for |
|---|---|
| `conflict` | Active hostilities, proxy war, armed standoff |
| `trade` | Trade agreements, economic partnership, supply chains |
| `diplomacy` | Alliance, formal relations, multilateral cooperation |
| `neutral` | Minimal relationship or no current significant interaction |

### Intensity scale

| Range | Meaning |
|---|---|
| 0.8 – 1.0 | Dominant / defining relationship |
| 0.5 – 0.8 | Significant, frequently referenced |
| 0.2 – 0.5 | Moderate, occasionally relevant |
| 0.0 – 0.2 | Minimal / historical only |

The ingestion pipeline also accepts verbal intensity: `"high"` → 0.8, `"medium"` → 0.5,
`"low"` → 0.2.

---

## Complete Example

See `example-package.json` in this directory for a fully populated two-country package.

---

## What the Ingestion Pipeline Does

1. **Reads** all `.json` files in `backend/data/inbox/`
2. **Parses** JSON — invalid JSON is moved to `backend/data/failed/` with an error file
3. **Normalises** the package with fuzzy matching on country codes, event types, relationship types, and intensity values
4. **Validates** the normalised output against strict Zod schemas
5. **Rescues** partial data where possible (missing optional fields are defaulted; out-of-range numbers are clamped); all rescues are logged as warnings
6. **Writes** to disk: `backend/data/normalized/{ISO2}.json` per country (primary store)
7. **Caches** in Redis: `atlas:perplexity:country:{ISO2}` per country, 24h TTL (when Redis is available)
8. **Archives** successfully processed files to `backend/data/processed/`
9. **Quarantines** files that fail validation to `backend/data/failed/`, alongside a `{filename}.error.json` explaining exactly what failed

---

## Common Mistakes to Avoid

| Mistake | Effect | Instead |
|---|---|---|
| Constructing `source_url` paths | Broken links shown to users | Only use URLs actually returned by search |
| Guessing `image_url` from article page URL | 404 or HTML page loads in image tag | Use direct CDN image URL or omit |
| Using ISO3 codes (`UKR`) without `name` | May fail code resolution | Provide both `code` and `name` |
| `intensity` > 1 (e.g. `1.5`) | Clamped to 1.0, logged as warning | Use 0–1 range |
| Missing `in_conflict` | Defaults to `false` | Always include explicitly |
| `generated_at` in non-ISO format | Accepted but logged as warning | Use `YYYY-MM-DDTHH:MM:SSZ` |
| Putting all events in one summary | Single card with wall of text | One concrete event per card |
| Including the same country twice in `countries` | Second entry overwrites first | One entry per country code |
| No `countries` array and no root `code`/`name` | Ingestion error | Always identify the country |
| Events not ordered by recency | Oldest news shown first | Newest event first in `events` array |

---

## Triggering Ingestion

Drop files into `backend/data/inbox/` then call:

```
POST /api/ingest/run
```

Or check status without processing:

```
GET /api/ingest/status
```
