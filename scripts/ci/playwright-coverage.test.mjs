import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assessReadiness,
  enforceCoverage,
  loadPolicy,
  METRICS,
  mergeCoverage,
  readMergedEvidence,
  validatePolicy,
  validateSummary,
} from './playwright-coverage.mjs';

const metrics = (covered = 80) =>
  Object.fromEntries(
    METRICS.map((metric) => [metric, { total: 100, covered, pct: covered }]),
  );
const runs = () =>
  [2, 1].map((id) => ({
    id,
    event: 'schedule',
    head_branch: 'master',
    created_at: `2026-09-${id === 2 ? '21' : '14'}T06:00:00Z`,
    head_sha: `sha-${id}`,
    status: 'completed',
    conclusion: 'success',
  }));
const reports = () =>
  Object.fromEntries(
    runs().map((run) => [
      run.id,
      {
        version: 1,
        runId: run.id,
        sha: run.head_sha,
        event: 'schedule',
        branch: 'master',
        shards: [1, 2, 3, 4],
        lcovValid: true,
        metrics: metrics(),
      },
    ]),
  );
const enabled = () => ({
  ...loadPolicy(),
  mode: 'enforcement',
  thresholds: Object.fromEntries(METRICS.map((metric) => [metric, 79.5])),
  baseline: { runs: runs(), reports: reports(), prerequisiteState: 'closed' },
});

test('observation measures exact counts and does not pretend the target is enforced', () => {
  assert.doesNotThrow(() => validatePolicy(loadPolicy()));
  assert.equal(enforceCoverage(metrics(12), loadPolicy()).lines.pct, 12);
});

test('a valid two-run baseline proposes the lower measurement minus rounding margin', () => {
  const evidence = reports();
  evidence[1].metrics = metrics(72);
  const readiness = assessReadiness(runs(), evidence, 'closed');
  assert.equal(readiness.ready, true);
  assert.equal(readiness.proposedThresholds.lines, 71.5);
});

test('manual recoveries cannot replace a failed scheduled run', () => {
  const history = runs();
  history[0].conclusion = 'failure';
  history.unshift({
    ...history[0],
    id: 3,
    event: 'workflow_dispatch',
    conclusion: 'success',
  });
  assert.equal(assessReadiness(history, reports(), 'closed').ready, false);
});

test('an in-progress latest scheduled run cannot be skipped for an older green pair', () => {
  const history = [
    {
      ...runs()[0],
      id: 3,
      status: 'in_progress',
      conclusion: null,
      created_at: '2026-09-28T06:00:00Z',
    },
    ...runs(),
  ];
  assert.deepEqual(
    assessReadiness(history, reports(), 'closed').runIds,
    [3, 2],
  );
  assert.equal(assessReadiness(history, reports(), 'closed').ready, false);
});

test('missing artifacts, wrong SHA, incomplete shards, and open prerequisite block readiness', () => {
  assert.equal(assessReadiness(runs(), {}, 'closed').ready, false);
  const wrong = reports();
  wrong[2].sha = 'different';
  assert.equal(assessReadiness(runs(), wrong, 'closed').ready, false);
  const incomplete = reports();
  incomplete[2].shards = [1, 2, 3];
  assert.equal(assessReadiness(runs(), incomplete, 'closed').ready, false);
  assert.equal(assessReadiness(runs(), reports(), 'open').ready, false);
  assert.equal(
    assessReadiness([runs()[0], runs()[0]], reports(), 'closed').ready,
    false,
  );
});

test('empty, invalid, and contradictory metric counts fail closed', () => {
  assert.throws(() => validateSummary({}), /Invalid branches/);
  const empty = metrics();
  empty.lines = { total: 0, covered: 0 };
  assert.throws(() => validateSummary(empty), /Empty lines/);
  empty.lines = { total: 1, covered: 2 };
  assert.throws(() => validateSummary(empty), /Invalid lines/);
  empty.lines = { total: 3, covered: 2, pct: 100 };
  assert.equal(validateSummary(empty).lines.pct, 200 / 3);
});

test('enforcement fails on any of the four measured metrics', () => {
  for (const metric of METRICS) {
    const summary = metrics();
    summary[metric] = { total: 100, covered: 79 };
    assert.throws(
      () => enforceCoverage(summary, enabled()),
      new RegExp(metric),
    );
  }
  assert.doesNotThrow(() => enforceCoverage(metrics(80), enabled()));
});

test('threshold direction compares the base revision and requires an issue for decreases', () => {
  const before = enabled();
  const raised = structuredClone(before);
  raised.thresholds.lines = 80;
  assert.doesNotThrow(() => validatePolicy(raised, before));
  assert.throws(() => enforceCoverage(metrics(79), raised), /below threshold/);
  assert.doesNotThrow(() => enforceCoverage(metrics(80), raised));
  const lowered = structuredClone(before);
  lowered.thresholds.lines = 78;
  assert.throws(() => validatePolicy(lowered, before), /exceptionIssue/);
  lowered.exceptionIssue = 439;
  assert.doesNotThrow(() => validatePolicy(lowered, before));
  assert.throws(
    () => validatePolicy(loadPolicy(), before),
    /Disabling enforcement/,
  );
});

test('promotion cannot omit evidence or use an arbitrary initial threshold', () => {
  const policy = enabled();
  policy.baseline = null;
  assert.throws(() => validatePolicy(policy, loadPolicy()), /baseline reports/);
  policy.baseline = enabled().baseline;
  policy.thresholds.lines = 80;
  assert.throws(() => validatePolicy(policy, loadPolicy()), /rounding margin/);
});

test('merging rejects missing and empty shard data before loading the reporter', async () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'playwright-coverage-test-'),
  );
  try {
    await assert.rejects(
      mergeCoverage(directory, path.join(directory, 'output')),
      /Exactly four/,
    );
    for (let shard = 1; shard <= 4; shard++)
      mkdirSync(path.join(directory, `e2e-coverage-shard-${shard}`, 'raw'), {
        recursive: true,
      });
    await assert.rejects(
      mergeCoverage(directory, path.join(directory, 'output')),
      /Missing raw/,
    );
    for (let shard = 1; shard <= 4; shard++)
      writeFileSync(
        path.join(
          directory,
          `e2e-coverage-shard-${shard}`,
          'raw',
          'coverage-a.json',
        ),
        JSON.stringify({ type: 'v8', data: [] }),
      );
    await assert.rejects(
      mergeCoverage(directory, path.join(directory, 'output')),
      /Invalid raw/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('collection and workflow use merged enforcement and durable single-source policy', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/coverage.yml', import.meta.url),
    'utf8',
  );
  const config = readFileSync(
    new URL(
      '../../playwright/configs/playwright-coverage.config.ts',
      import.meta.url,
    ),
    'utf8',
  );
  assert.doesNotMatch(workflow + config, /E2E_COVERAGE_THRESHOLD|thresholds:/);
  assert.match(config, /\['raw'\]/);
  assert.match(workflow, /coverage-e2e-merge:/);
  assert.match(workflow, /node scripts\/ci\/playwright-coverage.mjs merge/);
  assert.match(workflow, /name: e2e-coverage-merged[\s\S]*?retention-days: 90/);
  assert.match(workflow, /- coverage-e2e-merge/);
  const readiness = readFileSync(
    new URL(
      '../../.github/workflows/playwright-coverage-policy.yml',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(readiness, /workflow_run:/);
  assert.match(readiness, /types: \[completed\]/);
  assert.match(readiness, /BASE_SHA:/);
});

test('baseline downloads require the actual LCOV and matching summary, not only a success flag', () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'playwright-evidence-test-'),
  );
  try {
    writeFileSync(
      path.join(directory, 'playwright-coverage-report.json'),
      JSON.stringify(reports()[1]),
    );
    writeFileSync(
      path.join(directory, 'coverage-summary.json'),
      JSON.stringify({ total: metrics() }),
    );
    assert.throws(() => readMergedEvidence(directory), /ENOENT/);
    writeFileSync(path.join(directory, 'lcov.info'), 'garbage');
    assert.throws(() => readMergedEvidence(directory), /LCOV/);
    writeFileSync(
      path.join(directory, 'lcov.info'),
      'SF:apps/app/example.ts\nDA:1,1\nend_of_record\n',
    );
    assert.equal(readMergedEvidence(directory).runId, 1);
    writeFileSync(
      path.join(directory, 'coverage-summary.json'),
      JSON.stringify({ total: metrics(50) }),
    );
    assert.throws(() => readMergedEvidence(directory), /does not match/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
