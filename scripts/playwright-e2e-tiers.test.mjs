import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PLAYWRIGHT_E2E_QUARANTINES } from './playwright-e2e-tiers.manifest.mjs';
import {
  buildPlaywrightE2eTierPlan,
  buildPlaywrightE2eTierSummary,
  collectPlaywrightJsonReportPaths,
  discoverPlaywrightSpecs,
  isPlaywrightJsonReport,
  mergePlaywrightJsonReports,
  PLAYWRIGHT_E2E_TIER_CONTRACT,
  validatePlaywrightE2eQuarantines,
} from './playwright-e2e-tiers.mjs';

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
      suites: [{ specs: [{ ok: true }, { ok: false }] }],
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
      { suites: [{ specs: [{ ok: true }, { ok: false }] }] },
      {
        stats: { expected: 4, unexpected: 3 },
        suites: [{ specs: [{ ok: true }, { ok: true }, { ok: false }] }],
      },
    ],
    status: 'failed',
  });

  assert.equal(summary.executedFileCount, 5);
  assert.equal(summary.failedFileCount, 2);
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
    { suites: [{ specs: [{ ok: false }] }] },
    { stats: { expected: 2, unexpected: 1 }, suites: [] },
  ]);

  assert.equal(merged.executed, 4);
  assert.equal(merged.failed, 2);
});
