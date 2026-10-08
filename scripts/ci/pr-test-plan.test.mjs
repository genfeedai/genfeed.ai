import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  appliesMcpAuthRuntime,
  classifyChangedFiles,
  createPrTestPlan,
  createShardMatrix,
  isChangeRunEvent,
  parseTurboDryRun,
  parseVitestList,
  readChangedFiles,
  selectShardCount,
} from './pr-test-plan.mjs';
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
  const packageLegs = plan.workspaceMatrix.include.filter(
    ({ group }) => group === 'packages',
  );
  assert.equal(packageLegs.length, 4);
  assert.deepEqual(
    packageLegs.map(({ ui_shard }) => ui_shard),
    ['1/4', '2/4', '3/4', '4/4'],
  );
  const selected = packageLegs.flatMap(({ filters }) =>
    filters
      .split(' ')
      .filter(Boolean)
      .map((filter) => `${filter.slice('--filter='.length)}#test`),
  );
  selected.push('@genfeedai/ui#test');
  assert.deepEqual(
    selected.sort(),
    allPackageTestTasks(
      fileURLToPath(new URL('../..', import.meta.url)),
    ).sort(),
  );
  assert.deepEqual(
    plan.workspaceMatrix.include
      .filter(({ group }) => group !== 'packages')
      .map(({ group }) => group),
    ['browser-extension', 'server', 'web'],
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
      'ide-extension': [],
      packages: ['@genfeedai/contracts#test'],
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
    'browser-extension': false,
    'ide-extension': false,
    packages: true,
    server: false,
    web: true,
  });
  assert.deepEqual(
    plan.workspaceMatrix.include.map((leg) => leg.group),
    ['packages', 'web'],
  );
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

test('master-heavy plans activate browser tests and keep IDE dormant', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: [],
    forceAllSurfaces: true,
    runHeavy: true,
    turboTasks: {
      'browser-extension': ['@genfeedai/extension-browser#test'],
      'ide-extension': ['extension-ide#test'],
    },
  });

  assert.equal(plan.workspaceGroups['browser-extension'], true);
  assert.equal(plan.workspaceGroups['ide-extension'], false);
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
    5,
    'static checks, workspace, app, API, and build jobs read the planned base',
  );
  assert.match(workflow, /merge_group:\n {4}types: \[checks_requested\]/);
  assert.match(workflow, /git merge-base --is-ancestor "\$\{base\}" HEAD/);
  // PR runs carry no coverage instrumentation; full-repository coverage
  // stays in the weekly Coverage workflow.
  assert.doesNotMatch(workflow, /--coverage/);
});

test('direct browser source and config changes fail closed with an empty task graph', () => {
  for (const file of [
    'apps/extensions/browser/app/components/sidebar.tsx',
    'apps/extensions/browser/app/package.json',
    'apps/extensions/browser/app/scripts/build-icon.mjs',
  ]) {
    const plan = createPrTestPlan({ base: 'base-sha', changedFiles: [file] });
    assert.deepEqual(plan.workspaceMatrix.include, [
      {
        group: 'browser-extension',
        name: 'browser-extension',
        ui_shard: '',
        filters: '--filter=@genfeedai/extension-browser',
      },
    ]);
    assert.equal(plan.workspaceGroups['ide-extension'], false);
  }
});

test('affected browser dependencies activate only the browser workspace leg', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['packages/contracts/src/interfaces/example.ts'],
    turboTasks: { 'browser-extension': ['@genfeedai/extension-browser#test'] },
  });
  assert.deepEqual(plan.workspaceMatrix.include, [
    {
      group: 'browser-extension',
      name: 'browser-extension',
      ui_shard: '',
      filters: '--filter=@genfeedai/extension-browser',
    },
  ]);
});

test('IDE-only changes and unrelated docs do not activate extension tests', () => {
  for (const file of ['apps/extensions/ide/package.json', 'docs/testing.md']) {
    const plan = createPrTestPlan({
      base: 'base-sha',
      changedFiles: [file],
      turboTasks: { 'ide-extension': ['extension-ide#test'] },
    });
    assert.deepEqual(plan.workspaceMatrix.include, []);
    assert.equal(plan.workspaceGroups['browser-extension'], false);
    assert.equal(plan.workspaceGroups['ide-extension'], false);
  }
});

test('existing workspace groups retain affected-task applicability and declared order', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['docs/testing.md'],
    turboTasks: {
      web: ['@genfeedai/website#test'],
      server: ['@genfeedai/worker#test'],
      packages: ['@genfeedai/contracts#test'],
      'browser-extension': ['@genfeedai/extension-browser#test'],
    },
  });
  assert.deepEqual(
    plan.workspaceMatrix.include.map(({ group }) => group),
    ['browser-extension', 'packages', 'server', 'web'],
  );
});

test('browser workspace legs run the full filtered suite while other groups retain affected selection', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );
  const workspaceStep = workflow.slice(
    workflow.indexOf('      - name: Run workspace tests'),
    workflow.indexOf('\n  # App tests.'),
  );
  assert.match(workspaceStep, /WORKSPACE_GROUP: \$\{\{ matrix\.group \}\}/);
  assert.match(
    workspaceStep,
    /if \[ "\$\{WORKSPACE_GROUP\}" = "browser-extension" \] \|\| \[ "\$\{FORCE_FULL\}" = "true" \] \|\| \[ -z "\$\{CI_BASE_SHA\}" \]; then\n {12}bunx turbo run test --continue --concurrency=1 \$\{WORKSPACE_FILTERS\}\n {10}else\n {12}TURBO_SCM_BASE="\$\{CI_BASE_SHA\}" bunx turbo run test --continue --concurrency=1 --affected \$\{WORKSPACE_FILTERS\}\n {10}fi/,
  );
});

test('server workspace leg runs the workers cron specs with affected selection', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
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

test('UI shards retain the environment gate, dependency builds, distinct cache arguments and failure semantics', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
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
    'apps/app/app/oauth/consent/page.tsx',
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
