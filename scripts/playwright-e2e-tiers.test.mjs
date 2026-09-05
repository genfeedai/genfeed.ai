import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { fileURLToPath } from 'node:url';
import {
  PLAYWRIGHT_E2E_LANE_EXCLUSIONS,
  PLAYWRIGHT_E2E_QUARANTINES,
} from './playwright-e2e-tiers.manifest.mjs';
import {
  buildPlaywrightCoreArgs,
  buildPlaywrightE2eTierPlan,
  buildPlaywrightE2eTierSummary,
  collectPlaywrightJsonReportPaths,
  discoverPlaywrightSpecs,
  getPlaywrightCorePaths,
  isPlaywrightJsonReport,
  mergePlaywrightJsonReports,
  PLAYWRIGHT_E2E_TIER_CONTRACT,
  validatePlaywrightE2eQuarantines,
} from './playwright-e2e-tiers.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const testDirectories = [];

test.afterEach(() => {
  for (const directory of testDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

/**
 * @param {string[]} files
 */
function createFixture(files) {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'playwright-e2e-tiers-'));
  testDirectories.push(rootDir);
  for (const file of files) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, "test('fixture', async () => {});\n");
  }
  return rootDir;
}

test('canonical contract names core, authed, and full', () => {
  assert.deepEqual(PLAYWRIGHT_E2E_TIER_CONTRACT.tiers, [
    'core',
    'authed',
    'full',
  ]);
  assert.equal(PLAYWRIGHT_E2E_TIER_CONTRACT.scripts.core, 'test:e2e:core');
  assert.equal(PLAYWRIGHT_E2E_TIER_CONTRACT.scripts.authed, 'test:e2e:authed');
  assert.equal(PLAYWRIGHT_E2E_TIER_CONTRACT.scripts.full, 'test:e2e:full');
  assert.equal(
    PLAYWRIGHT_E2E_TIER_CONTRACT.configs.full,
    'playwright/configs/playwright.config.ts',
  );
});

test('discovers every spec recursively and ignores support files', () => {
  const rootDir = createFixture([
    'playwright/e2e/tests/smoke/safe.spec.ts',
    'playwright/e2e/tests/core/helper.ts',
    'playwright/e2e/tests/nested/deep.spec.ts',
    'playwright/e2e/pages/login.page.ts',
  ]);

  assert.deepEqual(discoverPlaywrightSpecs(rootDir), [
    'playwright/e2e/tests/nested/deep.spec.ts',
    'playwright/e2e/tests/smoke/safe.spec.ts',
  ]);
});

test('full tier selects every discovered spec except quarantines', () => {
  const files = [
    'playwright/e2e/tests/core/shell.spec.ts',
    'playwright/e2e/tests/new-area.spec.ts',
    'playwright/e2e/tests/website/home.spec.ts',
  ];
  const rootDir = createFixture(files);
  const quarantines = [
    {
      file: 'playwright/e2e/tests/website/home.spec.ts',
      reason: 'Requires the website server, not mocked app-core.',
      trackingIssue: 71,
      reviewBy: '2026-11-14',
    },
  ];

  const plan = buildPlaywrightE2eTierPlan({
    quarantines,
    laneExclusions: [],
    rootDir,
    now: new Date('2026-08-14T00:00:00Z'),
  });

  assert.deepEqual(plan.discoveredFiles, files);
  assert.deepEqual(plan.selectedFiles, [
    'playwright/e2e/tests/core/shell.spec.ts',
    'playwright/e2e/tests/new-area.spec.ts',
  ]);
  assert.equal(plan.quarantinedFiles.length, 1);
  assert.equal(plan.tier, 'full');
});

test('requires reason, owner or tracking issue, and review date', () => {
  const file = 'playwright/e2e/tests/website/home.spec.ts';
  assert.deepEqual(
    validatePlaywrightE2eQuarantines(
      [file],
      [
        {
          file,
          reason: ' ',
          reviewBy: 'not-a-date',
        },
      ],
      new Date('2026-08-14T00:00:00Z'),
    ),
    [
      `Quarantine has no reason: ${file}`,
      `Quarantine has no owner or tracking issue: ${file}`,
      `Quarantine has no review date: ${file}`,
    ],
  );
});

test('fails when a quarantine is missing, duplicated, or expired', () => {
  const file = 'playwright/e2e/tests/website/home.spec.ts';
  assert.deepEqual(
    validatePlaywrightE2eQuarantines(
      ['playwright/e2e/tests/core/shell.spec.ts'],
      [
        {
          file,
          reason: 'Pending.',
          trackingIssue: 71,
          reviewBy: '2026-08-01',
        },
        {
          file,
          reason: 'Pending.',
          trackingIssue: 71,
          reviewBy: '2026-08-01',
        },
      ],
      new Date('2026-08-14T00:00:00Z'),
    ),
    [
      `Duplicate quarantines: ${file}`,
      `Quarantined file is not discoverable: ${file}`,
      `Quarantine expired: ${file} (reviewBy 2026-08-01)`,
    ],
  );
});

test('repository quarantines stay discoverable, owned, and unexpired', () => {
  assert.deepEqual(
    validatePlaywrightE2eQuarantines(
      discoverPlaywrightSpecs(),
      PLAYWRIGHT_E2E_QUARANTINES,
      new Date('2026-08-14T00:00:00Z'),
    ),
    [],
  );
});

test('summary records discovered, executed, and quarantined inventory', () => {
  const summary = buildPlaywrightE2eTierSummary({
    plan: {
      discoveredFiles: ['a.spec.ts', 'b.spec.ts', 'c.spec.ts'],
      quarantinedFiles: [
        {
          file: 'c.spec.ts',
          reason: 'Cross-app.',
          trackingIssue: 71,
          reviewBy: '2026-11-14',
        },
      ],
      selectedFiles: ['a.spec.ts', 'b.spec.ts'],
      tier: 'full',
    },
    playwrightReport: {
      suites: [
        {
          specs: [
            {
              file: 'a.spec.ts',
              tests: [{ status: 'expected', results: [{ status: 'passed' }] }],
            },
            {
              file: 'b.spec.ts',
              tests: [
                { status: 'unexpected', results: [{ status: 'failed' }] },
              ],
            },
          ],
        },
      ],
    },
    status: 'failed',
  });

  assert.equal(summary.tier, 'full');
  assert.equal(summary.discoveredFileCount, 3);
  assert.equal(summary.selectedFileCount, 2);
  assert.equal(summary.quarantinedFileCount, 1);
  assert.equal(summary.executedFileCount, 2);
  assert.equal(summary.failedFileCount, 1);
  assert.equal(summary.status, 'failed');
});

test('summary without a Playwright report leaves executed as n/a', () => {
  const summary = buildPlaywrightE2eTierSummary({
    plan: {
      discoveredFiles: ['a.spec.ts'],
      quarantinedFiles: [],
      selectedFiles: ['a.spec.ts'],
      tier: 'full',
    },
    status: 'failed',
  });

  assert.equal(summary.executedFileCount, null);
  assert.equal(summary.failedFileCount, null);
});

test('summary merges shard JSON reports instead of the first missing report', () => {
  const summary = buildPlaywrightE2eTierSummary({
    plan: {
      discoveredFiles: ['a.spec.ts', 'b.spec.ts'],
      quarantinedFiles: [],
      selectedFiles: ['a.spec.ts', 'b.spec.ts'],
      tier: 'full',
    },
    playwrightReports: [
      {
        suites: [
          {
            specs: [
              {
                file: 'a.spec.ts',
                tests: [
                  { status: 'expected', results: [{ status: 'passed' }] },
                ],
              },
              {
                file: 'b.spec.ts',
                tests: [
                  { status: 'unexpected', results: [{ status: 'failed' }] },
                ],
              },
            ],
          },
        ],
      },
      {
        stats: { expected: 4, unexpected: 3 },
        suites: [
          {
            specs: [
              {
                file: 'a.spec.ts',
                tests: [
                  { status: 'expected', results: [{ status: 'passed' }] },
                ],
              },
              {
                file: 'a.spec.ts',
                tests: [
                  { status: 'expected', results: [{ status: 'passed' }] },
                ],
              },
              {
                file: 'b.spec.ts',
                tests: [
                  { status: 'unexpected', results: [{ status: 'failed' }] },
                ],
              },
            ],
          },
        ],
      },
    ],
    status: 'failed',
  });

  assert.equal(summary.executedTestCount, 5);
  assert.equal(summary.executedFileCount, 2);
  assert.equal(summary.failedTestCount, 2);
  assert.equal(summary.failedFileCount, 1);
});

test('collects nested Playwright JSON report paths', () => {
  const rootDir = createFixture([]);
  const shardOne = path.join(rootDir, 'shards', '1', 'results.json');
  const shardTwo = path.join(rootDir, 'shards', '2', 'results.json');
  mkdirSync(path.dirname(shardOne), { recursive: true });
  mkdirSync(path.dirname(shardTwo), { recursive: true });
  writeFileSync(shardOne, '{}\n');
  writeFileSync(shardTwo, '{}\n');

  assert.deepEqual(
    collectPlaywrightJsonReportPaths(path.join(rootDir, 'shards')),
    [shardOne, shardTwo],
  );
});

test('ignores inventory JSON that is not a Playwright report', () => {
  assert.equal(isPlaywrightJsonReport({ discoveredFileCount: 111 }), false);
  assert.equal(isPlaywrightJsonReport({ suites: [] }), true);
  assert.equal(isPlaywrightJsonReport({ stats: { unexpected: 2 } }), true);
});

test('mergePlaywrightJsonReports prefers walked specs over empty stats', () => {
  const merged = mergePlaywrightJsonReports([
    {
      suites: [
        {
          specs: [
            {
              file: 'b.spec.ts',
              tests: [
                { status: 'unexpected', results: [{ status: 'failed' }] },
              ],
            },
          ],
        },
      ],
    },
    { stats: { expected: 2, unexpected: 1 }, suites: [] },
  ]);

  assert.equal(merged.executed, 4);
  assert.equal(merged.failed, 2);
});

test('core CLI and sharding consume the same canonical selectors', () => {
  const args = buildPlaywrightCoreArgs();
  assert.ok(
    args.includes('playwright/e2e/tests/shell/page-context-contract.spec.ts'),
  );
  assert.ok(args.includes('playwright/e2e/tests/studio/clips.spec.ts'));
  assert.ok(args.includes('--project=app-core'));
});

test('execution counts projects and retries without counting skipped tests as executed', () => {
  const report = {
    suites: [
      {
        file: 'a.spec.ts',
        specs: [
          {
            file: 'a.spec.ts',
            tests: [
              {
                status: 'expected',
                expectedStatus: 'passed',
                results: [{ status: 'passed' }],
              },
              {
                status: 'flaky',
                expectedStatus: 'passed',
                results: [{ status: 'failed' }, { status: 'passed' }],
              },
              { status: 'skipped', results: [{ status: 'skipped' }] },
              {
                status: 'unexpected',
                expectedStatus: 'passed',
                results: [{ status: 'timedOut' }],
              },
            ],
          },
        ],
      },
    ],
    errors: [{ message: 'global teardown failed' }],
  };
  const result = mergePlaywrightJsonReports([report]);
  assert.equal(result.executed, 3);
  assert.equal(result.failed, 1);
  assert.equal(result.executedFileCount, 1);
  assert.equal(result.failedFileCount, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.flaky, 1);
  assert.equal(result.firstAttemptFailures, 2);
  assert.equal(result.errors, 1);
});

test('a passed override cannot turn missing or empty execution evidence green', () => {
  const plan = {
    discoveredFiles: ['a.spec.ts'],
    selectedFiles: ['a.spec.ts'],
    quarantinedFiles: [],
    tier: 'full',
  };
  for (const playwrightReports of [
    [],
    [{ suites: [], stats: { expected: 0 } }],
  ]) {
    assert.equal(
      buildPlaywrightE2eTierSummary({
        plan,
        playwrightReports,
        status: 'passed',
      }).status,
      'failed',
    );
  }
});

test('repository plan separates other execution lanes from broken-test quarantine', () => {
  const plan = buildPlaywrightE2eTierPlan();
  assert.equal(
    plan.laneExcludedFiles.length,
    PLAYWRIGHT_E2E_LANE_EXCLUSIONS.length,
  );
  assert.equal(plan.quarantinedFiles.length, PLAYWRIGHT_E2E_QUARANTINES.length);
  assert.equal(
    plan.discoveredFiles.length,
    plan.selectedFiles.length +
      plan.laneExcludedFiles.length +
      plan.quarantinedFiles.length,
  );
  assert.ok(plan.laneExcludedFiles.some(({ lane }) => lane === 'authed'));
  assert.ok(
    plan.quarantinedFiles.some(({ file }) => file.includes('/visual/')),
  );
});

test('core CLI and CI shard runner launch identical selectors with independent shard args', () => {
  const rootDir = createFixture([]);
  writeFileSync(
    path.join(rootDir, 'bunx'),
    '#!/bin/sh\nprintf "%s\\n" "$@"\n',
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    E2E_SHARD: '',
    E2E_SHARD_INDEX: '',
    E2E_TOTAL_SHARDS: '',
    PATH: `${rootDir}:${process.env.PATH}`,
  };
  const core = spawnSync(
    process.execPath,
    ['scripts/playwright-e2e-tiers.mjs', '--tier=core'],
    { encoding: 'utf8', env, cwd: REPOSITORY_ROOT },
  );
  const sharded = spawnSync(
    process.execPath,
    ['scripts/e2e-sharded.mjs', '--shard=1/4'],
    { encoding: 'utf8', env, cwd: REPOSITORY_ROOT },
  );
  assert.equal(core.status, 0, core.stderr);
  assert.equal(sharded.status, 0, sharded.stderr);
  assert.deepEqual(
    sharded.stdout
      .trim()
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith('[e2e-sharded]') && !line.startsWith('--shard='),
      ),
    core.stdout.trim().split('\n'),
  );
});

test('stats-only reports cannot invent executed file counts or hide flaky cases', () => {
  const result = mergePlaywrightJsonReports([
    { stats: { expected: 2, flaky: 1, unexpected: 1, skipped: 4 } },
  ]);
  assert.equal(result.executed, 4);
  assert.equal(result.executedFileCount, null);
  assert.equal(result.skipped, 4);
  assert.equal(result.flaky, 1);
});

test('required E2E gate rejects skipped and cancelled evidence as well as failures', () => {
  const workflow = readFileSync(
    path.join(REPOSITORY_ROOT, '.github/workflows/e2e.yml'),
    'utf8',
  );
  const gate = workflow.match(/^ {2}e2e-gate:\n((?: {4}.*(?:\n|$)|\n)+)/m);
  assert.ok(gate, 'required E2E gate must exist');
  const runBlock = gate[1].match(/^ {8}run: \|\n((?: {10}.*(?:\n|$)|\n)+)/m);
  assert.ok(runBlock, 'required E2E gate must provide its shell check');
  const script = runBlock[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
  const jobs = ['e2e-route-coverage', 'e2e-frontend', 'e2e-api'];
  function run(results) {
    const resolved = script.replace(
      /\$\{\{ needs\.([a-z0-9-]+)\.result \}\}/g,
      (_, job) => results[job],
    );
    return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', resolved], {
      encoding: 'utf8',
    });
  }
  const success = Object.fromEntries(jobs.map((job) => [job, 'success']));
  assert.equal(run(success).status, 0);
  for (const job of jobs) {
    for (const result of ['failure', 'cancelled', 'skipped']) {
      assert.equal(
        run({ ...success, [job]: result }).status,
        1,
        `${job}: ${result}`,
      );
    }
  }
});

test('core selectors fail closed after a renamed spec or emptied directory', () => {
  const rootDir = createFixture(['playwright/e2e/tests/core/example.spec.ts']);
  assert.deepEqual(
    getPlaywrightCorePaths(rootDir, ['playwright/e2e/tests/core']),
    ['playwright/e2e/tests/core'],
  );
  assert.throws(
    () =>
      getPlaywrightCorePaths(rootDir, ['playwright/e2e/tests/renamed.spec.ts']),
    /Core selector matches no specs/,
  );
  mkdirSync(path.join(rootDir, 'playwright/e2e/tests/empty'));
  assert.throws(
    () => getPlaywrightCorePaths(rootDir, ['playwright/e2e/tests/empty']),
    /Core selector matches no specs/,
  );
});

test('core runner rejects options that only apply to full-tier reports', () => {
  for (const option of [
    '--summarize',
    '--status=passed',
    '--playwright-report=missing.json',
    '--playwright-reports-dir=missing',
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(REPOSITORY_ROOT, 'scripts/playwright-e2e-tiers.mjs'),
        '--tier=core',
        option,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1, option);
    assert.match(result.stderr, /Report options require --tier=full/);
  }
});
