#!/usr/bin/env node
// Recorded test time per file, used by the Plan job to fill shards (#10273).
//
// The shards of the Full Suite write one timing receipt each
// (scripts/ci/api-test-timings-reporter.mjs). `merge` folds the receipts of one
// run into a small rolling file, keeping the last few samples per file, and the
// nightly run on master saves that file in the Actions cache. A pull request's
// Plan job reads it back through `loadTimings`.
//
// A missing, damaged, outdated or stale file is never an error: the plan falls
// back to an even split, because timings only improve the balance of the
// shards and must never decide whether a plan exists.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const TIMINGS_SCHEMA_VERSION = 1;
// Samples kept per file; the median of these is the file's weight.
export const MAX_SAMPLES = 5;
// A nightly run refreshes the file every day, so a file older than this means
// the nightly stopped and the numbers describe a different suite.
export const MAX_TIMINGS_AGE_MS = 14 * 24 * 60 * 60 * 1000;
// Fewer known files than this share of a plan means the timings describe some
// other part of the suite, and the file count is the better estimate.
export const MIN_KNOWN_SHARE = 0.5;

export const SUITES = ['app', 'api'];

export function emptyTimings() {
  return {
    schemaVersion: TIMINGS_SCHEMA_VERSION,
    updatedAt: null,
    suites: { app: {}, api: {} },
  };
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSampleList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((sample) => Number.isFinite(sample) && sample >= 0)
  );
}

/**
 * Parses a rolling timings file. Returns null for anything that is not a
 * current-schema file, so the caller treats it as missing.
 *
 * @param {string} raw
 */
export function parseTimings(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== TIMINGS_SCHEMA_VERSION ||
    typeof parsed.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(parsed.updatedAt)) ||
    !isRecord(parsed.suites)
  ) {
    return null;
  }
  const timings = emptyTimings();
  timings.updatedAt = parsed.updatedAt;
  for (const suite of SUITES) {
    const entries = parsed.suites[suite];
    if (!isRecord(entries)) continue;
    for (const [file, samples] of Object.entries(entries)) {
      if (isSampleList(samples)) {
        timings.suites[suite][file] = samples.slice(-MAX_SAMPLES);
      }
    }
  }
  return timings;
}

/**
 * Median seconds per file for each suite, or empty maps when the file at
 * `file` is missing, unreadable, outdated or older than MAX_TIMINGS_AGE_MS.
 *
 * @param {string | undefined} file
 * @param {{ now?: number, readFile?: (file: string) => string }} [options]
 * @returns {{ app: Map<string, number>, api: Map<string, number> }}
 */
export function loadTimings(
  file,
  {
    now = Date.now(),
    readFile = (target) => readFileSync(target, 'utf8'),
  } = {},
) {
  const seconds = { app: new Map(), api: new Map() };
  if (!file) return seconds;
  let raw;
  try {
    raw = readFile(file);
  } catch {
    return seconds;
  }
  const timings = parseTimings(raw);
  if (!timings || now - Date.parse(timings.updatedAt) > MAX_TIMINGS_AGE_MS) {
    return seconds;
  }
  for (const suite of SUITES) {
    for (const [name, samples] of Object.entries(timings.suites[suite])) {
      seconds[suite].set(name, median(samples));
    }
  }
  return seconds;
}

/**
 * The seconds a file adds to its shard's wall time. A receipt's
 * `observedWorkMs` sums the work of every Vitest worker, so one shard's files
 * add up to `maxWorkers` times its wall time (two workers: 129, 302, 331 and
 * 242 s of work for shards that took 65, 152, 167 and 122 s, run 43760724001).
 *
 * @param {{ observedWorkMs: number }} file
 * @param {{ runtime?: { maxWorkers?: number } }} record
 */
export function fileSeconds(file, record) {
  const reported = Number(record.runtime?.maxWorkers);
  const workers = Number.isFinite(reported) ? Math.max(reported, 1) : 1;
  return file.observedWorkMs / 1000 / workers;
}

/**
 * Adds one run's receipts to the rolling file.
 *
 * Only files that passed contribute a sample: a failing file's time describes
 * the failure. An incomplete receipt contributes nothing. When every receipt
 * of the run is a full run, files that no shard listed as a candidate any more
 * are dropped, so a deleted spec does not keep its weight.
 *
 * @param {ReturnType<typeof emptyTimings> | null} previous
 * @param {{ app: object[], api: object[] }} records receipts per suite
 * @param {{ now?: number }} [options]
 */
export function mergeTimings(previous, records, { now = Date.now() } = {}) {
  const merged = previous ?? emptyTimings();
  for (const suite of SUITES) {
    const entries = merged.suites[suite];
    const complete = records[suite].filter((record) => record.isComplete);
    const perFile = new Map();
    for (const record of complete) {
      for (const file of record.files) {
        if (file.state !== 'passed') continue;
        perFile.set(file.file, [
          ...(perFile.get(file.file) ?? []),
          fileSeconds(file, record),
        ]);
      }
    }
    // A file is one sample per run, however many receipts listed it.
    for (const [name, samples] of perFile) {
      const total = samples.reduce((sum, value) => sum + value, 0);
      entries[name] = [...(entries[name] ?? []), round(total)].slice(
        -MAX_SAMPLES,
      );
    }
    const isFullRun =
      complete.length > 0 &&
      complete.length === records[suite].length &&
      complete.every((record) => record.selection?.mode === 'full');
    if (isFullRun) {
      const candidates = new Set(
        complete.flatMap((record) => record.candidateFiles),
      );
      for (const name of Object.keys(entries)) {
        if (!candidates.has(name)) delete entries[name];
      }
    }
  }
  merged.updatedAt = new Date(now).toISOString();
  return merged;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Seconds per planned file. The weights are the recorded medians; a file with
 * no record weighs the median of the known ones, so a new file is neither free
 * nor the heaviest. When fewer than MIN_KNOWN_SHARE of the files have a
 * record, every file weighs the same and `isTimed` is false.
 *
 * @param {readonly string[]} files
 * @param {ReadonlyMap<string, number> | undefined} recorded
 * @returns {{ isTimed: boolean, totalSeconds: number, weights: Map<string, number> }}
 */
export function weighFiles(files, recorded) {
  const unique = [...new Set(files)];
  const known = unique.filter((file) => recorded?.has(file));
  if (
    unique.length === 0 ||
    known.length === 0 ||
    known.length / unique.length < MIN_KNOWN_SHARE
  ) {
    return {
      isTimed: false,
      totalSeconds: 0,
      weights: new Map(unique.map((file) => [file, 1])),
    };
  }
  const fallback = median([...recorded.values()]);
  const weights = new Map(
    unique.map((file) => [file, recorded.get(file) ?? fallback]),
  );
  return {
    isTimed: true,
    totalSeconds: [...weights.values()].reduce((sum, value) => sum + value, 0),
    weights,
  };
}

function listReceipts(directory) {
  if (!directory || !existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory)) {
    const target = path.join(directory, entry);
    if (statSync(target).isDirectory()) found.push(...listReceipts(target));
    else if (entry.endsWith('.json')) found.push(target);
  }
  return found.sort();
}

function readReceipts(directory) {
  return listReceipts(directory).map((file) =>
    JSON.parse(readFileSync(file, 'utf8')),
  );
}

function runCli(argv) {
  const [command, ...rest] = argv;
  if (command !== 'merge') {
    throw new Error(
      'Usage: test-timings.mjs merge --out <file> [--previous <file>] [--app <dir>] [--api <dir>]',
    );
  }
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (!['--out', '--previous', '--app', '--api'].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    options[flag.slice(2)] = rest[index + 1];
  }
  if (!options.out) throw new Error('--out is required');

  const previous =
    options.previous && existsSync(options.previous)
      ? parseTimings(readFileSync(options.previous, 'utf8'))
      : null;
  const merged = mergeTimings(previous, {
    app: readReceipts(options.app),
    api: readReceipts(options.api),
  });
  mkdirSync(path.dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(merged)}\n`);
  process.stdout.write(
    `Recorded timings for ${Object.keys(merged.suites.app).length} app and ${Object.keys(merged.suites.api).length} API files\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `::error::${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
