#!/usr/bin/env node

/**
 * Changed-code coverage — observation mode (#1849).
 *
 * Intersects the lcov reports produced by the already-affected pull-request
 * test scope with the executable lines the pull request actually added or
 * modified, then reports line and branch coverage for that intersection.
 *
 * Full-repository coverage stays in the weekly Coverage workflow. This runs per
 * pull request, is budgeted at 20 minutes, and — while the committed baseline
 * says `mode: "observation"` — can never fail the pull request.
 */

import { execFile } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { partitionChangedFiles } from './changed-code-coverage.policy.mjs';

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BASELINE_PATH = fileURLToPath(
  new URL('./changed-code-coverage.baseline.json', import.meta.url),
);
const COMMAND_MAX_BUFFER = 100 * 1024 * 1024;
const MAX_ANNOTATIONS = 40;
const MAX_SUMMARY_FILE_ROWS = 30;

const SURFACE_RESULTS = new Set(['success', 'failure', 'cancelled', 'skipped']);

// Worst-of ordering for rolling shard outcomes up into one surface result. A
// surface is only `success` when every one of its shards was.
const RESULT_SEVERITY = {
  success: 0,
  skipped: 1,
  failure: 2,
  cancelled: 3,
};

// ── Diff ────────────────────────────────────────────────────────────────────

/**
 * Parse `git diff --unified=0` output into the added/modified line numbers of
 * each post-image file. Deletions carry no executable changed lines, so hunks
 * with a zero-length new range are ignored.
 *
 * @param {string} rawDiff
 * @returns {Map<string, number[]>}
 */
export function parseUnifiedDiff(rawDiff) {
  const changedLines = new Map();
  let currentFile = null;

  for (const line of String(rawDiff ?? '').split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).trim();
      currentFile =
        target === '/dev/null'
          ? null
          : target.replace(/^b\//, '').replace(/^"(.*)"$/, '$1');
      if (currentFile && !changedLines.has(currentFile)) {
        changedLines.set(currentFile, new Set());
      }
      continue;
    }

    if (!currentFile || !line.startsWith('@@')) continue;

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!hunk) continue;

    const start = Number.parseInt(hunk[1], 10);
    const count = hunk[2] === undefined ? 1 : Number.parseInt(hunk[2], 10);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count)) continue;

    const lines = changedLines.get(currentFile);
    for (let offset = 0; offset < count; offset += 1) {
      lines.add(start + offset);
    }
  }

  return new Map(
    [...changedLines.entries()]
      .filter(([, lines]) => lines.size > 0)
      .map(([file, lines]) => [file, [...lines].sort((a, b) => a - b)]),
  );
}

/**
 * Use the same diff and exclusion policy for merging and reporting. Keep
 * comment/import-only source edits eligible: absence of LCOV cannot prove
 * those changed lines are non-executable.
 */
export function hasChangedSurfaceCode(name, changedFiles) {
  const prefix = { app: 'apps/app/', api: 'apps/server/api/' }[name];
  if (!prefix) throw new Error(`Unknown coverage surface: ${name}`);
  const { included } = partitionChangedFiles([...changedFiles.keys()]);
  return included.some(
    (file) => file.startsWith(prefix) && changedFiles.get(file).length > 0,
  );
}

// ── LCOV ────────────────────────────────────────────────────────────────────

/**
 * Parse an lcov report into per-source-file line hit counts and branch outcomes.
 * Records for the same source file (sharded or re-entered suites) are merged by
 * summing hits, matching how lcov consumers combine runs.
 *
 * @param {string} rawLcov
 * @returns {Map<string, {lines: Map<number, number>, branches: Map<string, number>}>}
 */
export function parseLcov(rawLcov) {
  const records = new Map();
  let current = null;

  for (const rawLine of String(rawLcov ?? '').split('\n')) {
    const line = rawLine.trim();

    if (line.startsWith('SF:')) {
      const sourceFile = line.slice(3).trim();
      if (!records.has(sourceFile)) {
        records.set(sourceFile, { lines: new Map(), branches: new Map() });
      }
      current = records.get(sourceFile);
      continue;
    }

    if (!current) continue;

    if (line === 'end_of_record') {
      current = null;
      continue;
    }

    if (line.startsWith('DA:')) {
      const [rawNumber, rawHits] = line.slice(3).split(',');
      const lineNumber = Number.parseInt(rawNumber, 10);
      const hits = Number.parseInt(rawHits, 10);
      if (!Number.isSafeInteger(lineNumber)) continue;
      current.lines.set(
        lineNumber,
        (current.lines.get(lineNumber) ?? 0) +
          (Number.isSafeInteger(hits) ? hits : 0),
      );
      continue;
    }

    if (line.startsWith('BRDA:')) {
      const [rawNumber, block, branch, taken] = line.slice(5).split(',');
      const lineNumber = Number.parseInt(rawNumber, 10);
      if (!Number.isSafeInteger(lineNumber)) continue;
      const key = `${lineNumber}:${block}:${branch}`;
      const hits = taken === '-' ? 0 : Number.parseInt(taken, 10);
      current.branches.set(
        key,
        (current.branches.get(key) ?? 0) +
          (Number.isSafeInteger(hits) ? hits : 0),
      );
    }
  }

  return records;
}

/**
 * Resolve an lcov `SF:` path onto a repository-relative changed file.
 *
 * lcov emits whatever path the provider recorded — absolute on CI, sometimes
 * workspace-relative. Rather than guess a base directory per surface, match by
 * path suffix against the known changed files and require the match to be
 * unambiguous.
 *
 * @param {string} sourceFile
 * @param {readonly string[]} changedFiles
 * @returns {string|null}
 */
export function matchSourceFile(sourceFile, changedFiles) {
  const normalized = String(sourceFile)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');

  if (changedFiles.includes(normalized)) return normalized;

  const forward = changedFiles.filter((candidate) =>
    normalized.endsWith(`/${candidate}`),
  );
  const matches = forward.length > 0 ? forward : reverseMatches();

  if (matches.length === 0) return null;

  const longest = Math.max(...matches.map((candidate) => candidate.length));
  const finalists = matches.filter((candidate) => candidate.length === longest);
  return finalists.length === 1 ? finalists[0] : null;

  function reverseMatches() {
    // Workspace-relative `SF:` paths (`src/foo.ts`) need the opposite test.
    // Require two segments so a bare `index.ts` can never claim a match.
    if (normalized.split('/').length < 2) return [];
    return changedFiles.filter((candidate) =>
      candidate.endsWith(`/${normalized}`),
    );
  }
}

// ── Measurement ─────────────────────────────────────────────────────────────

function percentage(covered, total) {
  if (total === 0) return null;
  return Math.round((covered / total) * 10_000) / 100;
}

/**
 * Intersect the changed executable lines with the merged coverage records.
 *
 * @param {{
 *   changedLinesByFile: Map<string, number[]>,
 *   coverageByFile: Map<string, {lines: Map<number, number>, branches: Map<string, number>}>,
 * }} input
 */
export function measureChangedCoverage({ changedLinesByFile, coverageByFile }) {
  const files = [];
  const totals = {
    lines: { measured: 0, covered: 0, unmeasured: 0 },
    branches: { measured: 0, covered: 0 },
  };

  for (const file of [...changedLinesByFile.keys()].sort()) {
    const changedLines = changedLinesByFile.get(file);
    const coverage = coverageByFile.get(file);

    if (!coverage) {
      totals.lines.unmeasured += changedLines.length;
      files.push({
        file,
        status: 'unmeasured',
        changedLines: changedLines.length,
        lines: { measured: 0, covered: 0, uncovered: 0, percent: null },
        branches: { measured: 0, covered: 0, uncovered: 0, percent: null },
        uncoveredLines: [],
      });
      continue;
    }

    const changedLineSet = new Set(changedLines);
    const uncoveredLines = [];
    let measuredLines = 0;
    let coveredLines = 0;

    for (const lineNumber of changedLines) {
      const hits = coverage.lines.get(lineNumber);
      if (hits === undefined) continue; // Non-executable line inside the hunk.
      measuredLines += 1;
      if (hits > 0) coveredLines += 1;
      else uncoveredLines.push(lineNumber);
    }

    let measuredBranches = 0;
    let coveredBranches = 0;
    for (const [key, hits] of coverage.branches) {
      const lineNumber = Number.parseInt(key.slice(0, key.indexOf(':')), 10);
      if (!changedLineSet.has(lineNumber)) continue;
      measuredBranches += 1;
      if (hits > 0) coveredBranches += 1;
    }

    totals.lines.measured += measuredLines;
    totals.lines.covered += coveredLines;
    totals.branches.measured += measuredBranches;
    totals.branches.covered += coveredBranches;

    // A file present in a report but carrying no executable changed line is
    // measured with an empty intersection — comments, imports, formatting.
    files.push({
      file,
      status: 'measured',
      changedLines: changedLines.length,
      lines: {
        measured: measuredLines,
        covered: coveredLines,
        uncovered: measuredLines - coveredLines,
        percent: percentage(coveredLines, measuredLines),
      },
      branches: {
        measured: measuredBranches,
        covered: coveredBranches,
        uncovered: measuredBranches - coveredBranches,
        percent: percentage(coveredBranches, measuredBranches),
      },
      uncoveredLines,
    });
  }

  const strictLineTotal = totals.lines.measured + totals.lines.unmeasured;

  return {
    files,
    totals: {
      lines: {
        measured: totals.lines.measured,
        covered: totals.lines.covered,
        uncovered: totals.lines.measured - totals.lines.covered,
        unmeasured: totals.lines.unmeasured,
        percent: percentage(totals.lines.covered, totals.lines.measured),
        strictPercent: percentage(totals.lines.covered, strictLineTotal),
      },
      branches: {
        measured: totals.branches.measured,
        covered: totals.branches.covered,
        uncovered: totals.branches.measured - totals.branches.covered,
        percent: percentage(totals.branches.covered, totals.branches.measured),
      },
    },
  };
}

// ── Surfaces ────────────────────────────────────────────────────────────────

/**
 * Classify one coverage surface from its job result and produced report.
 *
 * The three outcomes are deliberately distinct:
 *   - `not-applicable`  — the surface was out of scope for this diff.
 *   - `no-coverage`     — the surface ran clean but instrumented nothing, because
 *                         the changed graph pulled in no test file. Its changed
 *                         lines land in the report's `unmeasured` bucket rather
 *                         than being counted as covered.
 *   - `infrastructure-failed` — the job itself failed or was cancelled, so the
 *                         measurement is rejected instead of published as a pass.
 *
 * Conflating the middle case with the last one would mark every no-test pull
 * request as broken infrastructure and destroy the observation-phase evidence.
 *
 * @param {{name: string, result: string, lcovPath: string, lcov: string|null}} surface
 */
export function classifySurface({ name, result, lcovPath, lcov }) {
  if (!SURFACE_RESULTS.has(result)) {
    throw new Error(
      `surface ${name} must report a GitHub job result; received "${result}"`,
    );
  }

  const base = { name, result, lcovPath, sourceFiles: 0 };

  if (result === 'skipped') return { ...base, status: 'not-applicable' };
  if (result !== 'success') return { ...base, status: 'infrastructure-failed' };
  if (typeof lcov !== 'string' || lcov.trim().length === 0) {
    return { ...base, status: 'no-coverage' };
  }
  return { ...base, status: 'reported' };
}

// ── Shards ──────────────────────────────────────────────────────────────────

/** Worse of two surface/shard results, by `RESULT_SEVERITY`. */
export function worstResult(left, right) {
  const rank = (value) => RESULT_SEVERITY[value] ?? RESULT_SEVERITY.failure;
  return rank(left) >= rank(right) ? left : right;
}

/**
 * Roll a sharded surface's per-shard artifacts up into one surface.
 *
 * A surface used to be one unsharded job, so its GitHub job result carried both
 * "did the measurement happen" and "how long did it take". Sharding breaks both:
 * a matrix job's `outputs` are last-writer-wins across shards, and step-level
 * `continue-on-error` (which is what stops a slow shard from cancelling the job)
 * makes the job result `success` even when the coverage step failed. So each
 * shard writes its own outcome and duration next to its lcov, and the surface is
 * reconstructed from those instead.
 *
 *   - `result` is the **worst** shard outcome: a surface measured by three good
 *     shards and one timed-out shard is a partial measurement, and publishing it
 *     as a pass would understate uncovered lines.
 *   - `latencySeconds` is the **max**, not the sum: shards run in parallel, so
 *     the slowest one is the surface's wall clock — the number the baseline's
 *     `latencyBudgetMinutesP95` is measured against.
 *   - `lcov` is the concatenation. `parseLcov` merges repeated `SF:` records by
 *     summing hits, which is exactly how shards of one suite combine.
 *
 * @param {Array<{outcome?: string, seconds?: number, lcov?: string|null}>} shards
 */
export function aggregateSurfaceShards(shards) {
  if (shards.length === 0) {
    return { result: null, latencySeconds: null, lcov: null };
  }

  let result = 'success';
  let latencySeconds = null;

  for (const shard of shards) {
    const outcome = SURFACE_RESULTS.has(shard.outcome)
      ? shard.outcome
      : 'failure';
    result = worstResult(result, outcome);

    if (Number.isFinite(shard.seconds)) {
      latencySeconds = Math.max(latencySeconds ?? 0, shard.seconds);
    }
  }

  const reports = shards
    .map((shard) => shard.lcov)
    .filter((lcov) => typeof lcov === 'string' && lcov.trim().length > 0);

  return {
    result,
    latencySeconds,
    lcov: reports.length > 0 ? reports.join('\n') : null,
  };
}

/**
 * Read one shard directory as produced by the coverage jobs' staging step.
 * A shard that was cancelled before staging leaves nothing behind; that absence
 * is reported as a failed shard rather than skipped, so it cannot round up into
 * a clean surface.
 *
 * @param {string} directory
 */
function readShardDirectory(directory) {
  const read = (name) => {
    const file = path.join(directory, name);
    return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  };

  const seconds = Number.parseInt(read('seconds'), 10);
  return {
    outcome: read('outcome') || 'failure',
    seconds: Number.isSafeInteger(seconds) ? seconds : null,
    lcov: existsSync(path.join(directory, 'lcov.info'))
      ? readFileSync(path.join(directory, 'lcov.info'), 'utf8')
      : null,
  };
}

/**
 * Resolve a `--surface` path into shards.
 *
 * A directory is the sharded layout: one subdirectory per uploaded shard
 * artifact. A plain file is the single unsharded lcov the flag originally took,
 * kept working so the script stays usable by hand and in fixtures.
 *
 * @param {string} lcovPath
 */
export function readSurfacePath(lcovPath) {
  if (!lcovPath || !existsSync(lcovPath)) return [];

  if (!statSync(lcovPath).isDirectory()) {
    return [
      {
        outcome: 'success',
        seconds: null,
        lcov: readFileSync(lcovPath, 'utf8'),
      },
    ];
  }

  const shards = readdirSync(lcovPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => readShardDirectory(path.join(lcovPath, entry.name)));

  // Vitest coverage shards contain mergeable blob reports, not independently
  // finalizable LCOV. The report job merges those blobs once and writes the
  // canonical LCOV at the surface root while each child directory retains the
  // shard's outcome and wall-clock evidence.
  const mergedLcovPath = path.join(lcovPath, 'lcov.info');
  const mergedLcov = existsSync(mergedLcovPath)
    ? readFileSync(mergedLcovPath, 'utf8')
    : null;

  if (shards.length === 0) {
    return mergedLcov
      ? [{ outcome: 'success', seconds: null, lcov: mergedLcov }]
      : [];
  }

  if (mergedLcov) shards[0].lcov = mergedLcov;
  return shards;
}

// ── Report ──────────────────────────────────────────────────────────────────

export function readBaseline(baselinePath = BASELINE_PATH) {
  return JSON.parse(readFileSync(baselinePath, 'utf8'));
}

/**
 * Build the deterministic report. Everything under `normalized` is a pure
 * function of (base, head, diff, lcov) so repeating a pair is byte-identical;
 * run identity and latency live under `telemetry`.
 */
/**
 * @param {{
 *   baseSha: string,
 *   headSha: string,
 *   changedFiles: Map<string, number[]>,
 *   surfaces: object[],
 *   baseline: object,
 * }} input
 */
export function buildReport({
  baseSha,
  headSha,
  changedFiles,
  surfaces,
  baseline,
}) {
  const { included, excluded } = partitionChangedFiles([
    ...changedFiles.keys(),
  ]);
  surfaces = surfaces.map((surface) =>
    surface.result === 'success' &&
    !hasChangedSurfaceCode(surface.name, changedFiles)
      ? { ...surface, status: 'no-changed-code' }
      : { ...surface },
  );
  const reportedSurfaces = surfaces.filter(
    (surface) => surface.status === 'reported',
  );
  const failedSurfaces = surfaces.filter(
    (surface) => surface.status === 'infrastructure-failed',
  );

  const coverageByFile = new Map();
  for (const surface of reportedSurfaces) {
    for (const [sourceFile, record] of parseLcov(surface.lcov)) {
      const file = matchSourceFile(sourceFile, included);
      if (!file) continue;
      surface.sourceFiles += 1;
      const merged = coverageByFile.get(file) ?? {
        lines: new Map(),
        branches: new Map(),
      };
      for (const [lineNumber, hits] of record.lines) {
        merged.lines.set(
          lineNumber,
          (merged.lines.get(lineNumber) ?? 0) + hits,
        );
      }
      for (const [key, hits] of record.branches) {
        merged.branches.set(key, (merged.branches.get(key) ?? 0) + hits);
      }
      coverageByFile.set(file, merged);
    }
  }

  const changedLinesByFile = new Map(
    [...included].map((file) => [file, changedFiles.get(file) ?? []]),
  );
  const measurement = measureChangedCoverage({
    changedLinesByFile,
    coverageByFile,
  });

  const disposition = resolveDisposition({
    baseline,
    failedSurfaces,
    included,
    measurement,
  });

  return {
    // Version 2 requires shard blobs to be merged before LCOV is consumed.
    // Version 1 artifacts could contain a zero-byte lcov.info even when every
    // test shard passed, so they are not valid ratchet evidence.
    version: 2,
    normalized: {
      baseSha,
      headSha,
      mode: baseline.mode,
      disposition,
      surfaces: surfaces
        .map(({ name, result, status, sourceFiles }) => ({
          name,
          result,
          status,
          matchedChangedFiles: sourceFiles,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      changedFileCount: included.length,
      exclusions: excluded,
      totals: measurement.totals,
      files: measurement.files,
    },
    ratchet: {
      lines: baseline.ratchet.lines,
      branches: baseline.ratchet.branches,
      roundingMarginPercentagePoints: baseline.roundingMarginPercentagePoints,
      treatUnmeasuredAsUncovered: baseline.treatUnmeasuredAsUncovered,
    },
  };
}

function resolveDisposition({
  baseline,
  failedSurfaces,
  included,
  measurement,
}) {
  if (included.length === 0) return 'not-applicable';
  if (failedSurfaces.length > 0) return 'infrastructure-failed';
  if (baseline.mode !== 'enforcement') {
    // Observation evidence needs a measurement. A full-suite run skips both
    // changed shards and a no-test diff instruments nothing; neither observes
    // changed-code coverage, so neither counts toward `observation.requiredRuns`.
    return measurement.totals.lines.measured === 0
      ? 'unmeasured'
      : 'observation-only';
  }
  // Enforcement leaves the "nothing was instrumented" case to the ratchet:
  // with `treatUnmeasuredAsUncovered` on, an entirely unmeasured diff scores 0%
  // and is caught, rather than passing on an empty denominator.
  return evaluateRatchet({ baseline, totals: measurement.totals }).passed
    ? 'reported'
    : 'below-ratchet';
}

/**
 * Compare a measurement against an adopted ratchet. Only ever consulted in
 * enforcement mode; observation runs short-circuit before this.
 */
export function evaluateRatchet({ baseline, totals }) {
  const margin = baseline.roundingMarginPercentagePoints ?? 0;
  const lineTotal = baseline.treatUnmeasuredAsUncovered
    ? totals.lines.strictPercent
    : totals.lines.percent;
  const shortfalls = [];

  for (const [metric, observed, threshold] of [
    ['lines', lineTotal, baseline.ratchet.lines],
    ['branches', totals.branches.percent, baseline.ratchet.branches],
  ]) {
    if (threshold === null || threshold === undefined) continue;
    if (observed === null) continue;
    if (observed + margin < threshold) {
      shortfalls.push({ metric, observed, threshold });
    }
  }

  return { passed: shortfalls.length === 0, shortfalls };
}

// ── Presentation ────────────────────────────────────────────────────────────

const DISPOSITION_NOTE = {
  'not-applicable':
    'No executable first-party lines changed under the reviewed exclusion policy.',
  'observation-only':
    'Observation mode: reported for review only. This job cannot fail the pull request.',
  unmeasured:
    'No changed line was instrumented: the changed-test shards were skipped or pulled in no test file. This run is not an observation.',
  reported: 'Changed-code coverage meets the adopted ratchet.',
  'below-ratchet': 'Changed-code coverage fell below the adopted ratchet.',
  'infrastructure-failed':
    'A coverage surface failed to produce a usable report. The measurement is rejected rather than published as a pass.',
};

export function formatSummary(report) {
  const { normalized } = report;
  const { totals } = normalized;
  const lines = [
    '# Changed-code coverage',
    '',
    `- Mode: \`${normalized.mode}\` · Disposition: \`${normalized.disposition}\``,
    `- Base: \`${normalized.baseSha}\` → Head: \`${normalized.headSha}\``,
    `- Measured files: ${normalized.changedFileCount} changed · ${normalized.exclusions.length} excluded by policy`,
    '',
    DISPOSITION_NOTE[normalized.disposition] ?? '',
    '',
    '| Metric | Covered | Measured | Coverage | Ratchet |',
    '| --- | ---: | ---: | ---: | ---: |',
    `| Lines | ${totals.lines.covered} | ${totals.lines.measured} | ${formatPercent(totals.lines.percent)} | ${formatThreshold(report.ratchet.lines)} |`,
    `| Branches | ${totals.branches.covered} | ${totals.branches.measured} | ${formatPercent(totals.branches.percent)} | ${formatThreshold(report.ratchet.branches)} |`,
    '',
  ];

  if (totals.lines.unmeasured > 0) {
    lines.push(
      `> ${totals.lines.unmeasured} changed line(s) in ${normalized.files.filter((file) => file.status === 'unmeasured').length} file(s) were not instrumented by any surface in this run.`,
      `> Counting them as uncovered gives **${formatPercent(totals.lines.strictPercent)}** line coverage — the number enforcement will use once \`treatUnmeasuredAsUncovered\` flips at promotion.`,
      '',
    );
  }

  lines.push(
    '| Surface | Job | Status | Matched files |',
    '| --- | --- | --- | ---: |',
    ...normalized.surfaces.map(
      (surface) =>
        `| ${surface.name} | ${surface.result} | ${surface.status} | ${surface.matchedChangedFiles} |`,
    ),
    '',
  );

  const interesting = normalized.files
    .filter((file) => file.status === 'unmeasured' || file.lines.uncovered > 0)
    .sort(
      (left, right) =>
        right.lines.uncovered - left.lines.uncovered ||
        right.changedLines - left.changedLines ||
        left.file.localeCompare(right.file),
    );

  if (interesting.length > 0) {
    lines.push(
      '## Changed code without coverage',
      '',
      '| File | Status | Uncovered lines | Changed lines | Line coverage |',
      '| --- | --- | ---: | ---: | ---: |',
      ...interesting
        .slice(0, MAX_SUMMARY_FILE_ROWS)
        .map(
          (file) =>
            `| \`${file.file}\` | ${file.status} | ${file.status === 'unmeasured' ? file.changedLines : file.lines.uncovered} | ${file.changedLines} | ${formatPercent(file.lines.percent)} |`,
        ),
      '',
    );
    if (interesting.length > MAX_SUMMARY_FILE_ROWS) {
      lines.push(
        `_${interesting.length - MAX_SUMMARY_FILE_ROWS} further file(s) omitted from this table; the full list is in the \`changed-code-coverage\` artifact._`,
        '',
      );
    }
  }

  if (normalized.exclusions.length > 0) {
    const byRule = new Map();
    for (const exclusion of normalized.exclusions) {
      byRule.set(exclusion.ruleId, (byRule.get(exclusion.ruleId) ?? 0) + 1);
    }
    lines.push(
      '<details><summary>Policy exclusions</summary>',
      '',
      '| Rule | Files |',
      '| --- | ---: |',
      ...[...byRule.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([ruleId, count]) => `| \`${ruleId}\` | ${count} |`),
      '',
      '</details>',
      '',
    );
  }

  return `${lines.join('\n')}\n`;
}

function formatPercent(value) {
  return value === null ? 'n/a' : `${value.toFixed(2)}%`;
}

function formatThreshold(value) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

/**
 * Workflow-command annotations for uncovered changed lines. Contiguous runs
 * collapse into one annotation so a large gap costs one line, not a hundred.
 */
export function formatAnnotations(report, limit = MAX_ANNOTATIONS) {
  const annotations = [];

  for (const file of report.normalized.files) {
    if (file.status !== 'measured' || file.uncoveredLines.length === 0)
      continue;
    for (const [start, end] of collapseRanges(file.uncoveredLines)) {
      if (annotations.length >= limit) return annotations;
      annotations.push(
        `::notice file=${file.file},line=${start},endLine=${end}::Changed ${
          start === end ? 'line is' : 'lines are'
        } not covered by the affected test scope (changed-code coverage, ${report.normalized.mode} mode)`,
      );
    }
  }

  return annotations;
}

function collapseRanges(numbers) {
  const ranges = [];
  for (const value of numbers) {
    const last = ranges.at(-1);
    if (last && value === last[1] + 1) last[1] = value;
    else ranges.push([value, value]);
  }
  return ranges;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArguments(argv) {
  const values = {
    base: '',
    head: 'HEAD',
    out: '',
    surfaces: [],
    annotate: false,
    hasChangedCode: '',
  };

  let index = 0;
  const next = () => {
    index += 1;
    return argv[index] ?? '';
  };

  for (; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--base') {
      values.base = next();
    } else if (argument === '--head') {
      values.head = next();
    } else if (argument === '--has-changed-code') {
      values.hasChangedCode = next();
      if (!values.hasChangedCode)
        throw new Error('--has-changed-code requires a surface');
    } else if (argument === '--out') {
      values.out = next();
    } else if (argument === '--annotate') {
      values.annotate = true;
    } else if (argument === '--surface') {
      const raw = next();
      const [name, result, ...rest] = raw.split('=');
      if (!name || !result) {
        throw new Error(
          `--surface expects <name>=<jobResult>[=<lcovPath>]; received "${raw}"`,
        );
      }
      values.surfaces.push({ name, result, lcovPath: rest.join('=') });
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!values.base) throw new Error('--base is required');
  return values;
}

async function runGitCommand(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: COMMAND_MAX_BUFFER,
  });
  return stdout;
}

async function resolveCommit(endpoint, commitish, commandRunner) {
  try {
    const output = String(
      await commandRunner('git', [
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${commitish}^{commit}`,
      ]),
    ).trim();

    if (!/^[0-9a-f]+$/.test(output)) {
      throw new Error('git returned a malformed canonical commit ID');
    }
    return output;
  } catch {
    throw new Error(`Could not resolve ${endpoint} commit`);
  }
}

/**
 * Resolve commit-ish CLI inputs before reading the diff. The canonical IDs are
 * both the diff boundaries and the normalized evidence identity.
 *
 * @param {{base: string, head: string}} input
 * @param {(command: string, args: string[]) => Promise<string>} commandRunner
 */
export async function resolveDiffInputs(
  { base, head },
  commandRunner = runGitCommand,
) {
  const baseSha = await resolveCommit('base', base, commandRunner);
  const headSha = await resolveCommit('head', head, commandRunner);
  const rawDiff = await commandRunner('git', [
    'diff',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    '--find-renames',
    '--diff-filter=ACMR',
    baseSha,
    headSha,
  ]);

  return { baseSha, headSha, rawDiff };
}

async function runCli() {
  const args = parseArguments(process.argv.slice(2));
  const diffInputs = await resolveDiffInputs(args);
  const baseline = readBaseline();
  const changedFiles = parseUnifiedDiff(diffInputs.rawDiff);

  if (args.hasChangedCode) {
    process.stdout.write(
      `${hasChangedSurfaceCode(args.hasChangedCode, changedFiles)}\n`,
    );
    return;
  }

  let observedLatencySeconds = null;
  const surfaces = args.surfaces.map((surface) => {
    const shards = readSurfacePath(surface.lcovPath);
    const merged = aggregateSurfaceShards(shards);

    if (Number.isFinite(merged.latencySeconds)) {
      observedLatencySeconds = Math.max(
        observedLatencySeconds ?? 0,
        merged.latencySeconds,
      );
    }

    // Neither signal alone is sufficient, so take the worse of the two.
    //
    // The shards' own outcomes are needed because step-level `continue-on-error`
    // is what stops a slow shard from cancelling its job, and it leaves the job
    // result `success` even when the coverage step failed.
    //
    // The job result is still needed because a shard killed by the job-level
    // backstop stages nothing at all: it contributes no outcome file, and the
    // surviving shards would otherwise round up to a clean surface built from a
    // partial measurement.
    const result =
      surface.result === 'skipped' || merged.result === null
        ? surface.result
        : worstResult(surface.result, merged.result);

    return {
      ...classifySurface({ ...surface, result, lcov: merged.lcov }),
      lcov: merged.lcov,
    };
  });

  const report = buildReport({
    baseSha: diffInputs.baseSha,
    headSha: diffInputs.headSha,
    changedFiles,
    surfaces,
    baseline,
  });

  report.telemetry = {
    repository: process.env.GITHUB_REPOSITORY ?? null,
    pullRequest: process.env.PR_NUMBER ? Number(process.env.PR_NUMBER) : null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    startedAt: process.env.OBSERVATION_STARTED_AT ?? null,
    // Surface wall clock, measured by the shards themselves. Matrix job outputs
    // are last-writer-wins across shards and cannot carry this; the environment
    // variable survives only as a fallback for an unsharded or hand-run report.
    latencySeconds:
      observedLatencySeconds ??
      (process.env.OBSERVATION_LATENCY_SECONDS
        ? Number(process.env.OBSERVATION_LATENCY_SECONDS)
        : null),
  };

  const summary = formatSummary(report);
  process.stdout.write(summary);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }

  if (args.annotate) {
    for (const annotation of formatAnnotations(report)) {
      process.stdout.write(`${annotation}\n`);
    }
  }

  if (args.out) {
    writeFileSync(
      path.resolve(args.out),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
  }

  // Observation mode never fails the pull request. Enforcement mode fails only
  // on a real shortfall or a rejected (infrastructure-failed) measurement.
  if (baseline.mode !== 'enforcement') return;
  if (
    report.normalized.disposition === 'below-ratchet' ||
    report.normalized.disposition === 'infrastructure-failed'
  ) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
