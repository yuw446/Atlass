// The contract for docs/labels/*.jsonl: one judged article per line, one file per GDELT batch (docs/labels/README.md).
// One type and one runtime guard, like shared/snapshot.ts; shared/labels.test.ts runs it over every committed file,
// so the tick's test step refuses a malformed label before anything trains or scores on it.

export const LABEL_LENSES = ['conflict', 'disaster', 'unrest', 'none'] as const;   // the topic, not what is shown
export const LABEL_KINDS = ['live', 'commemoration', 'review', 'history', 'other'] as const;
export const JUDGES = ['human', 'deepseek-flash', 'claude'] as const;

export interface Label {
  url: string;          // article URL as the worker keeps it (http(s), ≤ 2 KB); trainers rejoin the batch on it
  title: string;
  source: string;       // GKG SourceCommonName
  batch: string;        // 14-digit GDELT batch id; the file name
  lens: typeof LABEL_LENSES[number];
  kind: typeof LABEL_KINDS[number];
  iso: string | null;   // the judged country, ISO 3166-1 alpha-2; null when the judge did not place it
  judge: typeof JUDGES[number];
  judged_at: string;    // ISO 8601 calendar date, YYYY-MM-DD
  reason?: string;
}

/** "Shown" is derived, never stored: a live event under a lens. */
export const shown = (l: Label) => l.lens !== 'none' && l.kind === 'live';

/** A calendar date, YYYY-MM-DD, that exists: Date.parse alone accepts 2026-02-30 and date-times. */
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const has = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

export function isLabel(x: unknown): x is Label {
  if (!x || typeof x !== 'object') return false;
  const l = x as Record<string, unknown>;
  if (typeof l.url !== 'string' || l.url.length > 2048) return false;
  try { const p = new URL(l.url).protocol; if (p !== 'http:' && p !== 'https:') return false; } catch { return false; }
  if (typeof l.title !== 'string' || !l.title || typeof l.source !== 'string') return false;
  if (typeof l.batch !== 'string' || !/^\d{14}$/.test(l.batch)) return false;
  if (!has(LABEL_LENSES, l.lens) || !has(LABEL_KINDS, l.kind) || !has(JUDGES, l.judge)) return false;
  if (l.iso !== null && (typeof l.iso !== 'string' || !/^[A-Z]{2}$/.test(l.iso))) return false;
  if (!isDate(l.judged_at)) return false;
  return l.reason === undefined || typeof l.reason === 'string';
}

/** Parse one labels file. Errors carry 1-based line numbers; a repeated batch+url+judge is an error, the same URL under
 *  another judge is not (judges are compared, not merged). Blank lines are skipped. */
export function parseLabels(text: string): { rows: Label[]; errors: string[] } {
  const rows: Label[] = [], errors: string[] = [], seen = new Set<string>();
  text.split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    let x: unknown;
    try { x = JSON.parse(raw); } catch { errors.push(`line ${i + 1}: not JSON`); return; }
    if (!isLabel(x)) { errors.push(`line ${i + 1}: not a label`); return; }
    const key = `${x.batch} ${x.url} ${x.judge}`;
    if (seen.has(key)) { errors.push(`line ${i + 1}: repeats batch+url+judge`); return; }
    seen.add(key); rows.push(x);
  });
  return { rows, errors };
}
