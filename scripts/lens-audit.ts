// scripts/lens-audit.ts — print what one GKG batch would contribute to the globe, for a manual precision check.
//   npm run audit -- 20260909163000            (downloads the batch)
//   npm run audit -- path/to/batch.gkg.csv.zip
// One line per lensed article (lens, score, mentions per 1,000 words, country, matched themes, headline), then the
// section-rejected and theme-mix-rejected (crowded) headlines, then which themes carried an article on their own. Method and past results:
// docs/precision-check.md.

import { readFileSync } from 'node:fs';
import { GDELT, COL, unzipSingle, parseRows, articleFrom, pageTitle, zeroTotals } from '../worker/tick.ts';
import { LENSES, parseThemes, lensOf, scoreLenses, dominantLens, crowdedOut } from '../shared/lenses.ts';

const arg = process.argv[2];
if (!arg) { console.error('usage: npm run audit -- <batch id | path to .gkg.csv.zip>'); process.exit(2); }
const fetchBatch = async (id: string) => { const r = await fetch(`${GDELT}${id}.gkg.csv.zip`); if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
const buf = /^\d{14}$/.test(arg) ? await fetchBatch(arg) : readFileSync(arg);
const { rows } = parseRows(unzipSingle(buf).toString('utf8'));
const totals = zeroTotals();
const lensed: string[] = [], sectioned: string[] = [], crowded: string[] = [];
const sole = new Map<string, number>();
for (const cols of rows) {
  const r = articleFrom(cols, '', totals);
  if (r.reject === 'section') { sectioned.push(`${pageTitle(cols).slice(0, 70).padEnd(70)} | ${new URL(cols[COL.URL]).hostname}`); continue; }
  if (r.reject === 'crowded') {
    const th = parseThemes(cols[COL.THEMES]), sc = scoreLenses(th), l = dominantLens(sc, Number(cols[COL.TONE].split(',')[6]) || 0);
    crowded.push(`${LENSES[l].id.padEnd(9)} ${crowdedOut(l, th, sc[l])!.padEnd(8)} ${pageTitle(cols).slice(0, 80)}`); continue;
  }
  if (!r.article) continue;
  const a = r.article;
  const mine = parseThemes(cols[COL.THEMES]).filter(t => lensOf(t) === a.lens);
  const counts = new Map<string, number>(); for (const t of mine) counts.set(t, (counts.get(t) ?? 0) + 1);
  if (counts.size === 1) { const t = [...counts.keys()][0]; sole.set(t, (sole.get(t) ?? 0) + 1); }
  const words = Number(cols[COL.TONE].split(',')[6]) || 0;
  const themes = [...counts].sort((p, q) => q[1] - p[1]).map(([t, n]) => `${t.replace('NATURAL_DISASTER_', 'ND_')}×${n}`).join(' ');
  lensed.push(`${LENSES[a.lens].id.padEnd(12)} s=${String(a.score).padStart(2)} /1k=${(words ? 1000 * a.score / words : 0).toFixed(0).padStart(3)} ${a.iso.padEnd(3)} | ${a.title.slice(0, 80).padEnd(80)} | ${themes}`);
}
console.log(`${rows.length} rows, ${lensed.length} lensed, ${sectioned.length} section-rejected, ${crowded.length} crowded out\n`);
console.log(lensed.sort().join('\n'));
console.log(`\n--- section-rejected (${sectioned.length}) ---\n${sectioned.sort().join('\n')}`);
console.log(`\n--- crowded out by the theme mix (${crowded.length}) ---\n${crowded.sort().join('\n')}`);
console.log('\n--- lensed on a single theme ---');
for (const [t, n] of [...sole].sort((p, q) => q[1] - p[1])) console.log(String(n).padStart(4), t);
