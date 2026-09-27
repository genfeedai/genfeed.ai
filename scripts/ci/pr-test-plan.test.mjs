import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyChangedFiles,
  createPrTestPlan,
  createShardMatrix,
  isChangeRunEvent,
  parseTurboDryRun,
  parseVitestList,
  readChangedFiles,
  selectShardCount,
} from './pr-test-plan.mjs';

test('scopes surfaces by diff on pull requests only, forces them elsewhere', () => {
  // The hourly master Full Suite and release dispatch have no diff base, so
  // they force every surface.
  assert.equal(isChangeRunEvent('pull_request'), true);
  assert.equal(isChangeRunEvent('merge_group'), false);
  assert.equal(isChangeRunEvent('schedule'), false);
  assert.equal(isChangeRunEvent('push'), false);
  assert.equal(isChangeRunEvent('workflow_dispatch'), false);
  assert.equal(isChangeRunEvent(undefined), false);
});

test('classifies direct and shared pull-request surfaces conservatively', () => {
  assert.deepEqual(classifyChangedFiles(['docs/testing.md']), {
    api: false,
    app: false,
    forceFull: false,
  });
  assert.deepEqual(
    classifyChangedFiles(['apps/app/src/components/example.tsx']),
    {
      api: false,
      app: true,
      forceFull: false,
    },
  );
  assert.deepEqual(
    classifyChangedFiles(['apps/server/api/src/example.service.ts']),
    {
      api: true,
      app: false,
      forceFull: false,
    },
  );
  assert.deepEqual(
    classifyChangedFiles([
      'packages/contracts/src/interfaces/example.interface.ts',
    ]),
    {
      api: true,
      app: true,
      forceFull: false,
    },
  );
});

test('classifies docs, workflows, and CI scripts as out of the product test matrix', () => {
  for (const file of [
    '.agents/memory/MEMORY.md',
    '.github/workflows/ci.yml',
    '.github/workflows/pr-full-suite.yml',
    'package.json',
    'scripts/ci/executable-contracts.test.ts',
    'scripts/ci/ci-concurrency.test.ts',
    'scripts/architecture/check-product-route-inventory.test.ts',
  ]) {
    assert.deepEqual(
      classifyChangedFiles([file]),
      { api: false, app: false, forceFull: false },
      `${file} must not escalate app/API shards`,
    );
  }
});

test('escalates only lockfile, turbo, vitest config, bun setup, and the planner', () => {
  for (const file of [
    '.github/actions/setup-bun-env/action.yml',
    'apps/app/vitest.config.mts',
    'apps/server/api/vitest.config.ts',
    'bun.lock',
    'scripts/ci/pr-test-plan.mjs',
    'scripts/ci/tests-gate.mjs',
    'turbo.json',
    'vitest.config.ts',
  ]) {
    assert.deepEqual(
      classifyChangedFiles([file]),
      { api: true, app: true, forceFull: true },
      `${file} must force complete app/API validation`,
    );
  }
});

test('includes deleted paths in change classification input', async () => {
  const calls = [];
  const files = await readChangedFiles('base-sha', async (command, args) => {
    calls.push({ args, command });
    return 'apps/app/deleted.test.ts\0packages/changed.ts\0';
  });

  assert.deepEqual(calls, [
    {
      command: 'git',
      args: [
        'diff',
        '--name-only',
        '--diff-filter=ACDMR',
        '-z',
        'base-sha',
        'HEAD',
      ],
    },
  ]);
  assert.deepEqual(files, ['apps/app/deleted.test.ts', 'packages/changed.ts']);
});

test('selects bounded adaptive shard counts', () => {
  assert.equal(selectShardCount(0), 0);
  assert.equal(selectShardCount(1), 1);
  assert.equal(selectShardCount(75), 1);
  assert.equal(selectShardCount(76), 2);
  assert.equal(selectShardCount(250), 2);
  assert.equal(selectShardCount(251), 4);
  assert.equal(selectShardCount(737), 4);
});

test('a full-suite escalation shards each whole suite four ways', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['bun.lock'],
    runHeavy: true,
  });

  assert.equal(plan.forceFull, true);
  for (const surface of [plan.appTests, plan.apiTests]) {
    assert.equal(surface.applicable, true);
    assert.equal(surface.shards, 4);
    assert.deepEqual(surface.matrix, createShardMatrix(4));
  }
  assert.deepEqual(plan.workspaceFilters, [
    '--filter=./packages/*',
    '--filter=./apps/server/*',
    '--filter=!@genfeedai/api',
    '--filter=@genfeedai/website',
    '--filter=@genfeedai/docs',
    '--filter=@genfeedai/mobile',
  ]);
});

test('creates deterministic matrix entries', () => {
  assert.deepEqual(createShardMatrix(0), { include: [] });
  assert.deepEqual(createShardMatrix(1), {
    include: [{ shard: 1, total: 1 }],
  });
  assert.deepEqual(createShardMatrix(2), {
    include: [
      { shard: 1, total: 2 },
      { shard: 2, total: 2 },
    ],
  });
  assert.deepEqual(createShardMatrix(4), {
    include: [
      { shard: 1, total: 4 },
      { shard: 2, total: 4 },
      { shard: 3, total: 4 },
      { shard: 4, total: 4 },
    ],
  });
});

test('deduplicates Vitest file manifests and rejects malformed output', () => {
  assert.deepEqual(
    parseVitestList(
      JSON.stringify([
        { file: '/repo/apps/app/a.test.ts', projectName: 'app' },
        { file: '/repo/apps/app/a.test.ts', projectName: 'app' },
        { file: '/repo/apps/app/b.test.ts', projectName: 'app' },
      ]),
      '/repo',
    ),
    ['apps/app/a.test.ts', 'apps/app/b.test.ts'],
  );

  assert.throws(
    () => parseVitestList('{"file":"not-an-array"}', '/repo'),
    /Vitest list output must be an array/,
  );
  assert.throws(
    () => parseVitestList('[{"projectName":"app"}]', '/repo'),
    /Vitest list entry must contain an absolute file path/,
  );
});

test('extracts affected Turbo test tasks and rejects malformed plans', () => {
  assert.deepEqual(
    parseTurboDryRun(
      JSON.stringify({
        tasks: [
          { package: '@genfeedai/contracts/interfaces', task: 'test' },
          { package: '@genfeedai/serializers', task: 'test' },
        ],
      }),
    ),
    ['@genfeedai/contracts/interfaces#test', '@genfeedai/serializers#test'],
  );
  assert.deepEqual(parseTurboDryRun('{"tasks":[]}'), []);
  assert.throws(
    () => parseTurboDryRun('{"packages":[]}'),
    /Turbo dry-run output must contain a tasks array/,
  );
});

test('creates a fail-closed plan with explicit applicability', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['packages/contracts/src/interfaces/index.ts'],
    appTests: Array.from({ length: 76 }, (_, index) => `app-${index}.test.ts`),
    apiTests: Array.from({ length: 251 }, (_, index) => `api-${index}.test.ts`),
    turboTasks: {
      extensions: [],
      packages: ['@genfeedai/contracts/interfaces#test'],
      server: [],
      web: ['@genfeedai/website#test'],
    },
  });

  assert.equal(plan.appTests.applicable, true);
  assert.equal(plan.appTests.count, 76);
  assert.equal(plan.appTests.shards, 2);
  assert.equal(plan.apiTests.applicable, true);
  assert.equal(plan.apiTests.count, 251);
  assert.equal(plan.apiTests.shards, 4);
  assert.deepEqual(plan.workspaceGroups, {
    extensions: false,
    packages: true,
    server: false,
    web: true,
  });
  assert.deepEqual(plan.workspaceFilters, [
    '--filter=./packages/*',
    '--filter=@genfeedai/website',
    '--filter=@genfeedai/docs',
    '--filter=@genfeedai/mobile',
  ]);
});

test('an empty affected plan runs no workspace or test shards', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['docs/testing.md'],
  });

  assert.equal(plan.appTests.applicable, false);
  assert.equal(plan.apiTests.applicable, false);
  assert.deepEqual(plan.workspaceFilters, []);
});

test('keeps dormant extension tests out of full-suite plans', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: [],
    forceAllSurfaces: true,
    runHeavy: true,
    turboTasks: {
      extensions: ['@genfeedai/extension-browser#test'],
    },
  });

  assert.equal(plan.workspaceGroups.extensions, false);
});

test('keeps the workflow wired to the planner matrices and outputs', () => {
  const workflowPath = fileURLToPath(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
  );
  const workflow = readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /^ {2}plan:\n/m);
  assert.match(
    workflow,
    /pr-test-plan\.mjs --event "\$\{\{ github\.event_name \}\}" --base "\$CI_BASE_SHA"/,
    'the planner must diff against CI_BASE_SHA',
  );
  assert.match(
    workflow,
    /matrix: \$\{\{ fromJSON\(needs\.plan\.outputs\.app_matrix\) \}\}/,
  );
  assert.match(
    workflow,
    /matrix: \$\{\{ fromJSON\(needs\.plan\.outputs\.api_matrix\) \}\}/,
  );
  assert.match(
    workflow,
    /matrix: \$\{\{ fromJSON\(needs\.plan\.outputs\.spec_matrix\) \}\}/,
  );
  // Changed selection on the affected tier, the whole suite on the full tier.
  const changedSelections = workflow.match(
    /SELECTION=\(--passWithNoTests --changed "\$\{CI_BASE_SHA\}"\)/g,
  );
  assert.equal(changedSelections?.length, 2);
  assert.match(
    workflow,
    /name: Upload pull-request test plan[\s\S]*?actions\/upload-artifact@[0-9a-f]{40} # v7\.\d+\.\d+/,
  );
  // The planner owns workspace filters; the job gates on its output alone.
  assert.match(workflow, /if: needs\.plan\.outputs\.workspace_tests == 'true'/);
  assert.match(
    workflow,
    /WORKSPACE_FILTERS: \$\{\{ needs\.plan\.outputs\.workspace_filters \}\}/,
  );
  // Only pull requests carry a diff base; no step resolves its own.
  assert.match(
    workflow,
    /CI_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \|\| '' \}\}/,
  );
  assert.doesNotMatch(workflow, /merge_group/);
  // PR runs carry no coverage instrumentation; full-repository coverage
  // stays in the weekly Coverage workflow.
  assert.doesNotMatch(workflow, /--coverage/);
});
