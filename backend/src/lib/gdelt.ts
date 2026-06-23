import AdmZip from 'adm-zip';

export interface GdeltEvent {
  lat: number;
  lon: number;
  timestamp: string;   // YYYYMMDD from GDELT SQLDATE
  eventCode: number;   // GDELT EventRootCode (1–20)
  goldstein: number;   // Goldstein scale (−10 to +10)
}

// GDELT v2 export: tab-separated, 61 columns (0-indexed)
const COL = {
  SQLDATE:       1,
  EventRootCode: 28,
  GoldsteinScale: 30,
  ActionGeo_Lat:  56,
  ActionGeo_Long: 57,
} as const;

const GDELT_LASTUPDATE    = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt';
const FETCH_TIMEOUT_MS    = 12_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MIN_ROW_COUNT       = 50;    // partial download guard

// Event root codes we care about (conflict, force, protest, diplomatic)
const RELEVANT_CODES = new Set([2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Parse a single GDELT v2 export CSV (tab-separated) buffer into events. */
function parseCsv(text: string): GdeltEvent[] {
  const events: GdeltEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 58) continue;

    const eventCode = parseInt(cols[COL.EventRootCode] ?? '', 10);
    if (!RELEVANT_CODES.has(eventCode)) continue;

    const lat       = parseFloat(cols[COL.ActionGeo_Lat]  ?? '');
    const lon       = parseFloat(cols[COL.ActionGeo_Long] ?? '');
    const goldstein = parseFloat(cols[COL.GoldsteinScale] ?? '');
    const sqldate   = (cols[COL.SQLDATE] ?? '').trim();

    // Drop null island (0,0), invalid coords, missing data
    if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) continue;
    if (!isFinite(goldstein) || !sqldate) continue;

    events.push({ lat, lon, timestamp: sqldate, eventCode, goldstein });
  }
  return events;
}

/** Fetch, unzip and parse a single GDELT export ZIP from the given URL. */
async function fetchExport(zipUrl: string): Promise<GdeltEvent[]> {
  const res = await fetchWithTimeout(zipUrl, DOWNLOAD_TIMEOUT_MS);
  if (!res.ok) throw new Error(`GDELT ZIP download failed: ${res.status} ${zipUrl}`);

  const buf  = Buffer.from(await res.arrayBuffer());
  const zip  = new AdmZip(buf);
  const entry = zip.getEntries().find(e => e.entryName.toUpperCase().endsWith('.CSV'));
  if (!entry) throw new Error(`No .CSV in GDELT zip: ${zipUrl}`);

  const text = entry.getData().toString('utf8');
  if (text.split('\n').length < MIN_ROW_COUNT) {
    throw new Error(`GDELT export too short (${text.split('\n').length} rows) — likely partial`);
  }

  return parseCsv(text);
}

/**
 * Build GDELT v2 export URLs for the past `count` 15-minute intervals
 * ending at `endDate` (defaults to now).
 *
 * GDELT snaps timestamps to 15-minute multiples: :00, :15, :30, :45
 */
function buildExportUrls(count: number, endDate: Date = new Date()): string[] {
  const BASE = 'http://data.gdeltproject.org/gdeltv2/';
  const snap = (d: Date) => {
    const m = Math.floor(d.getUTCMinutes() / 15) * 15;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
                             d.getUTCHours(), m, 0, 0));
  };

  const urls: string[] = [];
  let t = snap(endDate);
  for (let i = 0; i < count; i++) {
    const pad = (n: number, w: number) => String(n).padStart(w, '0');
    const ts  = `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1, 2)}${pad(t.getUTCDate(), 2)}`
              + `${pad(t.getUTCHours(), 2)}${pad(t.getUTCMinutes(), 2)}00`;
    urls.push(`${BASE}${ts}.export.CSV.zip`);
    t = new Date(t.getTime() - 15 * 60 * 1000);
  }
  return urls;
}

/**
 * Fetch GDELT events for approximately the past `hours` hours.
 * Returns combined events from multiple 15-minute export files.
 * Falls back to the single latest export if multi-fetch fails.
 */
export async function fetchGdeltEvents(hours = 24): Promise<GdeltEvent[]> {
  // Cap at 8 exports (= 2h) to keep response time reasonable
  const exportCount = Math.min(Math.ceil((hours * 60) / 15), 8);
  const urls = buildExportUrls(exportCount);

  // Fetch all exports in parallel; swallow individual failures
  const results = await Promise.allSettled(urls.map(url => fetchExport(url)));

  const allEvents: GdeltEvent[] = [];
  let successCount = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allEvents.push(...r.value);
      successCount++;
    }
  }

  // If everything failed, try the known-good lastupdate.txt approach as fallback
  if (successCount === 0) {
    console.warn('[GDELT] All direct URL fetches failed — trying lastupdate.txt fallback');
    const listRes = await fetchWithTimeout(GDELT_LASTUPDATE, FETCH_TIMEOUT_MS);
    if (!listRes.ok) throw new Error(`GDELT lastupdate.txt returned ${listRes.status}`);

    const listText = await listRes.text();
    const exportUrl = listText.trim().split('\n')[0]?.split(' ')[2]?.trim();
    if (!exportUrl || !exportUrl.includes('.zip')) {
      throw new Error('Could not parse GDELT export URL from lastupdate.txt');
    }
    return fetchExport(exportUrl);
  }

  console.log(`[GDELT] Fetched ${allEvents.length} events from ${successCount}/${exportCount} exports`);
  return allEvents;
}
