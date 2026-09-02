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

test('scopes surfaces by diff on pull requests and merge-queue runs, forces them elsewhere', () => {
  // A merge-queue run diffs the PR against the *current* master (its queue
  // base), so the classification is at least as precise as the PR run's; only
  // landed-trunk and release events lose the diff and force every surface.
  assert.equal(isChangeRunEvent('pull_request'), true);
  assert.equal(isChangeRunEvent('merge_group'), true);
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

test('a full-suite escalation carries no separate coverage plan', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['bun.lock'],
    runHeavy: true,
  });

  assert.equal(plan.forceFull, true);
  assert.deepEqual(plan.apiTests.matrix, { include: [] });
  // Changed coverage rides the changed-test shards themselves (#1969); a
  // side coverage matrix would re-run the same selection instrumented and
  // drift out of sync with the shards that actually gate the merge.
  assert.equal('coverageMatrix' in plan.apiTests, false);
  assert.equal('coverageShards' in plan.apiTests, false);
  assert.equal('coverageMatrix' in plan.appTests, false);
  assert.equal('coverageShards' in plan.appTests, false);
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
    /name: Upload pull-request test plan[\s\S]*?actions\/upload-artifact@[0-9a-f]{40} # v7\.\d+\.\d+/,
  );

  // Changed coverage is folded into the changed-test shards (#1969): the
  // same `--changed` selection runs once, instrumented on pull requests,
  // instead of a standalone coverage matrix re-running it. The planner no
  // longer exports a coverage matrix at all.
  assert.doesNotMatch(workflow, /app_coverage_matrix|api_coverage_matrix/);
  const coverageGates = workflow.match(
    /WITH_COVERAGE: \$\{\{ github\.event_name == 'pull_request' \}\}/g,
  );
  assert.equal(
    coverageGates?.length ?? 0,
    2,
    'both changed-test jobs must gate coverage instrumentation on pull_request',
  );
});

test('workspace-group jobs gate on planner outputs alone, so pushes run them', () => {
  const workflowPath = fileURLToPath(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
  );
  const workflow = readFileSync(workflowPath, 'utf8');

  // A `github.event_name == 'pull_request'` clause in these gates silently
  // skipped every packages/server/web test on pushes to master: red
  // workspaces rode the trunk with no job to catch them. The planner output
  // already carries the per-event truth (affected tasks against the PR base
  // on pull requests, against `github.event.before` on pushes) — the gates
  // must key off it and nothing else.
  for (const output of [
    'packages',
    'server_services',
    'web_desktop_mobile',
    'extensions',
  ]) {
    assert.match(
      workflow,
      new RegExp(
        `\\|\\| needs\\.test-scope\\.outputs\\.${output} == 'true'\\)`,
      ),
      `${output} gate must not require a pull_request event`,
    );
  }

  // The --affected run steps need a diff base on push and merge-queue events
  // too. One workflow-level `CI_BASE_SHA` resolves it per event (queue base →
  // PR base → previous master head) and every step reads that variable, so a
  // new event type is wired in exactly one place.
  assert.match(
    workflow,
    /CI_BASE_SHA: \$\{\{ github\.event_name == 'merge_group' && github\.event\.merge_group\.base_sha \|\| github\.event\.pull_request\.base\.sha \|\| github\.event\.before \|\| '' \}\}/,
    'CI_BASE_SHA must resolve merge_group → pull_request → push in that order',
  );
  const baseReads = workflow.match(/BASE="\$CI_BASE_SHA"/g);
  assert.ok(
    (baseReads?.length ?? 0) >= 6,
    'every --affected/--changed run step must read its diff base from CI_BASE_SHA',
  );
  assert.doesNotMatch(
    workflow,
    /BASE="\$\{\{ github\.event\.pull_request\.base\.sha/,
    'no run step may resolve its own diff base from the PR payload',
  );
  assert.match(
    workflow,
    /pr-test-plan\.mjs --event "\$\{\{ github\.event_name \}\}" --base "\$CI_BASE_SHA"/,
    'the planner must diff against CI_BASE_SHA',
  );
});

test('the merge queue re-runs the gate on the queue merge commit', () => {
  const workflowPath = fileURLToPath(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
  );
  const workflow = readFileSync(workflowPath, 'utf8');

  // #3143: `master` merges through the GitHub merge queue. Without a
  // `merge_group` trigger no required context ever reports on the queue's
  // temporary merge commit and every entry times out; without the change-run
  // gates a queue run would either skip its affected paths or diff against
  // the wrong base.
  assert.match(
    workflow,
    /^on:\n(?:.*\n)*? {2}merge_group:\n {4}types: \[checks_requested\]\n/m,
    'ci.yml must subscribe to merge_group checks_requested',
  );
  assert.match(
    workflow,
    /CI_IS_CHANGE_RUN: \$\{\{ github\.event_name == 'pull_request' \|\| github\.event_name == 'merge_group' \}\}/,
    'affected-only paths must treat merge_group like pull_request',
  );
  assert.doesNotMatch(
    workflow,
    /if \[ "\$\{\{ github\.event_name \}\}" = "pull_request" \]/,
    'run steps must gate on CI_IS_CHANGE_RUN, not on the raw event name',
  );
  // The gate that the ruleset requires must publish on queue runs as well as
  // PRs and pushes, or the queue never sees a verdict.
  assert.match(
    workflow,
    /if: \$\{\{ always\(\) && \(github\.event_name == 'pull_request' \|\| github\.event_name == 'merge_group' \|\| github\.event_name == 'push'\) \}\}/,
    'tests-gate must run on merge_group',
  );
  // A merge-queue run is never cancelled: each queue entry already has a
  // unique ref, and a cancelled run drops the entry out of the queue.
  assert.match(
    workflow,
    /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
  );
  // gitleaks-action hard-fails on merge_group ("The [merge_group] event is
  // not yet supported") — the first queue entry (#3151) failed the required
  // Gitleaks context on it. Queue runs scan the same commit range with the
  // gitleaks CLI instead; the action stays on PR and push events.
  const gitleaksJob = workflow.match(/^ {2}gitleaks:\n((?: {4}.*\n|\n)+)/m);
  assert.ok(gitleaksJob, 'ci.yml must define the gitleaks job');
  assert.match(
    gitleaksJob[1],
    /uses: gitleaks\/gitleaks-action@[0-9a-f]{40} # v\d+\.\d+\.\d+\n(?: {8}.*\n)*? {8}if: github\.event_name != 'merge_group'/,
    'gitleaks-action must not run on merge_group',
  );
  assert.match(
    gitleaksJob[1],
    /if: github\.event_name == 'merge_group'\n(?: {8}.*\n)*? {8}run: \|\n(?: {10}.*\n)*? {10}.*ghcr\.io\/gitleaks\/gitleaks:v\d+\.\d+\.\d+ git \/repo \\\n {12}--log-opts="--no-merges \$\{CI_BASE_SHA\}\.\.HEAD"/,
    'merge_group runs must scan CI_BASE_SHA..HEAD with the gitleaks CLI',
  );
});
