import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  aggregateNightlyUnitMatrix,
  buildNightlyUnitMatrixPlan,
  formatNightlyUnitMatrixSummary,
  type NightlyUnitMatrixJob,
} from './nightly-unit-matrix';
import type {
  NightlyTestInventoryResult,
  NightlyTestWorkspace,
} from './nightly-test-workspace-inventory';

const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('nightly unit matrix', () => {
  it('plans every standard workspace once and app/API workspaces in four shards', () => {
    const plan = buildNightlyUnitMatrixPlan(inventory(), SHA);

    expect(plan.entries).toHaveLength(10);
    expect(
      plan.entries
        .filter((entry) => entry.path === 'apps/app')
        .map((entry) => entry.shard),
    ).toEqual([1, 2, 3, 4]);
    expect(
      plan.entries
        .filter((entry) => entry.path === 'apps/server/api')
        .map((entry) => entry.shard),
    ).toEqual([1, 2, 3, 4]);
    expect(
      plan.entries.find((entry) => entry.path === 'packages/helpers'),
    ).toMatchObject({
      executionId: 'package--packages-helpers',
      shard: 1,
      shardCount: 1,
    });
  });

  it('rejects an invalid immutable SHA and inventory violations', () => {
    expect(() => buildNightlyUnitMatrixPlan(inventory(), 'master')).toThrow(
      /full 40-character SHA/,
    );
    expect(() =>
      buildNightlyUnitMatrixPlan(
        {
          ...inventory(),
          violations: [
            {
              kind: 'invalid-command',
              message: 'invalid',
              path: 'packages/helpers',
            },
          ],
        },
        SHA,
      ),
    ).toThrow(/1 violation/);
    expect(() =>
      buildNightlyUnitMatrixPlan(
        {
          ...inventory(),
          summary: {
            ...inventory().summary,
            byClass: {
              api: 0,
              app: 0,
              client: 0,
              extension: 0,
              package: 0,
              'server-service': 0,
            },
            executableWorkspaces: 0,
          },
          workspaces: [],
        },
        SHA,
      ),
    ).toThrow(/at least one executable workspace/);
  });

  it('aggregates a complete green matrix by workspace class', () => {
    const plan = buildNightlyUnitMatrixPlan(inventory(), SHA);
    const summary = aggregateNightlyUnitMatrix(plan, jobsForPlan(plan));

    expect(summary.passed).toBe(true);
    expect(summary.violations).toEqual([]);
    expect(summary.byClass.app).toMatchObject({
      blocked: 0,
      executable: 1,
      executed: 1,
      passed: 1,
    });
    expect(summary.byClass.package).toMatchObject({
      discovered: 2,
      excluded: 1,
      executable: 1,
      executed: 1,
      passed: 1,
    });
    expect(formatNightlyUnitMatrixSummary(summary)).toContain(
      '| package | 2 | 1 | 1 | 1 | 0 | 0 | 0 | 1 |',
    );
  });

  it.each([
    ['failure', 'failed'],
    ['cancelled', 'blocked'],
    ['skipped', 'skipped'],
  ] as const)(
    'fails closed when one execution concludes %s',
    (conclusion, expectedOutcome) => {
      const plan = buildNightlyUnitMatrixPlan(inventory(), SHA);
      const jobs = jobsForPlan(plan);
      jobs[0] = { ...jobs[0], conclusion };

      const summary = aggregateNightlyUnitMatrix(plan, jobs);

      expect(summary.passed).toBe(false);
      expect(summary.workspaces[0].outcome).toBe(expectedOutcome);
      expect(formatNightlyUnitMatrixSummary(summary)).toContain(
        '`apps/app`',
      );
    },
  );

  it('fails closed on missing and duplicate current-run job evidence', () => {
    const plan = buildNightlyUnitMatrixPlan(inventory(), SHA);
    const completeJobs = jobsForPlan(plan);
    const missingSummary = aggregateNightlyUnitMatrix(
      plan,
      completeJobs.slice(1),
    );
    const duplicateSummary = aggregateNightlyUnitMatrix(plan, [
      ...completeJobs,
      completeJobs[0],
    ]);

    expect(missingSummary.passed).toBe(false);
    expect(missingSummary.violations[0]).toMatch(/Missing job evidence/);
    expect(duplicateSummary.passed).toBe(false);
    expect(duplicateSummary.violations[0]).toMatch(/Duplicate job evidence/);
  });

  it('keeps the scheduled workflow isolated and fail-closed', () => {
    const workflowPath = fileURLToPath(
      new URL('../../.github/workflows/nightly-unit-matrix.yml', import.meta.url),
    );
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(/^name: Nightly Unit Matrix$/m);
    expect(workflow).toMatch(/^  schedule:\n {4}- cron:/m);
    expect(workflow).toMatch(/^  workflow_dispatch:$/m);
    expect(workflow).toMatch(
      /^  group: nightly-unit-matrix-\$\{\{ github\.ref \}\}$/m,
    );
    expect(workflow).toMatch(/^  cancel-in-progress: false$/m);
    expect(workflow).toMatch(/ref: \$\{\{ needs\.plan\.outputs\.sha \}\}/);
    expect(workflow).toMatch(
      /matrix: \$\{\{ fromJSON\(needs\.plan\.outputs\.matrix\) \}\}/,
    );
    expect(workflow).toMatch(/^ {6}max-parallel: 12$/m);
    expect(workflow).toMatch(/^ {4}name: Nightly Unit Matrix Aggregate$/m);
    expect(workflow).toMatch(/^ {4}if: \$\{\{ always\(\) \}\}$/m);
    expect(workflow).not.toMatch(
      /uses: .*?(deploy|e2e|full-suite|coverage).*?\.ya?ml/,
    );
  });
});

function workspace(
  path: string,
  workspaceClass: NightlyTestWorkspace['workspaceClass'],
): NightlyTestWorkspace {
  return {
    command: `bun run --cwd ${path} test`,
    manifestCommand: 'vitest run',
    name: `@genfeedai/${path.split('/').at(-1)}`,
    path,
    workspaceClass,
  };
}

function inventory(): NightlyTestInventoryResult {
  return {
    excluded: [
      {
        owner: '@genfeedai/ci',
        path: 'packages/excluded',
        reason: 'Tracked until the suite becomes hermetic.',
        reviewDate: '2026-08-20',
        trackingIssue: 1931,
        workspaceClass: 'package',
      },
    ],
    summary: {
      byClass: {
        api: 1,
        app: 1,
        client: 0,
        extension: 0,
        package: 1,
        'server-service': 0,
      },
      discoveredByClass: {
        api: 1,
        app: 1,
        client: 0,
        extension: 0,
        package: 2,
        'server-service': 0,
      },
      discoveredWorkspaces: 4,
      excludedByClass: {
        api: 0,
        app: 0,
        client: 0,
        extension: 0,
        package: 1,
        'server-service': 0,
      },
      excludedWorkspaces: 1,
      executableWorkspaces: 3,
      testCapableWorkspaces: 4,
    },
    violations: [],
    workspaces: [
      workspace('apps/app', 'app'),
      workspace('apps/server/api', 'api'),
      workspace('packages/helpers', 'package'),
    ],
  };
}

function jobsForPlan(
  plan: ReturnType<typeof buildNightlyUnitMatrixPlan>,
): NightlyUnitMatrixJob[] {
  return plan.entries.map((entry) => ({
    conclusion: 'success',
    html_url: `https://github.com/genfeedai/genfeed.ai/actions/jobs/${entry.executionId}`,
    name: `Unit / ${entry.executionId}`,
  }));
}
