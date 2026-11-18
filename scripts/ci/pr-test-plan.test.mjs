import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  API_SUITE_ROOT,
  appliesMcpAuthRuntime,
  assignShardFiles,
  classifyChangedFiles,
  createPrTestPlan,
  createShardFileMatrix,
  createShardMatrix,
  isChangeRunEvent,
  parseTurboDryRun,
  parseVitestList,
  readChangedFiles,
  selectShardCount,
} from './pr-test-plan.mjs';
import { selectShardArguments } from './test-shard-selection.mjs';
import { allPackageTestTasks } from './workspace-test-matrix.mjs';

test('scopes PR and merge-group surfaces by diff, forces them elsewhere', () => {
  // The master Full Suite and release dispatch have no diff base, so
  // they force every surface.
  assert.equal(isChangeRunEvent('pull_request'), true);
  assert.equal(isChangeRunEvent('merge_group'), true);
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
    classifyChangedFiles(['apps/web/src/components/example.tsx']),
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
    '.github/workflows/pr-heavy-ci.yml',
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
    'apps/web/vitest.config.mts',
    'apps/server/api/vitest.config.ts',
    'bun.lock',
    'scripts/ci/pr-test-plan.mjs',
    'scripts/ci/test-shard-selection.mjs',
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
    return 'apps/web/deleted.test.ts\0packages/changed.ts\0';
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
  assert.deepEqual(files, ['apps/web/deleted.test.ts', 'packages/changed.ts']);
});

test('selects bounded adaptive shard counts', () => {
  assert.equal(selectShardCount(0), 0);
  assert.equal(selectShardCount(1), 1);
  assert.equal(selectShardCount(75), 1);
  assert.equal(selectShardCount(76), 2);
  assert.equal(selectShardCount(250), 2);
  assert.equal(selectShardCount(251), 4);
  assert.equal(selectShardCount(737), 4);
  // The affected tier never exceeds four shards, however many files change.
  assert.equal(selectShardCount(5000), 4);
});

test('a full-suite escalation shards the app suite four ways and the API suite eight ways', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['bun.lock'],
    runHeavy: true,
  });

  assert.equal(plan.forceFull, true);
  assert.equal(plan.appTests.applicable, true);
  assert.equal(plan.appTests.shards, 4);
  assert.deepEqual(plan.appTests.matrix, createShardMatrix(4));
  assert.equal(plan.apiTests.applicable, true);
  assert.equal(plan.apiTests.shards, 8);
  assert.deepEqual(plan.apiTests.matrix, createShardMatrix(8));
  assert.deepEqual(
    plan.apiTests.matrix.include.map(({ shard, total }) => `${shard}/${total}`),
    ['1/8', '2/8', '3/8', '4/8', '5/8', '6/8', '7/8', '8/8'],
  );
  const workspaceLegs = plan.workspaceMatrix.include.filter(
    ({ group }) => group === 'workspaces',
  );
  assert.equal(workspaceLegs.length, 4);
  assert.deepEqual(
    workspaceLegs.map(({ ui_shard }) => ui_shard),
    ['1/4', '2/4', '3/4', '4/4'],
  );
  const webFilters = [
    '--filter=@genfeedai/marketing',
    '--filter=@genfeedai/docs',
    '--filter=@genfeedai/mobile',
  ];
  const filters = workspaceLegs.flatMap((leg) =>
    leg.filters.split(' ').filter(Boolean),
  );
  assert.deepEqual(
    filters.filter((filter) => webFilters.includes(filter)).sort(),
    [...webFilters].sort(),
    'the web group runs exactly once, inside a shared leg',
  );
  const selected = filters
    .filter((filter) => !webFilters.includes(filter))
    .map((filter) => `${filter.slice('--filter='.length)}#test`);
  selected.push('@genfeedai/ui#test');
  assert.deepEqual(
    selected.sort(),
    allPackageTestTasks(
      fileURLToPath(new URL('../..', import.meta.url)),
    ).sort(),
  );
  assert.equal(
    workspaceLegs.filter(({ extension }) => extension === 'true').length,
    1,
    'the browser extension runs exactly once, inside a shared leg',
  );
  assert.deepEqual(
    plan.workspaceMatrix.include
      .filter(({ group }) => group !== 'workspaces')
      .map(({ group }) => group),
    ['server'],
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
  assert.equal(createShardMatrix(8).include.length, 8);
  assert.throws(() => createShardMatrix(3), RangeError);
  assert.throws(() => createShardMatrix(16), RangeError);
});

test('deduplicates Vitest file manifests and rejects malformed output', () => {
  assert.deepEqual(
    parseVitestList(
      JSON.stringify([
        { file: '/repo/apps/web/a.test.ts', projectName: 'app' },
        { file: '/repo/apps/web/a.test.ts', projectName: 'app' },
        { file: '/repo/apps/web/b.test.ts', projectName: 'app' },
      ]),
      '/repo',
    ),
    ['apps/web/a.test.ts', 'apps/web/b.test.ts'],
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

test('gives every planned file to exactly one shard', () => {
  assert.deepEqual(
    assignShardFiles(
      ['e.test.ts', 'a.test.ts', 'c.test.ts', 'b.test.ts', 'd.test.ts'],
      2,
    ),
    [
      ['a.test.ts', 'c.test.ts', 'e.test.ts'],
      ['b.test.ts', 'd.test.ts'],
    ],
  );
  assert.deepEqual(
    assignShardFiles(['b.test.ts', 'a.test.ts', 'b.test.ts'], 4),
    [['a.test.ts'], ['b.test.ts'], [], []],
  );
  assert.deepEqual(assignShardFiles([], 0), []);
});

test('writes shard file lists relative to the suite root', () => {
  assert.deepEqual(
    createShardFileMatrix(
      [
        'apps/web/src/b.test.tsx',
        'apps/web/src/a.test.tsx',
        'packages/ui/src/c.test.tsx',
      ],
      2,
      'apps/web',
    ),
    {
      include: [
        {
          shard: 1,
          total: 2,
          count: 2,
          files: 'src/a.test.tsx\n../../packages/ui/src/c.test.tsx',
        },
        { shard: 2, total: 2, count: 1, files: 'src/b.test.tsx' },
      ],
    },
  );
  assert.deepEqual(createShardFileMatrix([], 0, 'apps/web'), { include: [] });
});

test('keeps a shard list too large to travel out of the matrix', () => {
  const longName = 'x'.repeat(200);
  const files = Array.from(
    { length: 600 },
    (_, index) =>
      `apps/web/src/${longName}-${String(index).padStart(3, '0')}.test.ts`,
  );
  assert.deepEqual(
    createShardFileMatrix(files, 1, 'apps/web'),
    createShardMatrix(1),
  );
  assert.equal(
    createShardFileMatrix(files, 2, 'apps/web').include[0].count,
    300,
  );
});

test('an affected plan gives each app and API shard its own files', () => {
  const appTests = Array.from(
    { length: 76 },
    (_, index) => `apps/web/src/app-${String(index).padStart(2, '0')}.test.tsx`,
  );
  const apiTests = [
    'apps/server/api/src/a.spec.ts',
    'packages/pricing/src/b.spec.ts',
  ];
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['packages/contracts/src/interfaces/index.ts'],
    appTests,
    apiTests,
  });

  assert.deepEqual(
    plan.appTests.matrix.include.map(({ shard, total, count }) => [
      shard,
      total,
      count,
    ]),
    [
      [1, 2, 38],
      [2, 2, 38],
    ],
  );
  assert.deepEqual(
    plan.appTests.matrix.include
      .flatMap(({ files }) => files.split('\n'))
      .sort(),
    appTests.map((file) => file.slice('apps/web/'.length)),
  );
  assert.deepEqual(plan.apiTests.matrix, {
    include: [
      {
        shard: 1,
        total: 1,
        count: 2,
        files: 'src/a.spec.ts\n../../../packages/pricing/src/b.spec.ts',
      },
    ],
  });
});

test('a shard resolves its planned list back to the planned files', () => {
  const repositoryRoot = '/repo';
  const planned = [
    'apps/server/api/src/a.spec.ts',
    'packages/pricing/src/b.spec.ts',
  ];
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['packages/pricing/src/plans.ts'],
    apiTests: planned,
  });
  const [entry] = plan.apiTests.matrix.include;

  assert.deepEqual(
    selectShardArguments({
      base: 'base-sha',
      count: String(entry.count),
      fileExists: () => true,
      files: entry.files,
      repositoryRoot,
      shard: String(entry.shard),
      suiteRoot: API_SUITE_ROOT,
      total: String(entry.total),
    }),
    {
      args: [
        '/repo/apps/server/api/src/a.spec.ts',
        '/repo/packages/pricing/src/b.spec.ts',
      ],
      mode: 'files',
    },
  );
});

test('the shards of a plan run every planned file between them, and a damaged list fails its shard', () => {
  const planned = Array.from(
    { length: 76 },
    (_, index) => `apps/web/src/app-${String(index).padStart(2, '0')}.test.tsx`,
  );
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['packages/contracts/src/interfaces/index.ts'],
    appTests: planned,
  });
  const select = (entry, count = entry.count) =>
    selectShardArguments({
      base: 'base-sha',
      count: String(count),
      fileExists: () => true,
      files: entry.files,
      repositoryRoot: '/repo',
      shard: String(entry.shard),
      suiteRoot: 'apps/web',
      total: String(entry.total),
    });
  const [first, second] = plan.appTests.matrix.include;

  assert.deepEqual(
    [...select(first).args, ...select(second).args].sort(),
    planned.map((file) => `/repo/${file}`),
  );
  // A shard never trades a damaged list for Vitest's own split: the other
  // shard still runs its dealt files, so the two halves would not add up.
  assert.throws(
    () => select(second, 37),
    /The plan counted 37 files and the list holds 38/,
  );
});

test('full-tier and non-change runs leave file selection to Vitest', () => {
  const tests = {
    appTests: ['apps/web/a.test.ts'],
    apiTests: ['apps/server/api/a.spec.ts'],
  };
  const escalated = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['bun.lock'],
    ...tests,
  });
  assert.deepEqual(escalated.appTests.matrix, createShardMatrix(4));
  assert.deepEqual(escalated.apiTests.matrix, createShardMatrix(8));

  const scheduled = createPrTestPlan({
    base: 'base-sha',
    changedFiles: [],
    forceAllSurfaces: true,
    ...tests,
  });
  assert.deepEqual(
    scheduled.appTests.matrix,
    createShardMatrix(scheduled.appTests.shards),
  );
  assert.deepEqual(
    scheduled.apiTests.matrix,
    createShardMatrix(scheduled.apiTests.shards),
  );
});

test('a plan whose lists are too large together keeps Vitest selection', () => {
  const longName = 'y'.repeat(150);
  const list = (root, extension) =>
    Array.from(
      { length: 1400 },
      (_, index) =>
        `${root}/src/${longName}-${String(index).padStart(4, '0')}.${extension}`,
    );
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['packages/contracts/src/interfaces/index.ts'],
    appTests: list('apps/web', 'test.tsx'),
    apiTests: list('apps/server/api', 'spec.ts'),
  });

  assert.deepEqual(plan.appTests.matrix, createShardMatrix(4));
  assert.deepEqual(plan.apiTests.matrix, createShardMatrix(4));
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
      'browser-extension': [],
      packages: ['@genfeedai/contracts#test'],
      server: [],
      web: ['@genfeedai/marketing#test'],
    },
  });

  assert.equal(plan.appTests.applicable, true);
  assert.equal(plan.appTests.count, 76);
  assert.equal(plan.appTests.shards, 2);
  assert.equal(plan.apiTests.applicable, true);
  assert.equal(plan.apiTests.count, 251);
  assert.equal(plan.apiTests.shards, 4);
  assert.deepEqual(plan.workspaceGroups, {
    'browser-extension': false,
    packages: true,
    server: false,
    web: true,
  });
  assert.deepEqual(plan.workspaceMatrix.include, [
    {
      group: 'workspaces',
      name: 'workspaces-1/1',
      filters:
        '--filter=@genfeedai/marketing --filter=@genfeedai/docs --filter=@genfeedai/mobile --filter=@genfeedai/contracts',
      extension: '',
      ui_shard: '',
    },
  ]);
});

test('an empty affected plan runs no workspace or test shards', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['docs/testing.md'],
  });

  assert.equal(plan.appTests.applicable, false);
  assert.equal(plan.apiTests.applicable, false);
  assert.deepEqual(plan.workspaceMatrix, { include: [] });
});

test('master-heavy plans activate browser tests', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: [],
    forceAllSurfaces: true,
    runHeavy: true,
    turboTasks: {
      'browser-extension': ['@genfeedai/extension#test'],
    },
  });

  assert.equal(plan.workspaceGroups['browser-extension'], true);
});

test('keeps the workflow wired to the planner matrices and outputs', () => {
  const workflowPath = fileURLToPath(
    new URL('../../.github/workflows/_ci-validation.yml', import.meta.url),
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
  // Each shard takes its selection from the plan: the files the plan gave it
  // on the affected tier, the whole suite split by Vitest on the full tier.
  const shardSelections = workflow.match(
    /node scripts\/ci\/test-shard-selection\.mjs > "\$\{RUNNER_TEMP\}\/shard-selection\.txt"\n\s+mapfile -t SELECTION < "\$\{RUNNER_TEMP\}\/shard-selection\.txt"/g,
  );
  assert.equal(shardSelections?.length, 2);
  assert.equal(
    workflow.match(/--maxWorkers=2 "\$\{SELECTION\[@\]\}"/g)?.length,
    2,
  );
  assert.match(workflow, /SHARD_ROOT: apps\/web\n/);
  assert.match(workflow, /SHARD_ROOT: apps\/server\/api\n/);
  assert.equal(
    workflow.match(/SHARD_FILES: \$\{\{ matrix\.files \}\}/g)?.length,
    2,
  );
  assert.equal(
    workflow.match(/SHARD_FILE_COUNT: \$\{\{ matrix\.count \}\}/g)?.length,
    2,
  );
  // No shard resolves the changed graph or the Vitest shard inline any more.
  assert.doesNotMatch(workflow, /--changed "\$\{CI_BASE_SHA\}"/);
  assert.doesNotMatch(workflow, /--shard=\$\{\{ matrix\.shard \}\}/);
  assert.match(
    workflow,
    /name: Upload pull-request test plan[\s\S]*?actions\/upload-artifact@[0-9a-f]{40} # v7\.\d+\.\d+/,
  );
  // The planner owns workspace filters; the job gates on its output alone.
  assert.match(workflow, /if: needs\.plan\.outputs\.workspace_tests == 'true'/);
  assert.match(
    workflow,
    /matrix: \$\{\{ fromJSON\(needs\.plan\.outputs\.workspace_matrix\) \}\}/,
  );
  assert.match(workflow, /name: Test Workspaces \(\$\{\{ matrix\.name \}\}\)/);
  assert.match(workflow, /WORKSPACE_FILTERS: \$\{\{ matrix\.filters \}\}/);
  // The diff base is the merge commit's first parent, resolved once by Plan;
  // the payload's `pull_request.base.sha` can be stale and over-escalate.
  assert.match(workflow, /base="\$\(git rev-parse HEAD\^1\)"/);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.base\.sha/);
  const baseConsumers = workflow.match(
    /^ {6}CI_BASE_SHA: \$\{\{ needs\.plan\.outputs\.base \}\}$/gm,
  );
  assert.equal(
    baseConsumers?.length,
    4,
    'workspace, app, API, and build jobs read the planned base; static checks resolve the same base themselves',
  );
  assert.match(
    readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    ),
    /merge_group:\n {4}types: \[checks_requested\]/,
  );
  assert.match(workflow, /git merge-base --is-ancestor "\$\{base\}" HEAD/);
  // PR runs carry no coverage instrumentation; full-repository coverage
  // stays in the nightly Coverage workflow.
  assert.doesNotMatch(workflow, /--coverage/);
});

test('direct browser source and config changes fail closed with an empty task graph', () => {
  for (const file of [
    'apps/extension/components/sidebar.tsx',
    'apps/extension/package.json',
    'apps/extension/scripts/build-icon.mjs',
  ]) {
    const plan = createPrTestPlan({ base: 'base-sha', changedFiles: [file] });
    assert.deepEqual(plan.workspaceMatrix.include, [
      {
        group: 'workspaces',
        name: 'workspaces-1/1',
        filters: '',
        extension: 'true',
        ui_shard: '',
      },
    ]);
  }
});

test('affected browser dependencies activate only the browser workspace leg', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['packages/contracts/src/interfaces/example.ts'],
    turboTasks: { 'browser-extension': ['@genfeedai/extension#test'] },
  });
  assert.deepEqual(plan.workspaceMatrix.include, [
    {
      group: 'workspaces',
      name: 'workspaces-1/1',
      filters: '',
      extension: 'true',
      ui_shard: '',
    },
  ]);
});

test('unrelated docs do not activate extension tests', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['docs/testing.md'],
  });
  assert.deepEqual(plan.workspaceMatrix.include, []);
  assert.equal(plan.workspaceGroups['browser-extension'], false);
});

test('existing workspace groups retain affected-task applicability and declared order', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['docs/testing.md'],
    turboTasks: {
      web: ['@genfeedai/marketing#test'],
      server: ['@genfeedai/worker#test'],
      packages: ['@genfeedai/contracts#test'],
      'browser-extension': ['@genfeedai/extension#test'],
    },
  });
  assert.deepEqual(
    plan.workspaceMatrix.include.map(({ group, name }) => [group, name]),
    [
      ['workspaces', 'workspaces-1/1'],
      ['server', 'server'],
    ],
  );
});

test('the browser extension runs in full while every other filter retains affected selection', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/_ci-validation.yml', import.meta.url),
    'utf8',
  );
  const workspaceStep = workflow.slice(
    workflow.indexOf('      - name: Run workspace tests'),
    workflow.indexOf('      - name: Run UI shard'),
  );
  assert.match(workspaceStep, /WORKSPACE_FILTERS: \$\{\{ matrix\.filters \}\}/);
  assert.match(
    workspaceStep,
    /if \[ "\$\{FORCE_FULL\}" = "true" \] \|\| \[ -z "\$\{CI_BASE_SHA\}" \]; then\n {12}bunx turbo run test --continue --concurrency=1 \$\{WORKSPACE_FILTERS\}\n {10}else\n {12}TURBO_SCM_BASE="\$\{CI_BASE_SHA\}" bunx turbo run test --continue --concurrency=1 --affected \$\{WORKSPACE_FILTERS\}\n {10}fi/,
  );
  assert.match(
    workspaceStep,
    /- name: Run browser extension tests\n {8}if: \$\{\{ !cancelled\(\) && matrix\.extension == 'true' \}\}\n {8}run: bunx turbo run test --continue --concurrency=1 --filter=@genfeedai\/extension\n/,
  );
  assert.doesNotMatch(
    workspaceStep.slice(workspaceStep.indexOf('Run browser extension tests')),
    /--affected/,
  );
});

test('server workspace leg runs the workers cron specs with affected selection', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/_ci-validation.yml', import.meta.url),
    'utf8',
  );
  const cronStep = workflow.slice(
    workflow.indexOf('      - name: Run workers cron specs'),
    workflow.indexOf('\n  # App tests.'),
  );
  assert.match(
    cronStep,
    /if: \$\{\{ !cancelled\(\) && matrix\.group == 'server' \}\}/,
  );
  assert.match(
    cronStep,
    /if \[ "\$\{FORCE_FULL\}" = "true" \] \|\| \[ -z "\$\{CI_BASE_SHA\}" \]; then\n {12}bunx turbo run test:cron --filter=@genfeedai\/workers\n {10}else\n {12}TURBO_SCM_BASE="\$\{CI_BASE_SHA\}" bunx turbo run test:cron --affected --filter=@genfeedai\/workers\n {10}fi/,
  );
});

test('server workspace leg runs the MCP e2e specs with affected selection', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/_ci-validation.yml', import.meta.url),
    'utf8',
  );
  const e2eStep = workflow.slice(
    workflow.indexOf('      - name: Run MCP e2e specs'),
    workflow.indexOf('\n  # App tests.'),
  );
  assert.match(
    e2eStep,
    /if: \$\{\{ !cancelled\(\) && matrix\.group == 'server' \}\}/,
  );
  assert.match(
    e2eStep,
    /if \[ "\$\{FORCE_FULL\}" = "true" \] \|\| \[ -z "\$\{CI_BASE_SHA\}" \]; then\n {12}bunx turbo run test:e2e --filter=@genfeedai\/mcp\n {10}else\n {12}TURBO_SCM_BASE="\$\{CI_BASE_SHA\}" bunx turbo run test:e2e --affected --filter=@genfeedai\/mcp\n {10}fi/,
  );
});

test('UI shards retain the environment gate, dependency builds, distinct cache arguments and failure semantics', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/_ci-validation.yml', import.meta.url),
    'utf8',
  );
  const turbo = readFileSync(
    new URL('../../turbo.json', import.meta.url),
    'utf8',
  );
  assert.match(
    turbo,
    /"test:shard":\s*\{\s*"dependsOn": \["\/\/#env:check", "\^build"\]/,
  );
  assert.match(
    workflow,
    /bunx turbo run test:shard --filter=@genfeedai\/ui --concurrency=1 -- "\$UI_SHARD"/,
  );
  assert.match(workflow, /if \[ -z "\$\{WORKSPACE_FILTERS\}" \]; then/);
  assert.match(workflow, /id: formatting\n {8}background: true/);
  assert.match(workflow, /name: Wait for formatting\n {8}wait: formatting/);
  assert.ok(
    workflow.indexOf('wait: formatting') <
      workflow.indexOf('- name: Run typecheck'),
  );
});

test('the API test job runs every full-tier shard at once and the gate still needs it', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/_ci-validation.yml', import.meta.url),
    'utf8',
  );
  const apiJob = workflow.slice(
    workflow.indexOf('\n  test-api:\n'),
    workflow.indexOf('\n  cloud-tenant-guard:\n'),
  );
  const maxParallel = Number(apiJob.match(/max-parallel: (\d+)/)?.[1]);
  const fullPlan = createPrTestPlan({
    changedFiles: ['bun.lock'],
    runHeavy: true,
  });
  assert.ok(maxParallel >= fullPlan.apiTests.shards);
  assert.match(
    workflow,
    /TEST_API_RESULT: \$\{\{ needs\.test-api\.result \}\}/,
  );
});

test('benchmarks shared action changes alongside their conservative full coverage', () => {
  const setup = createPrTestPlan({
    changedFiles: ['.github/actions/setup-bun-env/action.yml'],
  });
  assert.equal(setup.setupBenchmark, true);
  assert.equal(setup.forceFull, true);
  assert.equal(
    createPrTestPlan({ changedFiles: ['docs/testing.md'] }).setupBenchmark,
    false,
  );
});

test('plans actual MCP authorization independently of unit-file discovery', () => {
  for (const file of [
    'apps/server/mcp/src/main.ts',
    'apps/server/api/src/auth/auth.module.ts',
    'packages/prisma/prisma/schema.prisma',
    'apps/web/app/oauth/consent/page.tsx',
    'scripts/ci/mcp-auth-runtime.mjs',
    '.github/workflows/ci.yml',
    '.github/actions/setup-bun-env/action.yml',
    'bun.lock',
    'package.json',
    'patches/transport.patch',
  ]) {
    assert.equal(appliesMcpAuthRuntime([file]), true, file);
    assert.equal(
      createPrTestPlan({ base: 'master', changedFiles: [file], apiTests: [] })
        .mcpAuthRuntime,
      true,
      file,
    );
  }
  assert.equal(appliesMcpAuthRuntime(['docs/example.md']), false);
  assert.equal(appliesMcpAuthRuntime(['docs/example.md'], true), true);
  assert.equal(appliesMcpAuthRuntime(['docs/example.md'], false, true), true);
  assert.equal(appliesMcpAuthRuntime(undefined), true);
});
