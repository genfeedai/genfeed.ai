#!/usr/bin/env node
// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: standalone Actions helper runs outside Turborepo
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const METRICS = ['branches', 'functions', 'lines', 'statements'];
const POLICY_PATH = fileURLToPath(
  new URL('./playwright-coverage.baseline.json', import.meta.url),
);
export const loadPolicy = () => JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function validatePolicy(policy, previous = null) {
  if (
    policy.version !== 1 ||
    !['observation', 'enforcement'].includes(policy.mode)
  )
    throw new Error('Invalid Playwright coverage policy');
  if (
    policy.readiness?.requiredScheduledRuns !== 2 ||
    policy.readiness?.prerequisiteIssue !== 1829
  )
    throw new Error('Scheduled coverage prerequisites must be preserved');
  if (
    !Number.isFinite(policy.roundingMarginPercentagePoints) ||
    policy.roundingMarginPercentagePoints < 0 ||
    policy.roundingMarginPercentagePoints > 1
  )
    throw new Error('Invalid rounding margin');
  if (
    Object.keys(policy.thresholds ?? {})
      .sort()
      .join() !== [...METRICS].sort().join()
  )
    throw new Error('Exactly four coverage thresholds are required');
  const exception =
    Number.isSafeInteger(policy.exceptionIssue) && policy.exceptionIssue > 0;
  if (
    previous?.mode === 'enforcement' &&
    policy.mode !== 'enforcement' &&
    !exception
  )
    throw new Error(
      'Disabling enforcement requires an explicit exceptionIssue',
    );
  for (const metric of METRICS) {
    const threshold = policy.thresholds[metric];
    if (policy.mode === 'observation' && threshold !== null)
      throw new Error('Observation thresholds must remain null');
    if (
      policy.mode === 'enforcement' &&
      (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)
    )
      throw new Error(`Invalid ${metric} threshold`);
    const before = previous?.thresholds?.[metric];
    if (
      before !== null &&
      before !== undefined &&
      (threshold === null || threshold < before) &&
      !exception
    )
      throw new Error(`Lowering ${metric} requires an explicit exceptionIssue`);
  }
  if (policy.mode === 'enforcement') {
    const evidence = policy.baseline;
    if (
      !evidence ||
      !assessReadiness(
        evidence.runs,
        evidence.reports,
        evidence.prerequisiteState,
        policy,
      ).ready
    )
      throw new Error(
        'Enforcement requires two qualifying scheduled baseline reports',
      );
    if (previous && previous.mode !== 'enforcement') {
      const proposed = assessReadiness(
        evidence.runs,
        evidence.reports,
        evidence.prerequisiteState,
        policy,
      ).proposedThresholds;
      for (const metric of METRICS) {
        if (policy.thresholds[metric] !== proposed[metric])
          throw new Error(
            `Initial ${metric} threshold must match the measured baseline and rounding margin`,
          );
      }
    }
  }
  return policy;
}

export function validateSummary(summary) {
  for (const metric of METRICS) {
    const value = summary?.[metric];
    if (
      !value ||
      !Number.isSafeInteger(value.total) ||
      !Number.isSafeInteger(value.covered) ||
      value.total < 0 ||
      value.covered < 0 ||
      value.covered > value.total
    )
      throw new Error(`Invalid ${metric} coverage counts`);
    if (['lines', 'statements'].includes(metric) && value.total === 0)
      throw new Error(`Empty ${metric} coverage`);
  }
  return Object.fromEntries(
    METRICS.map((metric) => {
      const { total, covered } = summary[metric];
      return [
        metric,
        { total, covered, pct: total === 0 ? 100 : (100 * covered) / total },
      ];
    }),
  );
}

export function enforceCoverage(summary, policy) {
  validatePolicy(policy);
  const metrics = validateSummary(summary);
  const failures =
    policy.mode === 'observation'
      ? []
      : METRICS.filter(
          (metric) => metrics[metric].pct < policy.thresholds[metric],
        );
  if (failures.length)
    throw new Error(
      `Playwright coverage below threshold: ${failures.map((metric) => `${metric} ${metrics[metric].pct.toFixed(2)}% < ${policy.thresholds[metric]}%`).join(', ')}`,
    );
  return metrics;
}

export function assessReadiness(
  runs = [],
  reports = {},
  prerequisiteState,
  policy = loadPolicy(),
) {
  const scheduled = runs
    .filter((run) => run.event === 'schedule' && run.head_branch === 'master')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const latest = scheduled.slice(0, 2);
  const blockers = [];
  if (prerequisiteState !== 'closed') blockers.push('#1829 is not closed');
  if (latest.length !== 2 || new Set(latest.map((run) => run.id)).size !== 2)
    blockers.push('Two distinct scheduled master runs are required');
  const measurements = [];
  for (const run of latest) {
    if (run.status !== 'completed' || run.conclusion !== 'success')
      blockers.push(`Scheduled run ${run.id} is not completed green`);
    const report = reports[run.id];
    try {
      if (
        report?.version !== 1 ||
        report.runId !== run.id ||
        report.sha !== run.head_sha ||
        report.event !== 'schedule' ||
        report.branch !== 'master' ||
        report.shards?.join() !== '1,2,3,4' ||
        report.lcovValid !== true
      )
        throw new Error('Missing or mismatched merged artifact');
      measurements.push(validateSummary(report.metrics));
    } catch (error) {
      blockers.push(`Run ${run.id}: ${error.message}`);
    }
  }
  const ready = blockers.length === 0;
  const proposedThresholds = ready
    ? Object.fromEntries(
        METRICS.map((metric) => [
          metric,
          Math.max(
            0,
            Math.floor(
              (Math.min(...measurements.map((summary) => summary[metric].pct)) -
                policy.roundingMarginPercentagePoints) *
                100,
            ) / 100,
          ),
        ]),
      )
    : null;
  return {
    ready,
    blockers,
    runIds: latest.map((run) => run.id),
    proposedThresholds,
  };
}

export async function mergeCoverage(
  inputRoot,
  outputDir,
  policy = loadPolicy(),
) {
  validatePolicy(policy);
  const expected = [1, 2, 3, 4].map((shard) => `e2e-coverage-shard-${shard}`);
  if (readdirSync(inputRoot).sort().join() !== [...expected].sort().join())
    throw new Error(
      'Exactly four named Playwright shard artifacts are required',
    );
  const inputDir = expected.map((name) => {
    const directory = path.join(inputRoot, name, 'raw');
    const files = readdirSync(directory);
    const coverageFiles = files.filter((file) =>
      /^coverage-.*\.json$/.test(file),
    );
    if (!coverageFiles.length)
      throw new Error(`Missing raw coverage in ${name}`);
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      const data = readJson(path.join(directory, file));
      if (
        file.startsWith('coverage-') &&
        (data.type !== 'v8' ||
          !Array.isArray(data.data) ||
          data.data.length === 0)
      )
        throw new Error(`Invalid raw V8 coverage: ${name}/${file}`);
    }
    return directory;
  });
  const { CoverageReport } = await import('monocart-coverage-reports');
  const reporter = new CoverageReport({
    inputDir,
    outputDir,
    sourceFilter: (sourcePath) =>
      /(?:apps\/app\/|packages\/)(?!.*node_modules)/.test(sourcePath) &&
      !sourcePath.includes('.next/'),
    reports: [['json-summary'], ['lcovonly', { file: 'lcov.info' }]],
  });
  const generated = await reporter.generate();
  if (!generated) throw new Error('No merged Playwright coverage generated');
  const summary = readJson(path.join(outputDir, 'coverage-summary.json'));
  const metrics = validateSummary(summary.total);
  const lcov = readFileSync(path.join(outputDir, 'lcov.info'), 'utf8');
  if (
    !/^SF:.+/m.test(lcov) ||
    !/^DA:\d+,\d+/m.test(lcov) ||
    !/^end_of_record$/m.test(lcov)
  )
    throw new Error('Merged LCOV contains no executable source records');
  const report = {
    version: 1,
    runId: Number(process.env.GITHUB_RUN_ID) || null,
    sha: process.env.GITHUB_SHA ?? null,
    event: process.env.GITHUB_EVENT_NAME ?? null,
    branch: process.env.GITHUB_REF_NAME ?? null,
    shards: [1, 2, 3, 4],
    lcovValid: true,
    metrics,
    uncoveredFiles: Object.entries(summary)
      .filter(([file]) => file !== 'total')
      .map(([file, value]) => ({
        file,
        uncoveredLines: value.lines.total - value.lines.covered,
      }))
      .sort((a, b) => b.uncoveredLines - a.uncoveredLines)
      .slice(0, 20),
  };
  writeFileSync(
    path.join(outputDir, 'playwright-coverage-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log('Merged Playwright coverage (Istanbul executable source counts)');
  console.table(
    Object.fromEntries(
      METRICS.map((metric) => [
        metric,
        { ...metrics[metric], pct: metrics[metric].pct.toFixed(2) },
      ]),
    ),
  );
  enforceCoverage(metrics, policy);
  return report;
}

export function readMergedEvidence(directory) {
  const report = readJson(
    path.join(directory, 'playwright-coverage-report.json'),
  );
  const summary = readJson(path.join(directory, 'coverage-summary.json'));
  const lcov = readFileSync(path.join(directory, 'lcov.info'), 'utf8');
  if (
    !/^SF:.+/m.test(lcov) ||
    !/^DA:\d+,\d+/m.test(lcov) ||
    !/^end_of_record$/m.test(lcov)
  )
    throw new Error('Missing executable LCOV artifact');
  if (
    JSON.stringify(validateSummary(summary.total)) !==
    JSON.stringify(validateSummary(report.metrics))
  )
    throw new Error('Merged summary does not match evidence metrics');
  return report;
}

async function api(endpoint) {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    },
  );
  if (!response.ok)
    throw new Error(`GitHub API ${endpoint}: ${response.status}`);
  return response.json();
}

export async function collectReadiness(outputDir) {
  const policy = loadPolicy();
  const { workflow_runs: runs } = await api(
    'actions/workflows/coverage.yml/runs?event=schedule&branch=master&per_page=2',
  );
  const prerequisite = await api('issues/1829');
  const reports = {};
  const artifactErrors = [];
  const directory = mkdtempSync(
    path.join(tmpdir(), 'playwright-coverage-evidence-'),
  );
  try {
    for (const run of runs) {
      if (run.status !== 'completed' || run.conclusion !== 'success') continue;
      try {
        const target = path.join(directory, String(run.id));
        execFileSync(
          'gh',
          [
            'run',
            'download',
            String(run.id),
            '--repo',
            process.env.GITHUB_REPOSITORY,
            '--name',
            policy.readiness.artifactName,
            '--dir',
            target,
          ],
          { stdio: 'pipe' },
        );
        reports[run.id] = readMergedEvidence(target);
      } catch (error) {
        artifactErrors.push(`Run ${run.id}: ${error.message}`);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const result = {
    ...assessReadiness(runs, reports, prerequisite.state, policy),
    runs,
    reports,
    prerequisiteState: prerequisite.state,
    artifactErrors,
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, 'playwright-coverage-readiness.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  const message = result.ready
    ? `Playwright baseline ready. Proposed thresholds: ${JSON.stringify(result.proposedThresholds)}. Promotion still requires a reviewed policy change.`
    : `Playwright baseline remains in observation:\n${result.blockers.map((reason) => `- ${reason}`).join('\n')}`;
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`, {
      flag: 'a',
    });
  return result;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'merge') await mergeCoverage(args[0], args[1]);
  else if (command === 'readiness') await collectReadiness(args[0]);
  else if (command === 'validate') {
    const previous = args[0] && existsSync(args[0]) ? readJson(args[0]) : null;
    validatePolicy(loadPolicy(), previous);
    if (loadPolicy().mode === 'enforcement') {
      const evidence = await collectReadiness(
        args[1] ?? '.playwright-coverage-readiness',
      );
      if (!evidence.ready)
        throw new Error('Live scheduled evidence does not permit enforcement');
      if (
        evidence.runIds.join() !==
        loadPolicy()
          .baseline.runs.map((run) => run.id)
          .join()
      )
        throw new Error(
          'Baseline must match the latest qualifying scheduled runs',
        );
      for (const id of evidence.runIds) {
        if (
          JSON.stringify(validateSummary(evidence.reports[id].metrics)) !==
          JSON.stringify(
            validateSummary(loadPolicy().baseline.reports[id].metrics),
          )
        )
          throw new Error(
            'Committed baseline metrics must match live artifacts',
          );
      }
    }
  } else
    throw new Error(
      'Usage: playwright-coverage.mjs merge <shards> <output> | readiness <output> | validate [previous-policy]',
    );
}
