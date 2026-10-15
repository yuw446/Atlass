// scripts/audit-snapshot.ts — audit what the globe serves against judged labels (#24).
//
//   npm run audit:served -- <latest.json> --todo   # the served stories nobody has judged yet, one JSON object per line
//   npm run audit:served -- <latest.json> --append <verdicts.jsonl>   # file one verdict per todo story as label rows
//   npm run audit:served -- <latest.json>          # write docs/audits/<tick date>.md; exit 1 if any story is unjudged
//
// Stories join docs/labels/*.jsonl on batch + URL, batch being isoToBatch(story.at). A judged story keeps its label for
// as long as it stays in the ring, so each day only the new stories need judging. The daily routine
// (docs/routines/audit.md) judges the --todo list, appends the rows to docs/labels/<batch>.jsonl and writes the report.
// On-lens = the label's lens is the served lens and its kind is live. Right country = the label's iso is the served
// country, over the stories the judge placed.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { isoToBatch } from '../worker/tick.ts';
import { isSnapshot, type Snapshot } from '../shared/snapshot.ts';
import { isLabel, parseLabels, type Label } from '../shared/labels.ts';

export interface Served { iso: string; lens: string; title: string; url: string; source: string; batch: string }

export interface Stats {
  date: string; tick: string; stories: number; onLens: number; placed: number; rightCountry: number;
  byLens: Record<string, { n: number; on: number }>;
}

export function servedRows(snap: Snapshot): Served[] {
  return Object.entries(snap.countries).flatMap(([iso, c]) => c.top.map(s => ({
    iso, lens: snap.lenses[s.l] ?? String(s.l), title: s.t, url: s.u, source: s.d, batch: isoToBatch(s.at),
  })));
}

/** One label per batch + URL: a human label wins, then the newest judgement. */
export function labelIndex(labels: Label[]): Map<string, Label> {
  const rank = (l: Label) => `${l.judge === 'human' ? 1 : 0}${l.judged_at}`;
  const idx = new Map<string, Label>();
  for (const l of labels) {
    const k = `${l.batch} ${l.url}`, cur = idx.get(k);
    if (!cur || rank(l) > rank(cur)) idx.set(k, l);
  }
  return idx;
}

export const todo = (rows: Served[], idx: Map<string, Label>) => rows.filter(r => !idx.has(`${r.batch} ${r.url}`));

const pct = (a: number, b: number) => (b ? `${(100 * a / b).toFixed(1)}%` : 'n/a');
const onLens = (r: Served, l: Label) => l.lens === r.lens && l.kind === 'live';
/** Why an off-lens story is off: another lens when the judge saw a live event there, else the reason's class word. */
const offClass = (l: Label) => (l.lens !== 'none' && l.kind === 'live' ? `live ${l.lens}` : l.reason?.split(':')[0].trim() || l.kind);

/** The report for a fully judged snapshot; `prev` is the previous report's count line, for the delta. */
export function report(rows: Served[], idx: Map<string, Label>, tick: string, prev?: Stats): { md: string; stats: Stats } {
  const date = tick.slice(0, 10);
  const stats: Stats = { date, tick, stories: rows.length, onLens: 0, placed: 0, rightCountry: 0, byLens: {} };
  const byCountry = new Map<string, { n: number; on: number; placed: number; right: number }>();
  const off = new Map<string, string[]>();
  for (const r of rows) {
    const l = idx.get(`${r.batch} ${r.url}`);
    if (!l) throw new Error(`unjudged: ${r.url}`);
    const on = onLens(r, l);
    const bl = stats.byLens[r.lens] ??= { n: 0, on: 0 };
    const bc = byCountry.get(r.iso) ?? { n: 0, on: 0, placed: 0, right: 0 };
    bl.n++; bc.n++;
    if (on) { stats.onLens++; bl.on++; bc.on++; } else off.set(offClass(l), [...(off.get(offClass(l)) ?? []), r.title]);
    if (l.iso) { stats.placed++; bc.placed++; if (l.iso === r.iso) { stats.rightCountry++; bc.right++; } }
    byCountry.set(r.iso, bc);
  }
  const prec = (s: Stats) => s.onLens / s.stories, ctry = (s: Stats) => s.rightCountry / Math.max(1, s.placed);
  const pts = (a: number, b: number) => `${a >= b ? '+' : '−'}${Math.abs(100 * (a - b)).toFixed(1)} pts`;
  const md = [
    `<!-- audit ${JSON.stringify(stats)} -->`,
    `# Served-story audit, ${date}`, '',
    `Snapshot tick ${tick}: ${rows.length} stories in ${byCountry.size} countries.`, '',
    `**On-lens precision ${pct(stats.onLens, stats.stories)}** (${stats.onLens} of ${stats.stories}). ` +
      `**Right country ${pct(stats.rightCountry, stats.placed)}** (${stats.rightCountry} of ${stats.placed} the judge placed).`, '',
    prev ? `Since ${prev.date}: precision ${pts(prec(stats), prec(prev))}, right country ${pts(ctry(stats), ctry(prev))}.`
      : 'No previous report.', '',
    '| Lens | Served | On-lens | Precision |', '|---|---:|---:|---:|',
    ...Object.entries(stats.byLens).map(([k, v]) => `| ${k} | ${v.n} | ${v.on} | ${pct(v.on, v.n)} |`), '',
    '## Largest off-lens classes', '',
    ...[...off].sort((a, b) => b[1].length - a[1].length).slice(0, 5)
      .map(([k, ts]) => `- **${k}** (${ts.length}): ${ts.slice(0, 2).map(t => `“${t}”`).join('; ')}`), '',
    '## By country', '', '| Country | Served | On-lens | Right country |', '|---|---:|---:|---:|',
    ...[...byCountry].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
      .map(([iso, c]) => `| ${iso} | ${c.n} | ${c.on} | ${c.placed ? `${c.right}/${c.placed}` : '–'} |`), '',
  ].join('\n');
  return { md, stats };
}

export interface Verdict { url: string; lens: Label['lens']; kind: Label['kind']; iso: string | null; reason: string }

/** Label rows for the unjudged stories, one verdict each; the served row supplies title, source and batch. */
export function toLabels(open: Served[], verdicts: Verdict[], today: string): { rows: Label[]; errors: string[] } {
  const byUrl = new Map(verdicts.map(v => [v.url, v]));
  const errors = verdicts.length === byUrl.size ? [] : ['a URL has two verdicts'];
  const known = new Set(open.map(r => r.url));
  for (const v of verdicts) if (!known.has(v.url)) errors.push(`verdict for a story not on the todo list: ${v.url}`);
  const rows: Label[] = [];
  for (const r of open) {
    const v = byUrl.get(r.url);
    if (!v) { errors.push(`no verdict: ${r.url}`); continue; }
    const l: Label = { url: r.url, title: r.title, source: r.source, batch: r.batch, lens: v.lens, kind: v.kind, iso: v.iso,
      judge: 'claude', judged_at: today, reason: v.reason };
    if (isLabel(l)) rows.push(l); else errors.push(`not a label: ${JSON.stringify(v)}`);
  }
  return { rows, errors };
}

/** The count line of the newest report dated before `date`, if any. */
export function previousStats(files: { name: string; text: string }[], date: string): Stats | undefined {
  const f = files.filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f.name) && f.name.slice(0, 10) < date).sort((a, b) => a.name.localeCompare(b.name)).pop();
  const m = f?.text.match(/^<!-- audit (.*) -->/);
  return m ? JSON.parse(m[1]) as Stats : undefined;
}

if (process.argv[1]?.endsWith('audit-snapshot.ts')) {
  const args = process.argv.slice(2), appendAt = args.indexOf('--append');
  const path = args.find((a, i) => !a.startsWith('--') && (appendAt < 0 || i !== appendAt + 1));
  if (!path) { console.error('usage: audit-snapshot.ts <latest.json> [--todo]'); process.exit(2); }
  const snap: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isSnapshot(snap)) { console.error(`${path}: not a snapshot (shared/snapshot.ts)`); process.exit(2); }
  const labelsDir = new URL('../docs/labels/', import.meta.url), auditsDir = new URL('../docs/audits/', import.meta.url);
  const labels = readdirSync(labelsDir).filter(f => f.endsWith('.jsonl')).flatMap(f => {
    const { rows, errors } = parseLabels(readFileSync(new URL(f, labelsDir), 'utf8'));
    if (errors.length) { console.error(`docs/labels/${f}: ${errors[0]}`); process.exit(2); }
    return rows;
  });
  const rows = servedRows(snap), idx = labelIndex(labels), open = todo(rows, idx);
  if (appendAt >= 0) {
    // All or nothing: one bad verdict files no rows, so a rerun starts from the same todo list.
    const verdicts = readFileSync(args[appendAt + 1], 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as Verdict);
    const { rows: out, errors } = toLabels(open, verdicts, new Date().toISOString().slice(0, 10));
    if (errors.length) { console.error(`${errors.length} problems, nothing filed:\n${errors.slice(0, 10).join('\n')}`); process.exit(1); }
    for (const l of out) appendFileSync(new URL(`${l.batch}.jsonl`, labelsDir), JSON.stringify(l) + '\n');
    console.log(`filed ${out.length} labels in ${new Set(out.map(l => l.batch)).size} batch files`);
  } else if (process.argv.includes('--todo')) {
    for (const r of open) console.log(JSON.stringify(r));
    console.error(`${open.length} of ${rows.length} served stories unjudged`);
  } else if (open.length) {
    console.error(`${open.length} of ${rows.length} served stories unjudged; nothing written. First: ${open.slice(0, 3).map(r => r.url).join(' ')}`);
    process.exit(1);
  } else {
    mkdirSync(auditsDir, { recursive: true });
    const prior = readdirSync(auditsDir).map(name => ({ name, text: readFileSync(new URL(name, auditsDir), 'utf8') }));
    const { md, stats } = report(rows, idx, snap.tick, previousStats(prior, snap.tick.slice(0, 10)));
    writeFileSync(new URL(`${stats.date}.md`, auditsDir), md);
    console.log(`docs/audits/${stats.date}.md: precision ${pct(stats.onLens, stats.stories)}, right country ${pct(stats.rightCountry, stats.placed)}`);
  }
}
