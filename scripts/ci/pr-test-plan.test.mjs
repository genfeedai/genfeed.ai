import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyChangedFiles,
  createPrTestPlan,
  createShardMatrix,
  parseTurboDryRun,
  parseVitestList,
  readChangedFiles,
  selectCoverageShardCount,
  selectShardCount,
} from './pr-test-plan.mjs';

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
    classifyChangedFiles(['packages/interfaces/src/example.interface.ts']),
    {
      api: true,
      app: true,
      forceFull: false,
    },
  );
  assert.deepEqual(
    classifyChangedFiles(['ee/packages/billing/src/example.controller.ts']),
    {
      api: true,
      app: false,
      forceFull: false,
    },
  );
});

test('escalates validation machinery and root dependency changes', () => {
  for (const file of [
    '.github/actions/setup-bun-env/action.yml',
    '.github/workflows/ci.yml',
    'apps/app/vitest.config.mts',
    'apps/server/api/vitest.config.ts',
    'bun.lock',
    'package.json',
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

test('sizes coverage shards from the surface, not from applicability', () => {
  // Out of scope: no matrix, so the coverage job never starts.
  assert.equal(
    selectCoverageShardCount({
      applies: false,
      forceFull: false,
      testFileCount: 400,
    }),
    0,
  );
  // In scope with nothing listed still runs one shard: a skipped job reports
  // `not-applicable`, and that is a different fact from "instrumented nothing".
  assert.equal(
    selectCoverageShardCount({
      applies: true,
      forceFull: false,
      testFileCount: 0,
    }),
    1,
  );
  assert.equal(
    selectCoverageShardCount({
      applies: true,
      forceFull: false,
      testFileCount: 76,
    }),
    2,
  );
  assert.equal(
    selectCoverageShardCount({
      applies: true,
      forceFull: false,
      testFileCount: 251,
    }),
    4,
  );
  // An escalation never lists the graph, so there is no count to size from —
  // assume the widest split rather than guess a narrow one.
  assert.equal(
    selectCoverageShardCount({
      applies: true,
      forceFull: true,
      testFileCount: 0,
    }),
    4,
  );

  assert.throws(
    () =>
      selectCoverageShardCount({
        applies: 'yes',
        forceFull: false,
        testFileCount: 1,
      }),
    /applies must be a boolean/,
  );
  assert.throws(
    () =>
      selectCoverageShardCount({
        applies: true,
        forceFull: 'no',
        testFileCount: 1,
      }),
    /forceFull must be a boolean/,
  );
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
          { package: '@genfeedai/interfaces', task: 'test' },
          { package: '@genfeedai/serializers', task: 'test' },
        ],
      }),
    ),
    ['@genfeedai/interfaces#test', '@genfeedai/serializers#test'],
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
    changedFiles: ['packages/interfaces/src/index.ts'],
    appTests: Array.from({ length: 76 }, (_, index) => `app-${index}.test.ts`),
    apiTests: Array.from({ length: 251 }, (_, index) => `api-${index}.test.ts`),
    turboTasks: {
      extensions: [],
      packages: ['@genfeedai/interfaces#test'],
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
  assert.equal(plan.appCoverage.applicable, true);
  assert.equal(plan.appCoverage.shards, 2);
  assert.equal(plan.apiCoverage.applicable, true);
  assert.equal(plan.apiCoverage.shards, 4);
  assert.deepEqual(plan.apiCoverage.matrix, createShardMatrix(4));
  assert.deepEqual(plan.workspaceGroups, {
    extensions: false,
    packages: true,
    server: false,
    web: true,
  });
});

test('keeps coverage measurable when changed-test selection is dropped', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['package.json'],
    appTests: [],
    apiTests: [],
    turboTasks: {},
  });

  assert.equal(plan.forceFull, true);
  // The escalation hands both surfaces to the full suites, so changed-test
  // selection is deliberately empty…
  assert.equal(plan.appTests.applicable, false);
  assert.deepEqual(plan.appTests.matrix, { include: [] });
  // …while the diff still has coverage worth measuring, at the widest split.
  assert.equal(plan.apiCoverage.applicable, true);
  assert.equal(plan.apiCoverage.shards, 4);
});

test('never emits a coverage matrix for an out-of-scope surface', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['apps/app/src/components/example.tsx'],
    appTests: ['apps/app/example.test.ts'],
    apiTests: [],
    turboTasks: {},
  });

  // An empty matrix is a workflow error, not an empty run — the coverage jobs
  // gate on `applicable`, so the two must agree exactly.
  assert.equal(plan.apiCoverage.applicable, false);
  assert.deepEqual(plan.apiCoverage.matrix, { include: [] });
  assert.equal(plan.appCoverage.applicable, true);
  assert.deepEqual(plan.appCoverage.matrix, createShardMatrix(1));
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

test('keeps the workflow wired to exact changed selection and dynamic shards', () => {
  const workflowPath = fileURLToPath(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
  );
  const workflow = readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /^ {2}test-scope:\n/m);
  assert.match(
    workflow,
    /run: node scripts\/ci\/pr-test-plan\.mjs[\s\S]*?--base/,
  );
  assert.match(
    workflow,
    /matrix: \$\{\{ fromJSON\(needs\.test-scope\.outputs\.app_matrix\) \}\}/,
  );
  assert.match(
    workflow,
    /matrix: \$\{\{ fromJSON\(needs\.test-scope\.outputs\.api_matrix\) \}\}/,
  );
  assert.match(
    workflow,
    /--changed "\$BASE"[\s\\]*--shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ matrix\.total \}\}/,
  );
  assert.match(
    workflow,
    /name: Upload pull-request test plan[\s\S]*?actions\/upload-artifact@v7/,
  );
});

test('sizes the coverage jobs from the same planner as the test jobs', () => {
  const workflowPath = fileURLToPath(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
  );
  const workflow = readFileSync(workflowPath, 'utf8');

  const planJob = workflow.slice(
    workflow.indexOf('\n  test-scope:\n'),
    workflow.indexOf('\n  test-packages:\n'),
  );

  for (const surface of ['app', 'api']) {
    // A planner output that the job never forwards reads as the empty string
    // downstream, and the coverage job silently stops running altogether.
    for (const key of [`${surface}_coverage`, `${surface}_coverage_matrix`]) {
      assert.ok(
        planJob.includes(`${key}: \${{ steps.plan.outputs.${key} }}`),
        `test-scope must expose ${key} as a job output`,
      );
    }
    assert.match(
      workflow,
      new RegExp(
        `matrix: \\$\\{\\{ fromJSON\\(needs\\.test-scope\\.outputs\\.${surface}_coverage_matrix\\) \\}\\}`,
      ),
      `coverage-changed-${surface} must shard on the planner's coverage matrix`,
    );
    // An empty matrix is an error, never an empty run: the gate and the matrix
    // are two views of the same planner decision and must not drift apart.
    assert.match(
      workflow,
      new RegExp(
        `needs\\.test-scope\\.outputs\\.${surface}_coverage == 'true'`,
      ),
      `coverage-changed-${surface} must gate on its own applicability output`,
    );
  }
});
