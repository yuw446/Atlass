/**
 * File ingestion pipeline for Perplexity data packages.
 *
 * Flow per file:
 *   inbox/{file}.json
 *     → parse JSON
 *     → validate + normalise (fuzzy matching, rescue mode)
 *     → write per-country data to Redis
 *     → move to processed/ (success) or failed/ (failure)
 *     → on failure: write {file}.error.json with detailed report
 */

import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackage } from './validate.js';
import { redis } from '../redis.js';
import type { NormalizedCountry, NormalizedPackage } from './schema.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DATA_ROOT  = join(__dirname, '..', '..', '..', '..', 'data');
const INBOX_DIR  = join(DATA_ROOT, 'inbox');
const PROCESSED_DIR = join(DATA_ROOT, 'processed');
const FAILED_DIR    = join(DATA_ROOT, 'failed');

// Redis TTLs
const COUNTRY_TTL_SECONDS = 24 * 60 * 60;  // 24 hours
const RUN_LOG_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface FileResult {
  file:       string;
  success:    boolean;
  countries:  string[];  // ISO2 codes written to Redis
  warnings:   string[];
  errors:     string[];
  duration_ms: number;
}

export interface IngestRunResult {
  run_id:      string;
  started_at:  string;
  finished_at: string;
  files_found: number;
  files_ok:    number;
  files_failed: number;
  countries_written: number;
  results:     FileResult[];
}

// ---------------------------------------------------------------------------
// Redis writes
// ---------------------------------------------------------------------------

async function writeCountryToRedis(country: NormalizedCountry): Promise<void> {
  const key = `atlas:perplexity:country:${country.code}`;
  await redis.setex(key, COUNTRY_TTL_SECONDS, JSON.stringify(country));
}

async function writeRunLog(result: IngestRunResult): Promise<void> {
  const key = `atlas:perplexity:run:${result.run_id}`;
  await redis.setex(key, RUN_LOG_TTL_SECONDS, JSON.stringify(result));
  await redis.set('atlas:perplexity:last_run', JSON.stringify({
    run_id:      result.run_id,
    started_at:  result.started_at,
    finished_at: result.finished_at,
    files_ok:    result.files_ok,
    files_failed: result.files_failed,
    countries_written: result.countries_written,
  }));
}

// ---------------------------------------------------------------------------
// File archiving
// ---------------------------------------------------------------------------

async function archiveFile(
  srcPath: string,
  success: boolean,
  errors?: string[],
  warnings?: string[],
): Promise<void> {
  const filename = basename(srcPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destName  = `${timestamp}_${filename}`;
  const destDir   = success ? PROCESSED_DIR : FAILED_DIR;
  const destPath  = join(destDir, destName);

  await rename(srcPath, destPath);

  if (!success && (errors?.length || warnings?.length)) {
    const errorReport = {
      original_file: filename,
      archived_at:   new Date().toISOString(),
      errors:        errors ?? [],
      warnings:      warnings ?? [],
    };
    await writeFile(
      join(FAILED_DIR, `${destName}.error.json`),
      JSON.stringify(errorReport, null, 2),
    );
  }
}

// ---------------------------------------------------------------------------
// Single file processing
// ---------------------------------------------------------------------------

export async function ingestFile(filePath: string): Promise<FileResult> {
  const file  = basename(filePath);
  const start = Date.now();

  // Parse JSON
  let raw: unknown;
  try {
    const text = await readFile(filePath, 'utf-8');
    raw = JSON.parse(text);
  } catch (err) {
    const errors = [`JSON parse error: ${(err as Error).message}`];
    await archiveFile(filePath, false, errors);
    return { file, success: false, countries: [], warnings: [], errors, duration_ms: Date.now() - start };
  }

  // Validate + normalise
  const result = validatePackage(raw, file);

  if (!result.success || !result.package) {
    await archiveFile(filePath, false, result.errors, result.warnings);
    return {
      file,
      success: false,
      countries: [],
      warnings: result.warnings,
      errors:   result.errors,
      duration_ms: Date.now() - start,
    };
  }

  const pkg: NormalizedPackage = result.package;

  // Write to Redis (individual country writes — partial failure is tolerated)
  const written: string[] = [];
  const redisErrors: string[] = [];
  for (const country of pkg.countries) {
    try {
      await writeCountryToRedis(country);
      written.push(country.code);
    } catch (err) {
      redisErrors.push(`Redis write failed for ${country.code}: ${(err as Error).message}`);
    }
  }

  const allErrors = [...result.errors, ...redisErrors];
  const success   = written.length > 0;

  await archiveFile(filePath, success, allErrors.length ? allErrors : undefined, result.warnings);

  return {
    file,
    success,
    countries:  written,
    warnings:   result.warnings,
    errors:     allErrors,
    duration_ms: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Scan inbox and process all .json files
// ---------------------------------------------------------------------------

export async function scanInbox(): Promise<IngestRunResult> {
  const runId     = `run-${Date.now()}`;
  const startedAt = new Date().toISOString();

  let entries: string[] = [];
  try {
    const all = await readdir(INBOX_DIR);
    entries = all.filter(f => f.endsWith('.json'));
  } catch (err) {
    console.error('[Ingest] Failed to read inbox:', err);
  }

  const results: FileResult[] = [];
  for (const entry of entries) {
    const filePath = join(INBOX_DIR, entry);
    try {
      const result = await ingestFile(filePath);
      results.push(result);
      if (result.success) {
        console.log(`[Ingest] ✓ ${entry} — wrote: [${result.countries.join(', ')}]${result.warnings.length ? ` (${result.warnings.length} warnings)` : ''}`);
      } else {
        console.warn(`[Ingest] ✗ ${entry} — errors: ${result.errors.join('; ')}`);
      }
    } catch (err) {
      console.error(`[Ingest] Unexpected error on ${entry}:`, err);
      results.push({
        file: entry,
        success: false,
        countries: [],
        warnings: [],
        errors: [`Unexpected error: ${(err as Error).message}`],
        duration_ms: 0,
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const runResult: IngestRunResult = {
    run_id:      runId,
    started_at:  startedAt,
    finished_at: finishedAt,
    files_found: entries.length,
    files_ok:    results.filter(r => r.success).length,
    files_failed: results.filter(r => !r.success).length,
    countries_written: results.flatMap(r => r.countries).length,
    results,
  };

  // Log to Redis (best-effort)
  try {
    await writeRunLog(runResult);
  } catch {
    // Non-fatal
  }

  return runResult;
}

// ---------------------------------------------------------------------------
// Status query (no processing)
// ---------------------------------------------------------------------------

export interface InboxStatus {
  inbox_count:     number;
  processed_count: number;
  failed_count:    number;
  last_run:        unknown | null;
}

export async function getInboxStatus(): Promise<InboxStatus> {
  const [inbox, processed, failed] = await Promise.all([
    readdir(INBOX_DIR).catch(() => [] as string[]),
    readdir(PROCESSED_DIR).catch(() => [] as string[]),
    readdir(FAILED_DIR).catch(() => [] as string[]),
  ]);

  let last_run: unknown = null;
  try {
    const raw = await redis.get('atlas:perplexity:last_run');
    if (raw) last_run = JSON.parse(raw);
  } catch {
    // Redis unavailable
  }

  return {
    inbox_count:     inbox.filter(f => f.endsWith('.json')).length,
    processed_count: processed.filter(f => f.endsWith('.json')).length,
    failed_count:    failed.filter(f => f.endsWith('.json')).length,
    last_run,
  };
}
