#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PLAYWRIGHT_E2E_CORE_PATHS,
  PLAYWRIGHT_E2E_LANE_EXCLUSIONS,
  PLAYWRIGHT_E2E_QUARANTINES,
} from './playwright-e2e-tiers.manifest.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SPECS_ROOT = 'playwright/e2e/tests';
const PLAYWRIGHT_CONFIG = 'playwright/configs/playwright.config.ts';
const PLAYWRIGHT_PROJECT = 'app-core';
const REPORT_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  'playwright/artifacts/report',
);
const SUMMARY_FILENAME = 'full-tier-summary.json';
const PLAYWRIGHT_JSON_REPORT_FILENAME = 'results.json';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLAYWRIGHT_JSON_REPORT_PATH = path.join(
  REPORT_DIRECTORY,
  PLAYWRIGHT_JSON_REPORT_FILENAME,
);

export const PLAYWRIGHT_E2E_TIER_CONTRACT = {
  configs: {
    authed: PLAYWRIGHT_CONFIG,
    core: PLAYWRIGHT_CONFIG,
    full: PLAYWRIGHT_CONFIG,
  },
  scripts: {
    authed: 'test:e2e:authed',
    core: 'test:e2e:core',
    full: 'test:e2e:full',
  },
  tiers: ['core', 'authed', 'full'],
};

/**
 * @typedef {import('./playwright-e2e-tiers.manifest.mjs').PlaywrightE2eQuarantine} PlaywrightE2eQuarantine
 */

/**
 * @typedef {{
 *   discoveredFiles: string[],
 *   quarantinedFiles: PlaywrightE2eQuarantine[],
 *   laneExcludedFiles?: Array<{ file: string, lane: string, reason: string }>,
 *   selectedFiles: string[],
 *   tier: 'full',
 * }} PlaywrightE2eTierPlan
 */

/**
 * @typedef {{
 *   discoveredFileCount: number,
 *   discoveredFiles: string[],
 *   executedFileCount: number | null,
 *   executedTestCount: number | null,
 *   failedTestCount: number | null,
 *   skippedTestCount: number | null,
 *   flakyTestCount: number | null,
 *   firstAttemptFailureCount: number | null,
 *   reportErrorCount: number | null,
 *   laneExcludedFileCount: number,
 *   failedFileCount: number | null,
 *   quarantinedFileCount: number,
 *   quarantinedFiles: PlaywrightE2eQuarantine[],
 *   selectedFileCount: number,
 *   selectedFiles: string[],
 *   status: 'failed' | 'passed' | 'planned',
 *   tier: 'full',
 * }} PlaywrightE2eTierSummary
 */

function toPosixPath(file) {
  return file.replaceAll(path.sep, '/');
}

function toIsoDate(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function collectSpecFiles(rootDir, directory) {
  const absoluteDirectory = path.join(rootDir, directory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(
    (entry) => {
      const relativePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSpecFiles(rootDir, relativePath);
      }

      return entry.isFile() && entry.name.endsWith('.spec.ts')
        ? [toPosixPath(relativePath)]
        : [];
    },
  );
}

export function discoverPlaywrightSpecs(rootDir = REPOSITORY_ROOT) {
  return collectSpecFiles(rootDir, SPECS_ROOT).sort((left, right) =>
    left.localeCompare(right),
  );
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates].sort((left, right) => left.localeCompare(right));
}

/**
 * @param {string[]} discoveredFiles
 * @param {PlaywrightE2eQuarantine[]} quarantines
 * @param {Date | number} [now]
 */
export function validatePlaywrightE2eQuarantines(
  discoveredFiles,
  quarantines,
  now = new Date(),
) {
  const discovered = new Set(discoveredFiles);
  const errors = [];
  const duplicates = duplicateValues(quarantines.map(({ file }) => file));
  if (duplicates.length > 0) {
    errors.push(`Duplicate quarantines: ${duplicates.join(', ')}`);
  }

  const today = toIsoDate(now);
  const seen = new Set();

  for (const quarantine of quarantines) {
    if (seen.has(quarantine.file)) {
      continue;
    }
    seen.add(quarantine.file);

    if (!discovered.has(quarantine.file)) {
      errors.push(`Quarantined file is not discoverable: ${quarantine.file}`);
    }
    if (!quarantine.reason || quarantine.reason.trim().length === 0) {
      errors.push(`Quarantine has no reason: ${quarantine.file}`);
    }

    const hasOwner =
      typeof quarantine.owner === 'string' &&
      quarantine.owner.trim().length > 0;
    const hasTrackingIssue =
      Number.isSafeInteger(quarantine.trackingIssue) &&
      quarantine.trackingIssue > 0;
    if (!hasOwner && !hasTrackingIssue) {
      errors.push(
        `Quarantine has no owner or tracking issue: ${quarantine.file}`,
      );
    }

    if (!ISO_DATE.test(quarantine.reviewBy ?? '')) {
      errors.push(`Quarantine has no review date: ${quarantine.file}`);
      continue;
    }

    if (quarantine.reviewBy < today) {
      errors.push(
        `Quarantine expired: ${quarantine.file} (reviewBy ${quarantine.reviewBy})`,
      );
    }
  }

  return errors;
}

/**
 * @param {{
 *   now?: Date | number,
 *   quarantines?: PlaywrightE2eQuarantine[],
 *   rootDir?: string,
 *   laneExclusions?: Array<{ file: string, lane: string, reason: string }>,
 * }} [options]
 */
export function buildPlaywrightE2eTierPlan(options = {}) {
  const quarantines = options.quarantines ?? PLAYWRIGHT_E2E_QUARANTINES;
  const rootDir = options.rootDir ?? REPOSITORY_ROOT;
  const laneExcludedFiles =
    options.laneExclusions ?? PLAYWRIGHT_E2E_LANE_EXCLUSIONS;
  const discoveredFiles = discoverPlaywrightSpecs(rootDir);
  const manifestErrors = validatePlaywrightE2eQuarantines(
    discoveredFiles,
    quarantines,
    options.now ?? new Date(),
  );

  if (manifestErrors.length > 0) {
    throw new Error(
      `Invalid Playwright E2E quarantine manifest:\n${manifestErrors
        .map((error) => `- ${error}`)
        .join('\n')}`,
    );
  }

  const excludedFiles = [...quarantines, ...laneExcludedFiles];
  for (const exclusion of laneExcludedFiles) {
    if (
      !discoveredFiles.includes(exclusion.file) ||
      !exclusion.lane ||
      !exclusion.reason
    ) {
      throw new Error(`Invalid Playwright lane exclusion: ${exclusion.file}`);
    }
  }
  if (duplicateValues(excludedFiles.map(({ file }) => file)).length > 0) {
    throw new Error(
      'A spec cannot belong to both a quarantine and another lane.',
    );
  }
  const quarantinedPaths = new Set(excludedFiles.map(({ file }) => file));
  return {
    discoveredFiles,
    quarantinedFiles: [...quarantines],
    laneExcludedFiles: [...laneExcludedFiles],
    selectedFiles: discoveredFiles.filter(
      (file) => !quarantinedPaths.has(file),
    ),
    tier: 'full',
  };
}

/**
 * @param {string} directory
 * @returns {string[]}
 */
export function collectPlaywrightJsonReportPaths(directory) {
  if (!directory || !existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectPlaywrightJsonReportPaths(absolutePath);
      }

      return entry.isFile() && entry.name.endsWith('.json')
        ? [absolutePath]
        : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

/**
 * @param {unknown} value
 * @returns {value is { stats?: { expected?: number, unexpected?: number }, suites?: unknown[] }}
 */
export function isPlaywrightJsonReport(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const report = /** @type {{ stats?: unknown, suites?: unknown }} */ (value);
  return Array.isArray(report.suites) || report.stats !== undefined;
}

/**
 * Counts test cases once per project, regardless of retries. Skipped cases are
 * separate; file counts require actual file evidence and never use spec totals.
 * @param {Array<{ stats?: { expected?: number, unexpected?: number, flaky?: number, skipped?: number }, suites?: object[], errors?: object[] }>} reports
 */
export function mergePlaywrightJsonReports(reports) {
  const counts = {
    executed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    firstAttemptFailures: 0,
    errors: 0,
  };
  const executedFiles = new Set();
  const failedFiles = new Set();
  let hasFileEvidence = false;
  function visit(suite, parentFile) {
    const file = suite.file ?? parentFile;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const attempts = (test.results ?? []).filter(
          (result) => result.status !== 'skipped',
        );
        if (attempts.length === 0) {
          counts.skipped += 1;
          continue;
        }
        counts.executed += 1;
        const testFile = spec.file ?? file;
        if (testFile) {
          hasFileEvidence = true;
          executedFiles.add(testFile);
        }
        if (attempts[0].status !== (test.expectedStatus ?? 'passed'))
          counts.firstAttemptFailures += 1;
        if (test.status === 'flaky') counts.flaky += 1;
        if (
          test.status === 'unexpected' ||
          attempts.at(-1).status === 'interrupted'
        ) {
          counts.failed += 1;
          if (testFile) failedFiles.add(testFile);
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child, file);
  }
  for (const report of reports) {
    const before = counts.executed + counts.skipped;
    for (const suite of report.suites ?? []) visit(suite);
    if (counts.executed + counts.skipped === before && report.stats) {
      counts.executed +=
        (report.stats.expected ?? 0) +
        (report.stats.unexpected ?? 0) +
        (report.stats.flaky ?? 0);
      counts.failed += report.stats.unexpected ?? 0;
      counts.flaky += report.stats.flaky ?? 0;
      counts.skipped += report.stats.skipped ?? 0;
    }
    counts.errors += report.errors?.length ?? 0;
  }
  return {
    ...counts,
    executedFileCount: hasFileEvidence ? executedFiles.size : null,
    failedFileCount: hasFileEvidence ? failedFiles.size : null,
  };
}

/**
 * @param {{
 *   plan: PlaywrightE2eTierPlan,
 *   playwrightReport?: { stats?: { expected?: number, unexpected?: number }, suites?: unknown[] },
 *   playwrightReports?: Array<{ stats?: { expected?: number, unexpected?: number }, suites?: unknown[] }>,
 *   status: 'failed' | 'passed' | 'planned',
 * }} input
 */
export function buildPlaywrightE2eTierSummary({
  plan,
  playwrightReport,
  playwrightReports,
  status,
}) {
  const reports = [
    ...(playwrightReports ?? []),
    ...(playwrightReport ? [playwrightReport] : []),
  ];
  const merged = mergePlaywrightJsonReports(reports);
  const hasEvidence = status !== 'planned' && reports.length > 0;
  const effectiveStatus =
    status === 'passed' &&
    (merged.executed === 0 || merged.failed > 0 || merged.errors > 0)
      ? 'failed'
      : status;
  return {
    discoveredFileCount: plan.discoveredFiles.length,
    discoveredFiles: plan.discoveredFiles,
    executedFileCount: hasEvidence ? merged.executedFileCount : null,
    failedFileCount: hasEvidence ? merged.failedFileCount : null,
    executedTestCount: hasEvidence ? merged.executed : null,
    failedTestCount: hasEvidence ? merged.failed : null,
    skippedTestCount: hasEvidence ? merged.skipped : null,
    flakyTestCount: hasEvidence ? merged.flaky : null,
    firstAttemptFailureCount: hasEvidence ? merged.firstAttemptFailures : null,
    reportErrorCount: hasEvidence ? merged.errors : null,
    laneExcludedFileCount: plan.laneExcludedFiles?.length ?? 0,
    laneExcludedFiles: plan.laneExcludedFiles ?? [],
    quarantinedFileCount: plan.quarantinedFiles.length,
    quarantinedFiles: plan.quarantinedFiles,
    selectedFileCount: plan.selectedFiles.length,
    selectedFiles: plan.selectedFiles,
    status: effectiveStatus,
    tier: 'full',
  };
}

function writeSummary(summary) {
  mkdirSync(REPORT_DIRECTORY, { recursive: true });
  const reportPath = path.join(REPORT_DIRECTORY, SUMMARY_FILENAME);
  writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
  appendGitHubSummary(summary);
  console.log(
    `[playwright-e2e] status=${summary.status} discovered=${summary.discoveredFileCount} selected=${summary.selectedFileCount} quarantined=${summary.quarantinedFileCount} executed=${summary.executedFileCount ?? 'n/a'} failed=${summary.failedFileCount ?? 'n/a'} report=${toPosixPath(path.relative(REPOSITORY_ROOT, reportPath))}`,
  );
}

/**
 * @param {PlaywrightE2eTierSummary} summary
 */
function appendGitHubSummary(summary) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  const lines = [
    '### Playwright E2E full tier',
    '',
    '| Discovered files | Selected files | Executed tests | Quarantined files | Failed tests | Status |',
    '| ---: | ---: | ---: | ---: | ---: | --- |',
    `| ${summary.discoveredFileCount} | ${summary.selectedFileCount} | ${summary.executedTestCount ?? 'n/a'} | ${summary.quarantinedFileCount} | ${summary.failedTestCount ?? 'n/a'} | ${summary.status} |`,
    '',
    `Other execution lanes: ${summary.laneExcludedFileCount} files. Skipped tests: ${summary.skippedTestCount ?? 'n/a'}. Flaky tests: ${summary.flakyTestCount ?? 'n/a'}. First-attempt failures: ${summary.firstAttemptFailureCount ?? 'n/a'}. Report errors: ${summary.reportErrorCount ?? 'n/a'}.`,
    '',
  ];

  if (summary.quarantinedFiles.length > 0) {
    lines.push('Quarantined files:', '');
    for (const quarantine of summary.quarantinedFiles) {
      const tracker = quarantine.trackingIssue
        ? ` ([#${quarantine.trackingIssue}](https://github.com/genfeedai/genfeed.ai/issues/${quarantine.trackingIssue}))`
        : quarantine.owner
          ? ` (${quarantine.owner})`
          : '';
      lines.push(
        `- \`${quarantine.file}\` — ${quarantine.reason}${tracker} — review by ${quarantine.reviewBy}`,
      );
    }
    lines.push('');
  }

  writeFileSync(summaryPath, `${lines.join('\n')}\n`, { flag: 'a' });
}

function parseShard(value) {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '');
  if (!match) {
    return null;
  }

  const index = Number(match[1]);
  const total = Number(match[2]);
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(total) ||
    index < 1 ||
    total < 1 ||
    index > total
  ) {
    return null;
  }

  return `${index}/${total}`;
}

function readShardFromEnv() {
  const combined = parseShard(process.env.E2E_SHARD);
  if (combined) {
    return combined;
  }

  const index = process.env.E2E_SHARD_INDEX;
  const total = process.env.E2E_TOTAL_SHARDS;
  if (!index || !total) {
    return null;
  }

  return parseShard(`${index}/${total}`);
}

function readPlaywrightReport(reportPath) {
  return JSON.parse(readFileSync(reportPath, 'utf8'));
}

function parseCliOptions(args) {
  const separatorIndex = args.indexOf('--');
  const ownArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  const playwrightArgs =
    separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);

  let tier = 'full';
  let listOnly = false;
  let summarize = false;
  let shard = null;
  let playwrightReportPath = null;
  let playwrightReportsDir = null;
  let statusOverride = null;

  for (const arg of ownArgs) {
    if (arg.startsWith('--tier=')) {
      tier = arg.slice('--tier='.length);
      if (!['core', 'full'].includes(tier))
        throw new Error(`Unsupported tier: ${tier}`);
      continue;
    }
    if (arg === '--list') {
      listOnly = true;
      continue;
    }
    if (arg === '--summarize') {
      summarize = true;
      continue;
    }
    if (arg.startsWith('--status=')) {
      statusOverride = arg.slice('--status='.length);
      if (!['failed', 'passed', 'planned'].includes(statusOverride)) {
        throw new Error(`Invalid status: ${arg}`);
      }
      continue;
    }
    if (arg.startsWith('--shard=')) {
      shard = parseShard(arg.slice('--shard='.length));
      if (!shard) {
        throw new Error(`Invalid shard: ${arg}`);
      }
      continue;
    }
    if (arg.startsWith('--playwright-report=')) {
      playwrightReportPath = arg.slice('--playwright-report='.length);
      continue;
    }
    if (arg.startsWith('--playwright-reports-dir=')) {
      playwrightReportsDir = arg.slice('--playwright-reports-dir='.length);
      continue;
    }
    playwrightArgs.push(arg);
  }

  if (
    tier === 'core' &&
    (summarize ||
      statusOverride ||
      playwrightReportPath ||
      playwrightReportsDir)
  ) {
    throw new Error('Report options require --tier=full');
  }

  return {
    tier,
    listOnly,
    playwrightArgs,
    playwrightReportPath,
    playwrightReportsDir,
    shard: shard ?? readShardFromEnv(),
    statusOverride,
    summarize,
  };
}

/**
 * @param {{
 *   playwrightReportPath?: string | null,
 *   playwrightReportsDir?: string | null,
 * }} options
 */
function loadPlaywrightReports(options) {
  /** @type {Array<{ stats?: { expected?: number, unexpected?: number }, suites?: unknown[] }>} */
  const reports = [];
  const reportPaths = [];

  if (options.playwrightReportPath) {
    reportPaths.push(options.playwrightReportPath);
  } else if (
    !options.playwrightReportsDir &&
    existsSync(PLAYWRIGHT_JSON_REPORT_PATH)
  ) {
    reportPaths.push(PLAYWRIGHT_JSON_REPORT_PATH);
  }

  const reportDirectories = [];
  if (options.playwrightReportsDir) {
    reportDirectories.push(options.playwrightReportsDir);
  }
  const defaultShardsDirectory = path.join(REPORT_DIRECTORY, 'shards');
  if (
    !options.playwrightReportPath &&
    !options.playwrightReportsDir &&
    existsSync(defaultShardsDirectory)
  ) {
    reportDirectories.push(defaultShardsDirectory);
  }

  for (const directory of reportDirectories) {
    reportPaths.push(...collectPlaywrightJsonReportPaths(directory));
  }

  const seen = new Set();
  for (const reportPath of reportPaths) {
    const absolutePath = path.isAbsolute(reportPath)
      ? reportPath
      : path.join(REPOSITORY_ROOT, reportPath);
    if (seen.has(absolutePath) || !existsSync(absolutePath)) {
      continue;
    }
    seen.add(absolutePath);

    const parsed = readPlaywrightReport(absolutePath);
    if (isPlaywrightJsonReport(parsed)) {
      reports.push(parsed);
    }
  }

  return reports;
}

export function getPlaywrightCorePaths(
  rootDir = REPOSITORY_ROOT,
  selectors = PLAYWRIGHT_E2E_CORE_PATHS,
) {
  for (const selector of selectors) {
    const absolutePath = path.join(rootDir, selector);
    const matches =
      existsSync(absolutePath) &&
      (statSync(absolutePath).isDirectory()
        ? collectSpecFiles(rootDir, selector).length > 0
        : statSync(absolutePath).isFile() && selector.endsWith('.spec.ts'));
    if (!matches)
      throw new Error(`Core selector matches no specs: ${selector}`);
  }
  if (selectors.length === 0) throw new Error('Core selectors cannot be empty');
  return selectors;
}

export function buildPlaywrightCoreArgs() {
  return [
    'playwright',
    'test',
    `--config=${PLAYWRIGHT_CONFIG}`,
    ...getPlaywrightCorePaths(),
    `--project=${PLAYWRIGHT_PROJECT}`,
  ];
}

function runPlaywrightFullTier(options) {
  if (options.tier === 'core') {
    const args = buildPlaywrightCoreArgs();
    if (options.shard) args.push(`--shard=${options.shard}`);
    if (options.listOnly) args.push('--list');
    args.push(...options.playwrightArgs);
    const result = spawnSync('bunx', args, {
      cwd: REPOSITORY_ROOT,
      env: process.env,
      stdio: 'inherit',
    });
    return result.status ?? 1;
  }
  const plan = buildPlaywrightE2eTierPlan();

  console.log(
    `[playwright-e2e] tier=${plan.tier} discovered=${plan.discoveredFiles.length} selected=${plan.selectedFiles.length} quarantined=${plan.quarantinedFiles.length}`,
  );
  for (const file of plan.selectedFiles) {
    console.log(`[playwright-e2e] selected ${file}`);
  }
  for (const quarantine of plan.quarantinedFiles) {
    const tracker = quarantine.trackingIssue
      ? `#${quarantine.trackingIssue}`
      : quarantine.owner;
    console.log(
      `[playwright-e2e] quarantined ${quarantine.file} (${tracker}, reviewBy ${quarantine.reviewBy}): ${quarantine.reason}`,
    );
  }

  if (options.listOnly) {
    writeSummary(
      buildPlaywrightE2eTierSummary({
        plan,
        status: 'planned',
      }),
    );
    return 0;
  }

  if (options.summarize) {
    const playwrightReports = loadPlaywrightReports(options);
    const merged = mergePlaywrightJsonReports(playwrightReports);
    const status =
      options.statusOverride ??
      (merged.executed > 0 && merged.failed === 0 && merged.errors === 0
        ? 'passed'
        : 'failed');
    const summary = buildPlaywrightE2eTierSummary({
      plan,
      playwrightReports,
      status,
    });
    writeSummary(summary);
    return summary.status === 'passed' || summary.status === 'planned' ? 0 : 1;
  }

  if (plan.selectedFiles.length === 0) {
    writeSummary(buildPlaywrightE2eTierSummary({ plan, status: 'failed' }));
    return 1;
  }

  const args = [
    'playwright',
    'test',
    `--config=${PLAYWRIGHT_CONFIG}`,
    `--project=${PLAYWRIGHT_PROJECT}`,
    ...plan.selectedFiles,
  ];
  if (options.shard) {
    args.push(`--shard=${options.shard}`);
  }
  args.push(...options.playwrightArgs);

  console.log(
    `[playwright-e2e] running ${PLAYWRIGHT_PROJECT} shard ${options.shard ?? 'all'}`,
  );

  const result = spawnSync('bunx', args, {
    cwd: REPOSITORY_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
  }
  if (result.signal) {
    console.error(`[playwright-e2e] terminated by signal ${result.signal}`);
  }

  return result.status ?? 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exit(runPlaywrightFullTier(parseCliOptions(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
