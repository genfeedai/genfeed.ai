import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { RECOVERY_GREEN_THRESHOLD } from './scheduled-failure-tracker.mjs';

import './install-visual-runtime-deps.test.mjs';
import './coverage-failure-reporter.test.mjs';
import './cla-status-recovery.test.mjs';
import './full-suite-evidence.test.mjs';
import './nightly-e2e-failure-reporter.test.mjs';
import './nightly-playwright-full-failure-reporter.test.mjs';
import './playwright-full-nightly.test.mjs';
import './runtime-acceptance.test.mjs';
import './mcp-auth-runtime.test.mjs';
import './mcp-auth-network-guard.test.mjs';
import './scheduled-failure-tracker.test.mjs';
import './scheduled-suite-ownership.test.mjs';
import './selfhosted-auth-readiness.test.mjs';
import './selfhosted-schedule-readiness.test.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WORKFLOWS_DIRECTORY = path.join(REPOSITORY_ROOT, '.github', 'workflows');
const { parse: parseYaml } = createRequire(
  new URL('../../apps/server/api/package.json', import.meta.url),
)('yaml');
const CANCELLABLE_PULL_REQUEST_WORKFLOWS = [
  'ci.yml',
  'curated-action-catalog.yml',
  'dependency-review.yml',
  'playwright-coverage-policy.yml',
  'playwright-pr-smoke.yml',
  'pr-heavy-ci.yml',
  'selfhosted-install-contract.yml',
  'visual-code-isolation.yml',
];

function readWorkflow(fileName) {
  return readFileSync(path.join(WORKFLOWS_DIRECTORY, fileName), 'utf8');
}

function directPullRequestWorkflows() {
  return readdirSync(WORKFLOWS_DIRECTORY)
    .filter((fileName) => /\.ya?ml$/.test(fileName))
    .filter((fileName) => /^ {2}pull_request:/m.test(readWorkflow(fileName)))
    .sort();
}

function jobBlock(workflow, jobId, fileName) {
  const match = workflow.match(
    new RegExp(`^ {2}${jobId}:\\n((?: {4}.*(?:\\n|$)|\\n)+)`, 'm'),
  );
  assert.ok(match, `${fileName} must define the ${jobId} job`);
  return match[1];
}

function topLevelConcurrencyBlock(workflow, fileName) {
  const match = workflow.match(/^concurrency:\n((?: {2}.*(?:\n|$))+)/m);
  assert.ok(match, `${fileName} must define top-level concurrency`);
  return match[1];
}

test('direct PR workflows cancel only within one PR or complete ref', () => {
  const workflows = directPullRequestWorkflows();
  assert.deepEqual(
    workflows,
    CANCELLABLE_PULL_REQUEST_WORKFLOWS,
    'new PR workflows need an explicit replacement-contract review',
  );

  for (const fileName of workflows) {
    const workflow = readWorkflow(fileName);
    if (fileName === 'ci.yml') {
      const parsed = parseYaml(workflow);
      assert.equal(parsed.concurrency, undefined);
      for (const id of ['core', 'frontend']) {
        assert.equal(
          parsed.jobs[id].concurrency['cancel-in-progress'],
          "${{ github.event_name == 'pull_request' }}",
        );
      }
      continue;
    }
    const concurrency = topLevelConcurrencyBlock(workflow, fileName);
    const group = concurrency.match(/^ {2}group: (.+)$/m)?.[1];

    assert.ok(group, `${fileName} must define a concurrency group`);
    if (fileName === 'ci.yml') {
      assert.match(
        concurrency,
        /^ {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m,
        'ci.yml must cancel superseded pull request runs without cancelling master runs',
      );
    } else {
      assert.match(
        concurrency,
        /^ {2}cancel-in-progress: true$/m,
        `${fileName} must cancel work superseded within its isolated group`,
      );
    }
    assert.doesNotMatch(
      group,
      /github\.(?:head_ref|ref_name|sha)/,
      `${fileName} must not group by a fork-colliding branch name or per-SHA key`,
    );
    assert.match(
      group,
      /github\.(?:ref|event\.pull_request\.number)/,
      `${fileName} must isolate sibling PRs and distinct refs`,
    );
    if (/^ {4}paths:\n/m.test(workflow)) {
      assert.match(
        workflow,
        new RegExp(
          `^ {6}- ['"]?\\.github/workflows/${fileName.replaceAll('.', '\\.')}['"]?$`,
          'm',
        ),
        `${fileName} must trigger when its own routing contract changes`,
      );
    }
  }
});

test('keeps privileged PR triggers limited to metadata and trusted master code', () => {
  const targetWorkflows = readdirSync(WORKFLOWS_DIRECTORY)
    .filter((fileName) => /\.ya?ml$/.test(fileName))
    .filter((fileName) =>
      /^ {2}pull_request_target:/m.test(readWorkflow(fileName)),
    )
    .sort();

  assert.deepEqual(targetWorkflows, [
    'cla-status-recovery.yml',
    'pr-title.yml',
  ]);
  const title = jobBlock(
    readWorkflow('pr-title.yml'),
    'conventional-title',
    'pr-title.yml',
  );
  assert.deepEqual(
    parseYaml(readWorkflow('pr-title.yml')).jobs['conventional-title']
      .permissions,
    { 'pull-requests': 'read' },
  );
  assert.doesNotMatch(title, /uses: actions\/checkout@/);
  assert.doesNotMatch(title, /uses: \.\//);
  const cla = readWorkflow('cla-status-recovery.yml');
  assert.match(
    cla,
    /^permissions:\n {2}contents: read\n {2}pull-requests: read\n {2}statuses: read$/m,
  );
  assert.match(
    cla,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
  );
  assert.match(cla, /persist-credentials: false/);
  assert.doesNotMatch(cla, /pull_request\.head|uses: \.\//);
});

test('enforces executable contracts through the aggregate suite', () => {
  // #1011 still requires CI to block new hard-coded content cron/action/publish
  // paths. Those scanners, Bull Board parity, and relation-alias ratchets run
  // from `test:executable-contracts` so a dead rule is deleted with its test.
  const workflow = readWorkflow('_ci-validation.yml');
  const staticChecks = jobBlock(workflow, 'static-checks', 'ci.yml');
  const packageJson = JSON.parse(
    readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  );
  const script = packageJson.scripts['test:executable-contracts'];
  const contracts = readFileSync(
    path.join(REPOSITORY_ROOT, 'scripts/ci/executable-contracts.test.ts'),
    'utf8',
  );

  assert.match(
    staticChecks,
    /^ {8}run: bun run test:executable-contracts$/m,
    'the static-checks job must run the executable-contracts test script',
  );
  assert.match(
    staticChecks,
    /^ {6}- name: Build contracts for executable imports\n {8}run: bun run --cwd packages\/contracts build$/m,
    'metadata-only checks must build real contracts exports before runtime imports',
  );
  assert.ok(
    staticChecks.indexOf('- name: Build contracts for executable imports') <
      staticChecks.indexOf('- name: Run executable contracts'),
    'contracts build must precede executable runtime imports',
  );
  assert.match(
    script,
    /scripts\/ci\/vitest\.config\.ts/,
    'test:executable-contracts must run the CI vitest suite',
  );
  assert.match(
    script,
    /scripts\/architecture\/vitest\.config\.ts/,
    'test:executable-contracts must run architecture checker tests',
  );
  for (const contractTest of [
    'scripts/ci/hosted-saas-handoff.test.mjs',
    'scripts/ci/pr-validation-workflows.test.mjs',
  ]) {
    assert.match(
      script,
      new RegExp(contractTest.replaceAll('/', '\\/')),
      `test:executable-contracts must keep ${contractTest} instead of a new named CI guard`,
    );
  }

  const architecture = readFileSync(
    path.join(REPOSITORY_ROOT, 'scripts/check-architecture.ts'),
    'utf8',
  );
  assert.match(contracts, /'check:architecture'/);
  for (const token of [
    'check:cron-boundary',
    'check:legacy-cron-surface',
    'check:product-workflow-boundary',
    'check:bull-board-parity',
    'check:deterministic-locale',
    'check:route-shadowing',
    'check:agent-tool-dispatch',
    'check:action-versions',
    'check:project-references',
  ]) {
    const command = packageJson.scripts[token].split(' ').at(-1);
    assert.ok(
      architecture.includes(command),
      `architecture bundle must still invoke ${token}`,
    );
    assert.ok(
      !contracts.includes(`'${token}'`),
      `${token} must have only one contract owner`,
    );
  }

  for (const token of [
    'check:ui-guards',
    'check:relation-alias-reads',
    'check:relation-alias-writes',
    'check:runtime-complexity',
    'check:import-cycles',
  ]) {
    assert.match(
      contracts,
      new RegExp(`'${token}'`),
      `executable-contracts.test.ts must still invoke ${token}`,
    );
  }
});

test('consolidates static validation into one runner slot', () => {
  // #1969: five ~1-minute jobs (format, secretlint, guards, lint, typecheck)
  // each burned a runner slot per PR and starved the org-wide pool at peak —
  // measured queue waits of 8–19 minutes for sub-minute jobs. They now run
  // sequentially inside one static-checks job, with gitleaks folded in too.
  // The tests gate reads static-checks directly, so any red static check still
  // fails the gate.
  const workflow = readWorkflow('_ci-validation.yml');
  const staticChecks = jobBlock(workflow, 'static-checks', 'ci.yml');

  assert.match(staticChecks, /^ {4}name: Static Checks$/m);
  assert.match(staticChecks, /bun run format:check/);
  assert.match(staticChecks, /secretlint/);
  assert.match(staticChecks, /bunx turbo run lint/);
  assert.match(staticChecks, /bunx turbo run type-check/);
  assert.match(staticChecks, /bun run test:executable-contracts/);
  assert.doesNotMatch(
    staticChecks,
    /run: bun run check:(?:ui-guards|architecture)/,
  );
  assert.match(
    staticChecks,
    /uses: gitleaks\/gitleaks-action@[0-9a-f]{40} # v\d+\.\d+\.\d+/,
  );

  for (const retired of [
    'format',
    'lint',
    'typecheck',
    'guards',
    'secretlint',
    'gitleaks',
    'trust',
    'test-scope',
    'openapi-drift',
  ]) {
    assert.doesNotMatch(
      workflow,
      new RegExp(`^ {2}${retired}:\\n`, 'm'),
      `the standalone ${retired} job must stay folded into static-checks`,
    );
  }

  const build = jobBlock(workflow, 'build', 'ci.yml');
  assert.match(
    build,
    /^ {4}needs: plan$/m,
    'build must start straight off the plan instead of queueing behind statics',
  );
  assert.match(
    build,
    /scripts\/emit-openapi\.ts/,
    'build owns the OpenAPI gate',
  );
  assert.match(
    workflow,
    /^ {10}STATIC_CHECKS_RESULT: \$\{\{ needs\.static-checks\.result \}\}$/m,
    'tests-gate must read the static-checks result directly',
  );
});

test('adopts a fair pull-request validation budget with a stricter ratchet target', () => {
  const budget = JSON.parse(
    readFileSync(
      path.join(REPOSITORY_ROOT, 'scripts', 'ci', 'pr-validation-budget.json'),
      'utf8',
    ),
  );

  assert.equal(budget.version, 1);
  assert.equal(budget.issue, 1850);
  assert.equal(budget.mode, 'operating');
  assert.deepEqual(budget.measurement, {
    sampleUnit: 'distinct-latest-pr-head',
    scope: 'changed-scope',
    scopeDefinition: {
      planner: 'scripts/ci/pr-test-plan.mjs',
      gate: 'scripts/ci/tests-gate.mjs',
    },
    startTimestamp: 'workflow-created-at',
    endTimestamp: 'tests-gate-completed-at',
    qualifyingDisposition:
      'tests-gate-success-with-all-applicable-jobs-resolved',
    minimumSuccessfulHeads: 50,
    percentileMethod: 'nearest-rank',
    surfaceReporting: 'report-per-surface-and-aggregate',
  });
  assert.deepEqual(budget.operatingBudgetMinutes, {
    median: 10,
    p95: 20,
  });
  assert.deepEqual(budget.ratchetTargetMinutes, {
    median: 8,
    p95: 15,
  });
  assert.deepEqual(budget.runnerWaste, {
    status: 'fresh-fixed-baseline-required',
    minimumReductionPercent: 50,
    sampleUnit: 'superseded-runner-minutes',
    baselineRule:
      'Use one fixed pre-change window and compare the same workflows, events, and exact-head disposition definitions after the change.',
    incompleteEvidence: 'does-not-pass',
  });
  assert.deepEqual(budget.fullSuite, {
    status: 'observe-separately',
    minimumSuccessfulHeadsBeforeBudgetAdoption: 50,
  });
  assert.deepEqual(budget.mergeGroup, {
    status: 'observe-separately',
    minimumSuccessfulHeadsBeforeBudgetAdoption: 50,
  });
  assert.deepEqual(budget.exclusions, {
    allowed: ['documented-github-wide-runner-incident'],
    maximumExcludedHeadsPercent: 5,
    internalRunnerSaturation: 'included',
    failedCancelledSkippedOrIncomplete: 'never-counted-as-passing',
  });
  assert.deepEqual(budget.consumer, {
    type: 'reviewed-contract-and-run-metadata-audit',
    enforcement:
      'No compliance verdict is valid below the minimum sample; threshold changes are enforced by scripts/ci/pr-validation-workflows.test.mjs.',
  });
  assert.equal(
    budget.changeRule,
    'After this initial adoption, latency budgets may only tighten. Any increase requires a reviewed contract diff, linked evidence, and an appended history entry.',
  );

  assert.equal(budget.history.length, 1);
  const latest = budget.history.at(-1);
  assert.equal(latest.adoptedAt, '2026-08-26');
  assert.equal(latest.issue, 1850);
  assert.deepEqual(
    latest.operatingBudgetMinutes,
    budget.operatingBudgetMinutes,
  );
  assert.deepEqual(latest.ratchetTargetMinutes, budget.ratchetTargetMinutes);
  assert.equal(
    latest.runnerWasteMinimumReductionPercent,
    budget.runnerWaste.minimumReductionPercent,
  );
  assert.deepEqual(latest.evidence, {
    status: 'preliminary-not-a-compliance-window',
    complianceVerdict: 'insufficient-sample',
    auditSource:
      'https://github.com/genfeedai/genfeed.ai/issues/1969#issuecomment-5412802660',
    query:
      'GitHub Actions REST pull_request runs plus per-run Tests Gate job timestamps',
    windowStart: '2026-08-25T17:01:39Z',
    windowEnd: '2026-08-25T23:07:48Z',
    completedRuns: 27,
    successfulRuns: 6,
    successfulRunIds: [
      32908568338, 32906926837, 32905631064, 32904547589, 32902363083,
      32896295975,
    ],
    observedMedianMinutes: 9.64,
    observedP95Minutes: 19.02,
  });
  assert.ok(
    latest.evidence.successfulRuns < budget.measurement.minimumSuccessfulHeads,
  );
});

test('caps the recursively reachable CI runnable inventory at nineteen jobs', () => {
  const graph = new Map([
    ['ci.yml', new Set(['_ci-validation.yml', '_ci-frontend.yml'])],
    ['_ci-validation.yml', new Set()],
    ['_ci-frontend.yml', new Set(['_bundle-size.yml'])],
    ['_bundle-size.yml', new Set()],
  ]);
  const seen = new Set();
  function count(file) {
    assert.ok(graph.has(file), 'unknown helper graph');
    assert.ok(!seen.has(file), 'duplicate or cyclic helper');
    seen.add(file);
    let runners = 0;
    for (const job of Object.values(parseYaml(readWorkflow(file)).jobs)) {
      if (job.uses) {
        const child = job.uses.match(/^\.\/\.github\/workflows\/([^/]+)$/)?.[1];
        assert.ok(graph.get(file).has(child), 'unbounded caller edge');
        runners += count(child);
      } else {
        assert.equal(job['runs-on'], 'ubuntu-latest');
        runners++;
      }
    }
    return runners;
  }
  assert.equal(count('ci.yml'), 19);
  assert.equal(seen.size, 4);
});

test('reusable CI callers grant the failure tracker permission ceiling', () => {
  // GitHub validates every called job before evaluating its `if` expression.
  // A caller that omits issues:write startup-fails even when the
  // schedule-only tracker would be skipped for that caller's event.
  for (const [fileName, jobId] of [
    ['full-suite.yml', 'ci'],
    ['pr-heavy-ci.yml', 'full-suite'],
  ]) {
    const caller = jobBlock(readWorkflow(fileName), jobId, fileName);

    assert.match(
      caller,
      /^ {6}issues: write$/m,
      `${fileName} must let reusable ci.yml grant issues:write to its failure tracker`,
    );
  }
});

test('the full suite runs on demand and at release, never on push, and never cancels a run', () => {
  const workflow = readWorkflow('full-suite.yml');

  // It competed with pull-request CI for runners on every merge (2026-10-03).
  // A cron cadence was tried earlier and dropped: this repository's scheduled
  // workflows start hours late.
  assert.doesNotMatch(workflow, /^ {2}push:/m);
  assert.doesNotMatch(workflow, /^ {2}schedule:/m);
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
  assert.match(workflow, /^ {2}workflow_call:$/m);
  assert.match(
    topLevelConcurrencyBlock(workflow, 'full-suite.yml'),
    /^ {2}cancel-in-progress: false$/m,
  );
});

test('master SHA verdict fails closed for incomplete required verification', () => {
  const workflow = readWorkflow('full-suite.yml');
  assert.match(
    workflow,
    /^run-name: Full Suite · \$\{\{ github\.ref_name \}\}$/m,
  );
  const verdict = jobBlock(workflow, 'master-sha-verdict', 'full-suite.yml');
  assert.match(verdict, /^ {4}name: Master SHA Verdict$/m);
  assert.match(verdict, /^ {4}if: always\(\)$/m);
  assert.match(
    verdict,
    /needs: \[ci, build-verify, e2e, visual-connected, runtime-acceptance-gate\]/,
  );
  const script = verdict
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  const ordinary = {
    CI_RESULT: 'success',
    BUILD_RESULT: 'success',
    E2E_RESULT: 'success',
    VISUAL_RESULT: 'skipped',
    CONNECTED_RESULT: 'skipped',
    RUN_CONNECTED: 'false',
  };
  const connected = {
    ...ordinary,
    RUN_CONNECTED: 'true',
    VISUAL_RESULT: 'success',
    CONNECTED_RESULT: 'success',
  };
  for (const green of [ordinary, connected]) {
    assert.equal(spawnSync('bash', ['-c', script], { env: green }).status, 0);
    const required = [
      'CI_RESULT',
      'BUILD_RESULT',
      'E2E_RESULT',
      ...(green.RUN_CONNECTED === 'true'
        ? ['VISUAL_RESULT', 'CONNECTED_RESULT']
        : []),
    ];
    for (const key of required) {
      for (const result of [
        'failure',
        'cancelled',
        'skipped',
        'abandoned',
        '',
      ]) {
        assert.notEqual(
          spawnSync('bash', ['-c', script], {
            env: { ...green, [key]: result },
          }).status,
          0,
          `${key}=${result} cannot verify a SHA`,
        );
      }
    }
  }
  for (const key of ['VISUAL_RESULT', 'CONNECTED_RESULT']) {
    for (const result of ['success', 'failure', 'cancelled']) {
      assert.notEqual(
        spawnSync('bash', ['-c', script], {
          env: { ...ordinary, [key]: result },
        }).status,
        0,
      );
    }
  }
});

test('e2e nightly-only lanes never fire under a cron-triggered caller', () => {
  // A called workflow inherits the caller's event, so under a cron-triggered
  // caller a bare `github.event_name == 'schedule'` would file nightly
  // trackers and run nightly-only lanes on the caller's cadence.
  const workflow = readWorkflow('e2e.yml');
  const bareSchedule = workflow
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .filter(
      (line) =>
        /github\.event_name [!=]= 'schedule'/.test(line) &&
        !line.includes("github.workflow == 'E2E Tests'"),
    );

  assert.deepEqual(bareSchedule, []);
});

test('draft pull requests run no CI until marked ready', () => {
  for (const [fileName, jobId] of [
    ['_ci-validation.yml', 'plan'],
    ['playwright-pr-smoke.yml', 'detect'],
  ]) {
    const workflow = readWorkflow(fileName);
    assert.match(
      fileName === '_ci-validation.yml' ? readWorkflow('ci.yml') : workflow,
      /^ {4}types: \[opened, synchronize, reopened, ready_for_review\]$/m,
      `${fileName} must run when a draft is marked ready`,
    );
    assert.match(
      jobBlock(workflow, jobId, fileName),
      /^ {4}if: github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft$/m,
      `${fileName} must skip draft pull requests`,
    );
  }
});

test('the full suite grants its reusable E2E failure reporter permission ceiling', () => {
  // e2e.yml reads jobs from its current run to report exact scheduled failures.
  // GitHub validates this permission before starting any called job, so omitting
  // it makes the entire Full Suite fail at startup with no job logs.
  const caller = jobBlock(
    readWorkflow('full-suite.yml'),
    'e2e',
    'full-suite.yml',
  );

  assert.match(
    caller,
    /^ {6}actions: read$/m,
    'full-suite.yml must let reusable e2e.yml read its current run jobs',
  );
});

// The curated action catalog decides whether a product action is exposed on
// Agent, MCP, or both. Its reporter shipped with unit coverage and a
// `catalog:changes` package script but no caller, so surface transitions landed
// with no reviewer-facing diff. This pins the wiring, not just the script.
test('reports curated action catalog changes on catalog pull requests', () => {
  const workflow = readWorkflow('curated-action-catalog.yml');

  assert.match(workflow, /^ {2}pull_request:\n/m);
  for (const pathFilter of [
    'packages/actions/src/registry/curated-action-catalog.ts',
    'packages/actions/scripts/report-curated-action-catalog.ts',
  ]) {
    assert.ok(
      workflow.includes(`      - "${pathFilter}"\n`),
      `curated-action-catalog.yml must stay reachable for ${pathFilter}`,
    );
  }

  // Full history, or `git show <base-sha>:<catalog>` cannot resolve the
  // pre-change copy the reporter diffs against.
  assert.match(workflow, /^ {10}fetch-depth: 0$/m);
  assert.match(
    workflow,
    /run: \|\n {10}bun run --filter=@genfeedai\/actions catalog:changes \\/m,
    'the report job must invoke the reporter through its package script',
  );
  // Without --summary the report exists only in raw job logs.
  assert.match(workflow, /--summary="\$GITHUB_STEP_SUMMARY"/m);
});

test('runs desktop QA weekly and for release callers', () => {
  const workflow = readWorkflow('desktop-qa.yml');

  // The desktop shell boots the apps/app bundle, so an honest PR path filter
  // matched effectively every frontend PR — each paying a ~30 min
  // macos-latest run while the desktop surface is dormant. Weekly QA bounds
  // drift while dormant; the release path keeps its mandatory run via
  // workflow_call from desktop-release.yml.
  assert.doesNotMatch(
    workflow,
    /^ {2}pull_request:/m,
    'desktop-qa.yml must not run per pull request while the surface is dormant',
  );
  assert.match(workflow, /cron: '17 3 \* \* 1'/);
  assert.match(
    workflow,
    /group: desktop-qa-\$\{\{ github.workflow \}\}-\$\{\{ github.ref \}\}-\$\{\{ github.event_name \}\}/,
  );
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
  assert.match(workflow, /^ {2}workflow_call:$/m);
});

function imageScopeCondition(expression, context) {
  const condition = expression?.replace(/^\$\{\{\s*|\s*\}\}$/g, '') ?? 'true';
  const effective = /\b(?:success|failure|cancelled|always)\(/.test(condition)
    ? condition
    : 'success() && (' + condition + ')';
  return runInNewContext(effective, context);
}

test('server image keeps exact build inputs and fail-closed scope with bounded phases', () => {
  const root = parseYaml(readWorkflow('ci.yml'));
  const image = root.jobs['server-image'];
  const composite = parseYaml(
    readFileSync(
      path.join(
        REPOSITORY_ROOT,
        '.github/actions/build-pr-server-image/action.yml',
      ),
      'utf8',
    ),
  );
  assert.deepEqual(image.permissions, { contents: 'read' });
  assert.equal(image['timeout-minutes'], 46);
  assert.equal(image.steps[0]['timeout-minutes'], 3);
  assert.equal(image.steps[1]['timeout-minutes'], 3);
  assert.deepEqual(image.concurrency, {
    group: 'server-image-pr-${{ github.event.pull_request.number }}',
    'cancel-in-progress': true,
  });
  assert.deepEqual(parseYaml(image.steps[1].with.filters), {
    image: [
      'docker/Dockerfile.server',
      '.dockerignore',
      '.bun-version',
      'configs/**',
      'patches/**',
      'webpack.base.config.js',
      'tsconfig.json',
      'tsconfig.server.decorators.json',
      'bun.lock',
      'package.json',
      '.github/workflows/ci.yml',
      '.github/actions/build-pr-server-image/**',
    ],
  });
  assert.equal(
    image.steps[0].uses,
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  );
  assert.deepEqual(image.steps[0].with, { 'persist-credentials': false });
  assert.equal(
    image.steps[1].uses,
    'dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d',
  );
  assert.equal(image.steps[1].id, 'changes');
  assert.equal(composite.runs.using, 'composite');
  assert.deepEqual(composite.runs.steps, [
    {
      name: 'Checkout code',
      uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      with: { 'persist-credentials': false },
    },
    {
      name: 'Set up Docker Buildx',
      uses: 'docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069',
    },
    {
      name: 'Build unified server image',
      uses: 'docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc',
      with: {
        context: '.',
        file: 'docker/Dockerfile.server',
        push: false,
        'cache-from': 'type=gha,scope=server-image-pr',
        'cache-to':
          'type=gha,mode=min,scope=server-image-pr,timeout=3m,ignore-error=true',
      },
    },
  ]);
  const validation = image.steps[2];
  const branches = image.steps.slice(3);
  assert.equal(validation.if, '${{ !cancelled() }}');
  assert.equal(validation.shell, 'bash');
  assert.deepEqual(validation.env, {
    DETECT_RESULT: '${{ steps.changes.outcome }}',
    IMAGE_CHANGED: '${{ steps.changes.outputs.image }}',
  });
  assert.equal(validation['continue-on-error'], undefined);
  assert.doesNotMatch(validation.run, /\$\{\{|\beval\b/);
  assert.deepEqual(
    branches.map((step) => step.name),
    ['Skip (no image-definition change)', 'Build complete server image'],
  );
  assert.equal(branches[0].if, "steps.changes.outputs.image == 'false'");
  assert.equal(branches[1].if, "steps.changes.outputs.image == 'true'");
  assert.equal(branches[1]['timeout-minutes'], 40);
  assert.equal(branches[1].uses, './.github/actions/build-pr-server-image');
  for (const branch of branches) {
    assert.equal(branch['continue-on-error'], undefined);
    assert.doesNotMatch(branch.if, /\b(?:success|failure|cancelled|always)\(/);
  }
  for (const result of ['success', 'failure', 'cancelled', 'skipped', '']) {
    for (const value of [
      'true',
      'false',
      '',
      'malformed',
      'TRUE',
      'false\n',
      '$(exit 0)',
    ]) {
      const steps = { changes: { outcome: result, outputs: { image: value } } };
      const env = Object.fromEntries(
        Object.entries(validation.env).map(([key, expression]) => [
          key,
          runInNewContext(expression.slice(3, -2).trim(), { steps }),
        ]),
      );
      const shell = spawnSync(
        'bash',
        ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', validation.run],
        { env, encoding: 'utf8' },
      );
      assert.ifError(shell.error);
      const valid = result === 'success' && ['true', 'false'].includes(value);
      assert.equal(
        shell.status,
        valid ? 0 : 1,
        JSON.stringify({ result, value }),
      );
      assert.equal(shell.stderr, '');
      assert.equal(
        shell.stdout,
        valid ? '' : '::error::Invalid server image scope detection.\n',
      );
      for (const cancelled of [false, true]) {
        assert.equal(
          imageScopeCondition(validation.if, {
            cancelled: () => cancelled,
            success: () => result === 'success',
          }),
          !cancelled,
        );
      }
      const selected = branches
        .filter((step) =>
          imageScopeCondition(step.if, {
            steps,
            success: () => shell.status === 0,
          }),
        )
        .map((step) => step.name);
      assert.deepEqual(
        selected,
        !valid ? [] : [value === 'false' ? branches[0].name : branches[1].name],
      );
    }
  }
});

test('self-hosted publisher can PATCH the draft GitHub release', () => {
  const workflow = readWorkflow('_publish-selfhosted-core.yml');

  assert.match(
    workflow,
    /^permissions:\n {2}contents: write\n {2}packages: write$/m,
  );
  assert.match(
    workflow,
    /uses: softprops\/action-gh-release@[0-9a-f]{40} # v3\.\d+\.\d+/,
  );
  assert.ok(workflow.includes('tag_name: ${{ env.RELEASE_TAG }}'));
  assert.ok(workflow.includes('target_commitish: ${{ inputs.checkout_ref }}'));
});

test('weekly dependency updates preserve one tracked pull request', () => {
  const workflow = readWorkflow('deps-update.yml');
  const update = jobBlock(workflow, 'update', 'deps-update.yml');

  assert.match(workflow, /^ {2}schedule:\n {4}# Weekly Tuesday 6am UTC/m);
  assert.match(
    update,
    /^ {4}permissions:\n {6}contents: write\n {6}pull-requests: write$/m,
    'the weekly updater needs only branch and pull-request write access',
  );
  assert.match(update, /if git diff --quiet && git diff --cached --quiet;/);
  assert.match(
    update,
    /list_weekly_pull_requests\(\)[\s\S]*?--method GET[\s\S]*?--raw-field state=open[\s\S]*?--raw-field base=master[\s\S]*?--raw-field head="\$\{head_owner\}:\$\{branch\}"[\s\S]*?--raw-field per_page=2/,
  );
  assert.match(
    update,
    /if \(\( \$\{#pull_requests\[@\]\} > 1 \)\); then[\s\S]*?Close duplicates before retrying/,
  );
  assert.match(
    update,
    /git push \\\n {12}--force-with-lease="refs\/heads\/\$\{branch\}:\$\{previous_sha\}"/,
  );
  assert.match(
    update,
    /if \[\[ -n "\$previous_sha" \]\]; then\n {12}git fetch --no-tags origin "\$previous_sha"/,
    'the previous orphan/PR branch tip must be available for rollback',
  );
  assert.doesNotMatch(update, /git push --force\b/);
  assert.match(
    update,
    /if \(\( \$\{#pull_requests\[@\]\} == 1 \)\); then[\s\S]*?Refreshed weekly dependency PR/,
  );
  assert.match(
    update,
    /if gh pr create[\s\S]*?--base master[\s\S]*?--head "\$branch"/,
  );
  assert.match(
    update,
    /Allow GitHub Actions to create and approve pull requests[\s\S]*?--force-with-lease="refs\/heads\/\$\{branch\}:\$\{update_sha\}"/,
    'a rejected PR creation must name the repository setting and roll back the published update',
  );

  const noChanges = update.indexOf('if git diff --quiet');
  const listPullRequests = update.indexOf(
    'pull_request_numbers="$(list_weekly_pull_requests)"',
  );
  const pushBranch = update.indexOf('git push \\');
  const createPullRequest = update.indexOf('if gh pr create');
  assert.ok(
    noChanges < listPullRequests &&
      listPullRequests < pushBranch &&
      pushBranch < createPullRequest,
    'no-change exit, deduplication, branch refresh, and PR creation must stay ordered',
  );
});

test('ordinary labels do not restart CI and full-suite has an isolated dispatcher', () => {
  const ci = readWorkflow('ci.yml');
  const dispatcher = readWorkflow('pr-heavy-ci.yml');

  assert.match(
    ci,
    /^ {4}types: \[opened, synchronize, reopened, ready_for_review\]$/m,
  );
  assert.doesNotMatch(ci, /\b(?:labeled|unlabeled)\b/);
  assert.match(
    readWorkflow('_ci-validation.yml'),
    /--run-heavy "\$\{\{ steps\.tier\.outputs\.heavy \}\}"/,
  );

  assert.match(dispatcher, /^ {4}types: \[labeled\]$/m);
  assert.ok(
    dispatcher.includes(
      "group: pr-heavy-ci-${{ github.event.pull_request.number }}-${{ (github.event.label.name == 'full-suite' || github.event.label.name == 'run-ci') && 'heavy' || format('label-{0}', github.event.label.name) }}",
    ),
    'both heavy labels share a per-PR group; unrelated skipped label events stay isolated',
  );
  assert.match(dispatcher, /if: github\.event\.label\.name == 'full-suite'/);
  assert.match(dispatcher, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(dispatcher, /^ {6}run_heavy_tests: true$/m);
});

test('external contributor pull requests run the heavy tier maintainers skip', () => {
  const ci = readWorkflow('_ci-validation.yml');
  const trust = jobBlock(ci, 'plan', 'ci.yml');

  assert.match(
    trust,
    /^ {6}heavy-tier: \$\{\{ steps\.tier\.outputs\.heavy \}\}$/m,
  );
  assert.match(
    trust,
    /core\.setOutput\('external', isTrusted \? 'false' : 'true'\)/,
  );

  for (const signal of [
    /RUN_HEAVY_INPUT: \$\{\{ inputs\.run_heavy_tests \}\}/,
    /FULL_SUITE_LABEL: \$\{\{ contains\(github\.event\.pull_request\.labels\.\*\.name, 'full-suite'\) \}\}/,
    /EXTERNAL_CONTRIBUTOR: \$\{\{ steps\.check\.outputs\.external \}\}/,
  ]) {
    assert.match(
      trust,
      signal,
      'every heavy-tier escalation signal must reach the tier step',
    );
  }

  // The tier is resolved once, in the Plan job, and reaches every heavy
  // decision through the planner. A job that re-derives it from
  // `inputs.run_heavy_tests` would silently keep external contributors on the
  // affected tier.
  assert.doesNotMatch(
    ci.slice(ci.indexOf('  static-checks:')),
    /inputs\.run_heavy_tests(?![^\n]*description)/,
  );
  assert.match(trust, /--run-heavy "\$\{\{ steps\.tier\.outputs\.heavy \}\}"/);
  assert.match(
    trust,
    /RUN_HEAVY: \$\{\{ steps\.tier\.outputs\.heavy == 'true' \}\}/,
  );
});

test('spec typecheck scope escalates shared server configs before ignoring apps', () => {
  const ci = readWorkflow('_ci-validation.yml');
  const loop = ci
    .slice(ci.indexOf('declare -A affected=()'))
    .split('done <<<"${changed}"')[0];
  const branches = [...loop.matchAll(/^ {14}(\S+)\)$/gm)].map(
    (match) => match[1],
  );

  // `case` globs span `/`, so apps/server/tsconfig.typecheck.base.json misses
  // apps/server/*/* and lands on whichever branch comes next. If apps/* wins
  // that race, editing the base config every program extends scopes the ratchet
  // to nothing. Other apps and packages scope themselves before the `*`
  // escalation; packages defer to turbo's affected graph.
  assert.deepEqual(branches, [
    'apps/server/*/*',
    'apps/server/*',
    'apps/*/*',
    'docs/*|.agents/*|*.md',
    'apps/*',
    'packages/*/*',
    '*',
  ]);
});

test('reusable full-suite callers preserve planner applicability at the tests gate', () => {
  const ci = readWorkflow('_ci-validation.yml');

  for (const [environmentKey, outputKey] of [
    ['PLAN_APP_TESTS', 'app_tests'],
    ['PLAN_API_TESTS', 'api_tests'],
  ]) {
    assert.match(
      ci,
      new RegExp(
        `^ {10}${environmentKey}: \\$\\{\\{ needs\\.plan\\.outputs\\.${outputKey} \\}\\}$`,
        'm',
      ),
      `${environmentKey} must reach tests-gate from the planner`,
    );
  }

  for (const caller of ['full-suite.yml', 'pr-heavy-ci.yml']) {
    assert.match(
      readWorkflow(caller),
      /uses: \.\/\.github\/workflows\/ci\.yml/,
      `${caller} must retain the CI workflow that owns tests-gate`,
    );
  }
});

test('keeps E2E workflow concurrency while queueing the full reporter job', () => {
  const workflow = readWorkflow('e2e.yml');

  assert.match(
    topLevelConcurrencyBlock(workflow, 'e2e.yml'),
    /^ {2}group: e2e-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}-\$\{\{ github\.event_name == 'workflow_dispatch' && github\.workflow == 'E2E Tests' && inputs\.acceptance_diagnostic \|\| 'none' \}\}\n {2}cancel-in-progress: true$/m,
  );
  assert.match(
    workflow,
    /^ {2}nightly-failure-report:[\s\S]*?^ {4}concurrency:\n {6}group: nightly-e2e-failure-reporter\n {6}cancel-in-progress: false$/m,
  );
  assert.match(
    workflow,
    /name: Checkout workflow helpers[\s\S]*?persist-credentials: false[\s\S]*?nightly-e2e-failure-reporter\.mjs[\s\S]*?reportNightlyE2eFailure/,
  );
  assert.match(workflow, /^ {2}nightly-recovery-report:/m);
  assert.match(workflow, /resolveNightlyE2eFailures/);
  const report = workflow
    .split('  nightly-failure-report:')[1]
    .split('  nightly-recovery-report:')[0];
  const step = report.split(
    '- name: Create or update bounded nightly-failure trackers',
  )[1];
  assert.match(step, /REPOSITORY_TOKEN: \$\{\{ github.token \}\}/u);
  assert.match(
    step,
    /github-token: \$\{\{ steps\.reporter-token\.outputs\.token \}\}/u,
  );
  assert.match(
    report,
    /- name: Mint reporter token \(Genfeed bot App\)\n\s+id: reporter-token\n\s+uses: \.\/\.github\/actions\/reporter-token\n\s+with:\n\s+client-id: \$\{\{ secrets\.GENFEED_BOT_CLIENT_ID \}\}\n\s+private-key: \$\{\{ secrets\.GENFEED_BOT_PRIVATE_KEY \}\}\n/u,
    'reporter token must be minted from the Genfeed bot App',
  );
  assert.ok(
    report.indexOf('actions/checkout@') <
      report.indexOf('uses: ./.github/actions/reporter-token'),
    'the composite action is local, so the repository must be checked out first',
  );
  assert.doesNotMatch(report, /CONSOLE_DEPLOY_TOKEN/u);
  assert.doesNotMatch(step, /continue-on-error:/u);
});

test('serializes reusable build verification without cancelling another caller', () => {
  for (const fileName of ['build-verify.yml', 'build-verify-selfhosted.yml']) {
    const workflow = readWorkflow(fileName);
    assert.match(
      topLevelConcurrencyBlock(workflow, fileName),
      /^ {2}group: build-verify(?:-selfhosted)?-\$\{\{ github\.head_ref \|\| github\.ref_name \}\}\n {2}cancel-in-progress: false$/m,
      `${fileName} must queue shared-cache writers instead of cancelling a master or release caller`,
    );
  }
});

test('release waits for exact-SHA Full Suite evidence in the existing validation step', () => {
  const workflow = readWorkflow('release.yml');
  const validateRelease = jobBlock(workflow, 'validate-release', 'release.yml');
  const verifySuite = jobBlock(workflow, 'verify-suite', 'release.yml');

  assert.match(
    verifySuite,
    /^ {4}uses: \.\/\.github\/workflows\/full-suite\.yml$/m,
  );
  assert.match(verifySuite, /^ {4}with:\n {6}run_runtime_acceptance: true$/m);
  assert.match(validateRelease, /^ {4}timeout-minutes: 35$/m);
  assert.match(
    validateRelease,
    /- name: Check for existing Full Suite evidence[\s\S]*?run: node scripts\/ci\/full-suite-evidence\.mjs/,
  );
  assert.doesNotMatch(
    validateRelease,
    /status=success&per_page=100/,
    'release must observe queued and in-progress exact-SHA runs, not only completed successes',
  );
});

test('pins mocked core E2E builds to Community mode', () => {
  const workflow = readWorkflow('e2e.yml');
  const frontendJob = jobBlock(workflow, 'e2e-frontend', 'e2e.yml');

  assert.match(
    frontendJob,
    /uses: \.\/\.github\/actions\/setup-playwright-app/,
  );
  const setup = readFileSync(
    path.join(
      REPOSITORY_ROOT,
      '.github/actions/setup-playwright-app/action.yml',
    ),
    'utf8',
  );
  assert.match(setup, /NEXT_PUBLIC_GENFEED_CLOUD: 'false'/);
  assert.match(setup, /default: https:\/\/api\.genfeed\.ai\/v1/);
  assert.match(setup, /test-mode:[\s\S]*?default: 'true'/);
  assert.match(
    setup,
    /NEXT_PUBLIC_PLAYWRIGHT_TEST: \$\{\{ inputs.test-mode \}\}/,
  );
  assert.match(setup, /E2E_COVERAGE: '1'/);
});

test('bundle graph keeps fork measurements independent and skips drafts and duplicate heavy callers', () => {
  const ci = readWorkflow('_ci-frontend.yml');
  const shared = readWorkflow('_bundle-size.yml');
  const caller = jobBlock(ci, 'bundle-size', 'ci.yml');
  const detect = jobBlock(shared, 'detect', '_bundle-size.yml');
  const measure = jobBlock(shared, 'measure', '_bundle-size.yml');
  const comment = jobBlock(shared, 'comment', '_bundle-size.yml');
  const condition = (block) => block.match(/^ {4}if: (.+)$/m)?.[1];
  const evaluate = (expression, context) => {
    assert.ok(expression, 'missing workflow condition');
    return runInNewContext(expression, context);
  };
  for (const event of [
    'pull_request',
    'push',
    'workflow_dispatch',
    'merge_group',
  ]) {
    for (const draft of [false, true]) {
      for (const fork of [false, true]) {
        for (const heavy of [undefined, false, true]) {
          const github = {
            event_name: event,
            repository: 'example/repo',
            event: {
              pull_request: {
                draft,
                head: {
                  repo: { full_name: fork ? 'fork/repo' : 'example/repo' },
                },
              },
            },
          };
          assert.equal(
            evaluate(condition(caller), {
              github,
              inputs: { run_heavy_tests: heavy },
            }),
            event === 'pull_request' && !draft && heavy !== true,
          );
          assert.equal(
            evaluate(condition(detect), { github }),
            event !== 'pull_request' || !draft,
          );
          assert.equal(
            evaluate(condition(comment), { github }),
            event === 'pull_request' && !fork,
          );
          for (const frontend of ['true', 'false']) {
            assert.equal(
              evaluate(condition(measure), {
                needs: { detect: { outputs: { frontend } } },
              }),
              frontend === 'true',
            );
          }
        }
      }
    }
  }
  assert.doesNotMatch(caller, /needs:/);
  assert.match(detect, /permissions:\n {6}contents: read/);
  assert.doesNotMatch(detect, /: write/);
  assert.doesNotMatch(
    shared,
    /^concurrency:/m,
    'caller owns cancellation without nested self-cancellation',
  );
  assert.doesNotMatch(shared, /^ {2}(?:pull_request|push|workflow_dispatch):/m);
  assert.match(shared, /^ {2}workflow_call:/m);
  // No cross-run download or fabricated workflow identity may bridge this move.
  assert.doesNotMatch(comment, /run-id:|github-token:|repository:/);
  assert.doesNotMatch(shared, /GITHUB_WORKFLOW:|GITHUB_RUN_ID:/);
});

test('serializer diagnostic upload accepts only completed same-repo app proofs from an uncancelled run', () => {
  const shared = readWorkflow('_bundle-size.yml');
  const upload = shared
    .split('      - name: Upload request serializer proof\n')[1]
    ?.split('\n      #')[0];
  const expression = upload?.match(/if: \$\{\{ (.+) \}\}/)?.[1];
  assert.ok(expression);
  for (const outcome of ['success', 'failure', 'skipped', 'cancelled', '']) {
    for (const cancelled of [false, true]) {
      for (const app of ['app', 'website']) {
        for (const event of ['pull_request', 'push', 'workflow_dispatch']) {
          for (const fork of [false, true]) {
            const actual = runInNewContext(expression, {
              cancelled: () => cancelled,
              steps: { serializer_proof: { outcome } },
              matrix: { app },
              github: {
                event_name: event,
                repository: 'example/repo',
                event: {
                  pull_request: {
                    head: {
                      repo: { full_name: fork ? 'fork/repo' : 'example/repo' },
                    },
                  },
                },
              },
            });
            assert.equal(
              actual,
              !cancelled &&
                ['success', 'failure'].includes(outcome) &&
                app === 'app' &&
                event === 'pull_request' &&
                !fork,
            );
          }
        }
      }
    }
  }
});

test('bundle report publishing isolates write credentials from PR build code', () => {
  const workflow = readWorkflow('_bundle-size.yml');
  const measure = jobBlock(workflow, 'measure', '_bundle-size.yml');
  const comment = jobBlock(workflow, 'comment', '_bundle-size.yml');
  assert.match(measure, /permissions:\n {6}contents: read\n {4}strategy:/);
  assert.doesNotMatch(measure, /: write/);
  assert.match(measure, /uses: actions\/upload-artifact@/);
  assert.match(comment, /needs: \[detect, measure\]/);
  assert.match(
    comment,
    /github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository/,
  );
  assert.match(comment, /pull-requests: write/);
  assert.match(comment, /uses: actions\/download-artifact@/);
  assert.doesNotMatch(comment, /uses: actions\/checkout@|uses: \.\/|\brun:/);
  for (const job of [measure, comment]) {
    assert.match(job, /name: bundle-report-\$\{\{ matrix.app \}\}/);
  }
});

test('dataset job freezes inspected control before the exact candidate checkout', () => {
  const entrypoint = readWorkflow('dataset-diagnostic.yml');
  const workflow = readWorkflow('_dataset-acceptance.yml');
  for (const field of ['USER', 'PASSWORD']) {
    const service = workflow.match(
      new RegExp(`^ {10}POSTGRES_${field}: (.+)$`, 'm'),
    )?.[1];
    const job = workflow.match(
      new RegExp(`^ {6}RUNTIME_ACCEPTANCE_POSTGRES_${field}: (.+)$`, 'm'),
    )?.[1];
    assert.ok(service && job);
    assert.equal(job, service);
  }
  assert.match(workflow, /uses: \.\/\.control-actions\/setup-bun-env/);
  assert.match(entrypoint, /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(
    entrypoint,
    /^ {2}(?:pull_request|push|schedule|workflow_call):/m,
  );
  assert.match(workflow, /inputs.group == 'dataset-scale' && 40 \|\| 20/);
  assert.match(
    workflow,
    /RUNTIME_ACCEPTANCE_JOB_STARTED_MS=\$\(date \+%s%3N\)/,
  );
  const preflight = workflow.indexOf(
    'Validate control identity and freeze controller',
  );
  const freeze = workflow.indexOf(
    'cp scripts/ci/runtime-acceptance.mjs "$CONTROL_RUNNER"',
  );
  const candidate = workflow.indexOf('Checkout exact dataset candidate');
  const install = workflow.indexOf('Setup Bun environment');
  assert.ok(
    preflight > 0 &&
      preflight < freeze &&
      freeze < candidate &&
      candidate < install,
  );
  assert.match(workflow, /ref: \$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$CANDIDATE_SHA"/);
  assert.match(entrypoint, /default: smoke/);
  assert.match(entrypoint, /options:\s*- smoke\s*- profile/);
  assert.match(
    entrypoint,
    /group: \$\{\{ inputs\.mode == 'profile' && 'dataset-diagnostic' \|\| 'dataset-smoke' \}\}/,
  );
  assert.match(workflow, /--group "\$DATASET_GROUP"/);
  assert.match(workflow, /node "\$CONTROL_RUNNER" "\$DATASET_GROUP"/);
  assert.doesNotMatch(workflow, /RUNTIME_ACCEPTANCE_PUBLIC_KEY/);
  assert.doesNotMatch(
    workflow,
    /secrets: inherit|continue-on-error|passWithNoTests|upload[^\n]*raw/,
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /public\/receipt\.json/);
  assert.match(workflow, /public\/evidence\.json/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.doesNotMatch(workflow, /path:.*\*|path:.*raw\//);
});

test('final connected Full Suite is an explicit opt-in with all receipt outputs required', () => {
  const suite = readWorkflow('full-suite.yml');
  assert.equal((suite.match(/run_runtime_acceptance:/g) ?? []).length, 3);
  assert.equal((suite.match(/default: false/g) ?? []).length, 2);
  assert.match(
    jobBlock(suite, 'e2e', 'full-suite.yml'),
    /run_runtime_acceptance: \$\{\{ inputs\.run_runtime_acceptance == true \}\}/,
  );
  const visual = jobBlock(suite, 'visual-connected', 'full-suite.yml');
  assert.match(visual, /if: inputs\.run_runtime_acceptance == true/);
  assert.match(
    visual,
    /uses: \.\/\.github\/workflows\/visual-code-isolation\.yml/,
  );
  assert.match(visual, /run_connected: true/);
  assert.doesNotMatch(visual, /secrets: inherit/);
  const gate = jobBlock(suite, 'runtime-acceptance-gate', 'full-suite.yml');
  assert.match(
    gate,
    /if: always\(\) && inputs\.run_runtime_acceptance == true/,
  );
  assert.match(gate, /needs: \[ci, build-verify, e2e, visual-connected\]/);
  for (const output of [
    'runtime_acceptance_result',
    'isolation_acceptance_result',
    'connected_acceptance_result',
  ])
    assert.ok(gate.includes(output));
  for (const status of [
    'CI_RESULT',
    'BUILD_RESULT',
    'E2E_RESULT',
    'VISUAL_RESULT',
  ])
    assert.ok(gate.includes(`test "$${status}" = success`));
  for (const receipt of [
    'RUNTIME_RECEIPT',
    'ISOLATION_RECEIPT',
    'VISUAL_RECEIPT',
  ])
    assert.ok(gate.includes(`test "$${receipt}" = passed`));
});

test('serial runtime acceptance preserves ordinary E2E routing and requires receipt plus upload', () => {
  const workflow = readWorkflow('e2e.yml');
  const dispatch = workflow
    .split('  workflow_dispatch:\n')[1]
    .split('  workflow_call:\n')[0];
  assert.doesNotMatch(dispatch, /run_runtime_acceptance/);
  const runtime = jobBlock(workflow, 'runtime-acceptance', 'e2e.yml');
  assert.match(runtime, /inputs\.run_runtime_acceptance == true/);
  assert.match(runtime, /timeout-minutes: 60/);
  assert.match(runtime, /TURBO_TOKEN: ''/);
  assert.doesNotMatch(workflow, /RUNTIME_ACCEPTANCE_OWNER_CONTRACT/);
  const services = parseYaml(workflow).jobs['runtime-acceptance'].services;
  assert.equal(services.postgres.image, 'pgvector/pgvector:pg17');
  assert.equal(services.redis.image, 'redis:7');
  assert.ok(
    runtime.indexOf('Anchor acceptance job deadline') <
      runtime.indexOf('actions/checkout@'),
  );
  assert.ok(
    runtime.indexOf('Validate final prerequisites') <
      runtime.indexOf('Setup Bun environment'),
  );
  assert.match(
    runtime,
    /steps\.seal\.outputs\.result == 'passed' && steps\.upload\.outcome == 'success'/,
  );
  assert.match(runtime, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(runtime, /persist-credentials: false/);
  assert.doesNotMatch(
    runtime,
    /secrets: inherit|continue-on-error|passWithNoTests/,
  );
  const gate = jobBlock(workflow, 'e2e-gate', 'e2e.yml');
  assert.match(
    gate,
    /needs: \[e2e-route-coverage, e2e-frontend, e2e-api, runtime-acceptance, context-embedding-acceptance\]/,
  );
  assert.ok(gate.includes('needs.runtime-acceptance.outputs.result'));
  assert.match(gate, /needs\.runtime-acceptance\.result \}\}" = skipped/);
});

test('final visual proof uses separate bounded isolation and connected jobs with plaintext uploads', () => {
  const workflow = readWorkflow('visual-code-isolation.yml');
  const isolation = jobBlock(
    workflow,
    'isolation',
    'visual-code-isolation.yml',
  );
  const connected = jobBlock(
    workflow,
    'connected',
    'visual-code-isolation.yml',
  );
  assert.match(isolation, /timeout-minutes: 25/);
  assert.match(connected, /timeout-minutes: 105/);
  const diagnostic = readWorkflow('_dataset-acceptance.yml');
  for (const field of ['USER', 'PASSWORD']) {
    const expected = diagnostic.match(
      new RegExp(`^ {6}RUNTIME_ACCEPTANCE_POSTGRES_${field}: (.+)$`, 'm'),
    )?.[1];
    assert.ok(expected);
    for (const block of [isolation, connected]) {
      const value = block.match(
        new RegExp(`^ {6}RUNTIME_ACCEPTANCE_POSTGRES_${field}: (.+)$`, 'm'),
      )?.[1];
      assert.equal(value, expected);
      if (field === 'USER') assert.equal(value, 'genfeed');
    }
  }

  assert.match(connected, /if: inputs\.run_connected == true/);
  assert.match(connected, /needs: \[isolation\]/);
  assert.doesNotMatch(connected, /node --test|isolation-acceptance\.mjs/);
  assert.match(
    isolation,
    /if: inputs\.run_connected != true[\s\S]*node --test scripts\/visual-code\/\*\.test\.mjs/,
  );
  assert.match(
    isolation,
    /if: always\(\) && inputs\.run_connected != true[\s\S]*path: visual-code-artifacts\//,
  );
  for (const [group, block, budget] of [
    ['visual-isolation', isolation, 300],
    ['visual-connected', connected, 720],
  ]) {
    assert.ok(
      block.indexOf('Anchor acceptance job deadline') <
        block.indexOf('actions/checkout@'),
    );
    assert.ok(
      block.indexOf('Validate final prerequisites') <
        block.indexOf('Install verified final gVisor runtime'),
    );
    assert.ok(block.includes(`--group ${group}`));
    assert.ok(
      block.includes(`${budget}000 + RUNTIME_ACCEPTANCE_JOB_STARTED_MS`),
    );
    assert.match(block, /sha512sum -c gvisor\.tar\.zstd\.sha512/);
    assert.match(
      block,
      /sudo "\$\(command -v node\)" "\$GITHUB_WORKSPACE\/scripts\/ci\/install-visual-runtime-deps\.mjs"/,
    );
    assert.doesNotMatch(block, /sudo apt-get (update|install)/);
    assert.match(block, /genfeed-visual-code:4\.0\.530/);
    assert.match(
      block,
      /steps\.seal\.outputs\.result == 'passed' && steps\.upload\.outcome == 'success'/,
    );
    assert.match(block, /public\/receipt\.json/);
    assert.match(block, /public\/evidence\.json/);
    assert.match(block, /if-no-files-found: error/);
    assert.doesNotMatch(block, /secrets: inherit|continue-on-error/);
  }
  const budget = connected.slice(
    connected.indexOf('- name: Require remaining shared setup budget'),
    connected.indexOf('- name: Restore actual connected ffmpeg'),
  );
  assert.match(budget, /id: connected-setup-budget\n {8}shell: bash/);
  assert.match(
    budget,
    /remaining_ms=\$\(\(RUNTIME_ACCEPTANCE_JOB_STARTED_MS \+ 720000 - \$\(date \+%s%3N\)\)\)/,
  );
  assert.match(budget, /remaining_minutes=\$\(\(remaining_ms \/ 60000\)\)/);
  assert.match(budget, /test "\$remaining_ms" -ge 60000/);
  assert.match(budget, /test "\$remaining_minutes" -ge 1/);
  assert.match(
    budget,
    /echo "minutes=\$remaining_minutes" >> "\$GITHUB_OUTPUT"/,
  );
  assert.match(
    budget,
    /timeout-minutes: \$\{\{ fromJSON\(steps\.connected-setup-budget\.outputs\.minutes\) \}\}\n {8}uses: \.\/\.github\/actions\/setup-bun-env/,
  );
  assert.doesNotMatch(
    budget,
    /timeout-minutes: 12|ceil|max\(1|remaining_ms \+|RUNTIME_ACCEPTANCE_JOB_STARTED_MS=/,
  );
  const afterSetup = connected.slice(
    connected.indexOf('- name: Restore actual connected ffmpeg'),
    connected.indexOf('- name: Run visual-connected acceptance'),
  );
  assert.match(
    afterSetup,
    /test "\$\(\(720000 \+ RUNTIME_ACCEPTANCE_JOB_STARTED_MS - \$\(date \+%s%3N\)\)\)" -gt 0/,
  );
  assert.match(connected, /FFMPEG_BIN=\/usr\/bin\/ffmpeg/);
  assert.match(workflow, /value: \$\{\{ jobs\.isolation\.outputs\.result \}\}/);
  assert.match(workflow, /value: \$\{\{ jobs\.connected\.outputs\.result \}\}/);
});

test('final Full Suite forwards full API discovery only with explicit runtime acceptance', () => {
  const suite = jobBlock(
    readWorkflow('full-suite.yml'),
    'e2e',
    'full-suite.yml',
  );
  assert.match(
    suite,
    /run_api_full: \$\{\{ inputs\.run_runtime_acceptance == true \}\}/,
  );
  assert.match(
    suite,
    /run_runtime_acceptance: \$\{\{ inputs\.run_runtime_acceptance == true \}\}/,
  );
  const inputDefaults = readWorkflow('full-suite.yml').matchAll(
    /run_runtime_acceptance:\n\s+description:[^\n]*\n\s+type: boolean\n\s+required: false\n\s+default: false/g,
  );
  assert.equal([...inputDefaults].length, 2);
  const e2e = readWorkflow('e2e.yml');
  assert.match(
    e2e,
    /run_api_full:\n\s+description:[^\n]*\n\s+type: boolean\n\s+required: false\n\s+default: false/,
  );
  assert.doesNotMatch(
    readWorkflow('pr-heavy-ci.yml'),
    /run_api_full: true|run_runtime_acceptance: true/,
  );
  const releaseSuite = jobBlock(
    readWorkflow('release.yml'),
    'verify-suite',
    'release.yml',
  );
  assert.match(releaseSuite, /^ {4}with:\n {6}run_runtime_acceptance: true$/m);
});

test('dedicated production agent and BRAND jobs preserve full-tier selection and immutable receipt gates', () => {
  const workflow = readWorkflow('e2e.yml'),
    suite = readWorkflow('full-suite.yml');
  const full = jobBlock(workflow, 'e2e-api-full', 'e2e.yml');
  assert.match(
    full,
    /\(github.event_name == 'schedule' && github.workflow == 'E2E Tests'\) \|\| inputs\.run_api_full == true/,
  );
  assert.doesNotMatch(full, /if: .*run_runtime_acceptance/);
  const delegated = [
    'test/integration/proactive-agent-production-turn.integration.spec.ts',
    'test/integration/branded-generation/branded-generation-receipts.integration.spec.ts',
  ];
  assert.equal((full.match(/--exclude /g) ?? []).length, 4);
  for (const file of [
    'test/integration/content-learning/content-learning-runtime.integration.spec.ts',
    'test/integration/content-learning/content-learning-publication-races.integration.spec.ts',
  ])
    assert.ok(full.includes(`--exclude ${file}`));
  assert.ok(
    !full.includes('if [ "$RUNTIME_ACCEPTANCE_PARTITION_MODE" = final ]; then'),
  );
  assert.ok(full.includes('process.env.RUNTIME_ACCEPTANCE_PARTITION_MODE'));
  const fullGate = jobBlock(workflow, 'e2e-api-full-gate', 'e2e.yml');
  assert.ok(
    fullGate.includes(
      'PARTITION_MODE: ${{ needs.e2e-api-full.outputs.partition_mode }}',
    ),
  );
  assert.ok(fullGate.includes('test "$PARTITION_MODE" = "$EXPECTED_MODE"'));
  assert.ok(
    fullGate.includes(
      'if [ "$PARTITION_MODE" = final ]; then\n            test "$SERIAL_RESULT" = success',
    ),
  );
  assert.ok(
    fullGate.includes('SERIAL_RESULT: ${{ needs.runtime-acceptance.result }}'),
  );

  const gateScript = fullGate
    .match(/ {8}run: \|\n((?: {10}.*\n)+)/)?.[1]
    .replace(/^ {10}/gm, '');
  assert.ok(gateScript);
  const gateEnv = {
    ...process.env,
    EXPECTED_MODE: 'final',
    PARTITION_MODE: 'final',
    FULL_RESULT: 'success',
    PARTITION: 'passed',
    AGENT_RESULT: 'success',
    AGENT_RECEIPT: 'passed',
    BRAND_RESULT: 'success',
    BRAND_RECEIPT: 'passed',
  };
  for (const serial of ['success', 'failure', 'skipped', 'cancelled', '']) {
    const result = spawnSync('bash', ['-c', gateScript], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...gateEnv, SERIAL_RESULT: serial },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status === 0, serial === 'success');
  }
  const sharedResult = spawnSync('bash', ['-c', gateScript], {
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...gateEnv,
      EXPECTED_MODE: 'shared',
      PARTITION_MODE: 'shared',
      SERIAL_RESULT: 'skipped',
    },
  });
  assert.equal(sharedResult.error, undefined);
  assert.equal(sharedResult.status, 0);
  const wrongMode = spawnSync('bash', ['-c', gateScript], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...gateEnv, PARTITION_MODE: 'shared', SERIAL_RESULT: 'success' },
  });
  assert.equal(wrongMode.status === 0, false);
  for (const file of delegated) assert.ok(full.includes(`--exclude ${file}`));
  assert.ok(
    full.includes(
      'env -u PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB -u BRANDED_GENERATION_TEST_DATABASE_URL',
    ),
  );
  assert.ok(
    full.includes(
      'verifySharedApiFullPartition(process.cwd(), process.env.RUNTIME_ACCEPTANCE_PARTITION_MODE)',
    ),
  );
  assert.ok(
    full.indexOf('Check exact shared full partition') >
      full.indexOf('Run API E2E full tier'),
  );
  assert.match(
    full,
    /partition: \$\{\{ steps\.partition\.outputs\.partition \}\}/,
  );
  const diagnostic = readWorkflow('_dataset-acceptance.yml');
  for (const [job, group, minutes, redis] of [
    ['agent-production-acceptance', 'agent-production', 20, true],
    ['brand-acceptance', 'brand-acceptance', 30, false],
  ]) {
    assert.equal(workflow.split(`  ${job}:\n`).length, 2);
    const block = jobBlock(workflow, job, 'e2e.yml');
    assert.match(
      block,
      /if: .*inputs\.run_api_full == true \|\| inputs\.run_runtime_acceptance == true/,
    );
    assert.ok(block.includes(`timeout-minutes: ${minutes}`));
    assert.ok(block.includes(`--group ${group}`));
    assert.ok(
      block.indexOf('Anchor acceptance job deadline') <
        block.indexOf('actions/checkout@'),
    );
    assert.ok(
      block.indexOf('Setup preflight Node.js 24.x') <
        block.indexOf('Validate final prerequisites'),
    );
    assert.ok(
      block.indexOf('Validate final prerequisites') <
        block.indexOf('Setup Bun environment'),
    );
    const services = parseYaml(workflow).jobs[job].services;
    assert.equal(services.postgres.image, 'pgvector/pgvector:pg17');
    assert.equal(services.redis?.image === 'redis:7', redis);
    assert.equal(block.includes('RUNTIME_ACCEPTANCE_REDIS_ID:'), redis);
    const budget = redis ? 'agent-setup-budget' : 'brand-setup-budget';
    assert.ok(
      block.includes(
        `timeout-minutes: \${{ fromJSON(steps.${budget}.outputs.minutes) }}`,
      ),
    );
    assert.ok(
      block.includes(
        'RUNTIME_ACCEPTANCE_JOB_STARTED_MS + 300000 - $(date +%s%3N)',
      ),
    );
    assert.match(block, /test "\$remaining_ms" -ge 60000/);
    assert.match(
      block,
      /test "\$\(\(300000 \+ RUNTIME_ACCEPTANCE_JOB_STARTED_MS - \$\(date \+%s%3N\)\)\)" -gt 0/,
    );
    for (const field of ['USER', 'PASSWORD']) {
      const expected = diagnostic.match(
        new RegExp(`^ {6}RUNTIME_ACCEPTANCE_POSTGRES_${field}: (.+)$`, 'm'),
      )?.[1];
      const value = block.match(
        new RegExp(`^ {6}RUNTIME_ACCEPTANCE_POSTGRES_${field}: (.+)$`, 'm'),
      )?.[1];
      const serviceValue = services.postgres.env[`POSTGRES_${field}`];
      assert.ok(value);
      assert.equal(value, expected);
      assert.equal(value, serviceValue);
      if (field === 'USER') assert.equal(value, 'genfeed');
    }
    assert.match(block, /TURBO_TOKEN: ''/);
    assert.match(block, /persist-credentials: false/);
    assert.match(
      block,
      /steps\.seal\.outputs\.result == 'passed' && steps\.upload\.outcome == 'success'/,
    );
    assert.match(block, /public\/receipt\.json/);
    assert.match(block, /public\/evidence\.json/);
    assert.match(block, /if-no-files-found: error/);
    assert.doesNotMatch(
      block,
      /continue-on-error|secrets: inherit|PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB:|BRANDED_GENERATION_TEST_DATABASE_URL:/,
    );
  }
  const gate = jobBlock(workflow, 'e2e-api-full-gate', 'e2e.yml');
  assert.match(gate, /if: \$\{\{ always\(\) && .*inputs\.run_api_full == true/);
  assert.doesNotMatch(gate, /if: .*run_runtime_acceptance/);
  assert.match(
    gate,
    /needs: \[e2e-api-full, agent-production-acceptance, brand-acceptance, runtime-acceptance\]/,
  );
  for (const field of ['FULL_RESULT', 'AGENT_RESULT', 'BRAND_RESULT'])
    assert.ok(gate.includes(`test "$${field}" = success`));
  for (const field of ['PARTITION', 'AGENT_RECEIPT', 'BRAND_RECEIPT'])
    assert.ok(gate.includes(`test "$${field}" = passed`));
  for (const output of ['agent_production_result', 'brand_acceptance_result']) {
    assert.ok(workflow.includes(output));
    assert.ok(suite.includes(`needs.e2e.outputs.${output}`));
  }
  const final = jobBlock(suite, 'runtime-acceptance-gate', 'full-suite.yml');
  for (const field of ['AGENT_RECEIPT', 'BRAND_RECEIPT'])
    assert.ok(final.includes(`test "$${field}" = passed`));
  for (const job of ['nightly-failure-report', 'nightly-recovery-report']) {
    const block = jobBlock(workflow, job, 'e2e.yml');
    for (const dependency of [
      'agent-production-acceptance',
      'brand-acceptance',
      'e2e-api-full-gate',
    ])
      assert.ok(block.includes(dependency));
  }
  for (const [display, job] of [
    ['Proactive Production Turn Acceptance', 'agent-production-acceptance'],
    ['BRAND Receipt and Relocation Acceptance', 'brand-acceptance'],
    ['API E2E Full Gate', 'e2e-api-full'],
  ])
    assert.ok(workflow.includes(`if (name === '${display}') return '${job}';`));
});

function e2eExpression(expression, context) {
  return runInNewContext(
    expression.replace(/needs\.([\w-]+)/g, 'needs["$1"]'),
    {
      ...context,
      always: () => true,
      cancelled: () => false,
    },
  );
}

function diagnosticContext(
  event,
  workflow,
  diagnostic,
  full = true,
  runtime = false,
) {
  return {
    github: { event_name: event, workflow, ref: 'refs/heads/master' },
    inputs: {
      acceptance_diagnostic: diagnostic,
      run_api_full: full,
      run_runtime_acceptance: runtime,
    },
    vars: { E2E_AUTHED_ENABLED: 'true' },
    steps: {
      seal: { outputs: { result: 'passed' } },
      upload: { outcome: 'success' },
    },
    needs: {
      'e2e-gate': { result: 'success' },
      'e2e-frontend-authed': { result: 'success' },
      'e2e-api-full': { result: 'success' },
      'e2e-isolated-publish': { result: 'success' },
      'agent-production-acceptance': { result: 'success' },
      'brand-acceptance': { result: 'success' },
      'e2e-api-full-gate': { result: 'success' },
    },
  };
}

function e2eJobCondition(workflow, job) {
  const block = jobBlock(workflow, job, 'e2e.yml');
  const expression = block.match(/^ {4}if: \$\{\{ (.+) \}\}$/m)?.[1];
  assert.ok(expression, `${job} must explicitly guard diagnostic routing`);
  return expression;
}

test('dispatch diagnostics select exactly one acceptance job without exporting release evidence', () => {
  const workflow = readWorkflow('e2e.yml');
  const jobs = [
    'e2e-route-coverage',
    'e2e-api',
    'e2e-api-full',
    'e2e-isolated-publish',
    'e2e-frontend',
    'e2e-merge-reports',
    'runtime-acceptance',
    'agent-production-acceptance',
    'brand-acceptance',
    'e2e-api-full-gate',
    'e2e-gate',
    'e2e-frontend-authed',
  ];
  for (const [diagnostic, selected] of [
    ['final', 'runtime-acceptance'],
    ['brand-acceptance', 'brand-acceptance'],
  ]) {
    const context = diagnosticContext(
      'workflow_dispatch',
      'E2E Tests',
      diagnostic,
    );
    assert.deepEqual(
      jobs.filter((job) =>
        e2eExpression(e2eJobCondition(workflow, job), context),
      ),
      [selected],
      `${diagnostic} must override the default run_api_full=true`,
    );
    for (const job of ['runtime-acceptance', 'brand-acceptance']) {
      const block = jobBlock(workflow, job, 'e2e.yml');
      const complete = block.split('        id: complete\n')[1];
      const condition = complete.match(/^ {8}if: \$\{\{ (.+) \}\}$/m)?.[1];
      assert.ok(condition);
      assert.equal(e2eExpression(condition, context), false);
      assert.equal(
        e2eExpression(
          condition,
          diagnosticContext('workflow_dispatch', 'E2E Tests', 'none'),
        ),
        true,
      );
      assert.match(block, /CONTROL_SHA: \$\{\{ github\.sha \}\}/);
      assert.match(block, /CANDIDATE_SHA: \$\{\{ github\.sha \}\}/);
      assert.doesNotMatch(block, /RUNTIME_ACCEPTANCE_PUBLIC_KEY/);
      assert.match(
        block,
        /seal --repo "\$ACCEPTANCE_REPO" --state "\$ACCEPTANCE_STATE" --candidate-sha "\$CANDIDATE_SHA" --control-sha "\$CONTROL_SHA"/,
      );
      const state = job === 'runtime-acceptance' ? 'runtime-acceptance' : job;
      assert.ok(block.includes(`/${state}/public/receipt.json`));
      assert.ok(block.includes(`/${state}/public/evidence.json`));
      assert.doesNotMatch(block, /path:.*private|continue-on-error/);
    }
    for (const job of ['nightly-failure-report', 'nightly-recovery-report']) {
      const block = jobBlock(workflow, job, 'e2e.yml');
      const condition = block.match(/^ {4}if: >-\n((?: {6}.*\n)+)/m)?.[1];
      assert.ok(condition);
      assert.equal(e2eExpression(condition, context), false);
    }
  }
});

test('learning runtime scheduled reporter and recovery partition every source result', () => {
  const workflow = readWorkflow('learning-runtime.yml');
  const reporter = jobBlock(
    workflow,
    'nightly-failure-report',
    'learning-runtime.yml',
  );
  const recovery = jobBlock(
    workflow,
    'nightly-recovery-report',
    'learning-runtime.yml',
  );
  const conditions = [reporter, recovery].map((block) => {
    const condition = block.match(/^ {4}if: >-\n((?: {6}.*\n)+)/m)?.[1];
    assert.ok(condition);
    assert.match(condition, /^\s*!cancelled\(\)/);
    return condition;
  });

  for (const event of ['schedule', 'workflow_dispatch']) {
    for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
      const context = {
        github: { event_name: event },
        needs: { 'learning-runtime': { result } },
      };
      const [reports, recovers] = conditions.map((condition) =>
        e2eExpression(condition, context),
      );
      assert.equal(
        reports,
        event === 'schedule' && ['failure', 'cancelled'].includes(result),
      );
      assert.equal(recovers, event === 'schedule' && result === 'success');
      assert.equal(reports && recovers, false);
    }
  }

  for (const block of [reporter, recovery]) {
    assert.match(block, /needs: \[learning-runtime\]/);
    assert.match(
      block,
      /group: nightly-learning-runtime-failure-reporter\n {6}cancel-in-progress: false/,
    );
  }
  assert.match(
    recovery,
    /permissions:\n {6}contents: read\n {6}issues: write\n {4}steps:/,
  );
  assert.match(recovery, /github-token: \$\{\{ github\.token \}\}/);
  assert.match(recovery, /persist-credentials: false/);
  assert.match(recovery, /scripts\/ci\/scheduled-failure-tracker\.mjs/);
  assert.match(recovery, /await recordScheduledWorkflowGreen\(\{\s*github,/);
  assert.doesNotMatch(
    recovery,
    /actions: read|secrets\.|reporter-token|continue-on-error|catch\s*\(/,
  );
  assert.deepEqual(
    [...workflow.matchAll(/workflowIdentity: '([^']+)'/g)].map(
      (match) => match[1],
    ),
    [
      '.github/workflows/learning-runtime.yml',
      '.github/workflows/learning-runtime.yml',
    ],
  );
  assert.equal(RECOVERY_GREEN_THRESHOLD, 3);
});

test('normal E2E defaults and callers retain every original selection predicate', () => {
  const workflow = readWorkflow('e2e.yml');
  const original = {
    'e2e-route-coverage': () => true,
    'e2e-api': () => true,
    'e2e-frontend': () => true,
    'e2e-merge-reports': () => true,
    'e2e-gate': () => true,
    'runtime-acceptance': (c) => c.inputs.run_runtime_acceptance === true,
    'e2e-frontend-authed': (c) => c.vars.E2E_AUTHED_ENABLED === 'true',
    'e2e-isolated-publish': (c) =>
      (c.github.event_name === 'schedule' &&
        c.github.workflow === 'E2E Tests') ||
      c.github.event_name === 'workflow_dispatch',
    'e2e-api-full': (c) =>
      (c.github.event_name === 'schedule' &&
        c.github.workflow === 'E2E Tests') ||
      c.inputs.run_api_full === true,
  };
  original['e2e-api-full-gate'] = original['e2e-api-full'];
  original['agent-production-acceptance'] = (c) =>
    original['e2e-api-full'](c) || c.inputs.run_runtime_acceptance === true;
  original['brand-acceptance'] = original['agent-production-acceptance'];
  const cases = [
    ['workflow_dispatch', 'E2E Tests', undefined, true, false],
    ['workflow_dispatch', 'E2E Tests', 'none', true, false],
    ['workflow_dispatch', 'E2E Tests', 'unknown', true, false],
    ['workflow_dispatch', 'E2E Tests', 'none', false, false],
    ['schedule', 'E2E Tests', undefined, false, false],
    ['workflow_call', 'Full Suite', undefined, true, true],
    ['workflow_dispatch', 'Full Suite', 'final', true, true],
    ['schedule', 'Full Suite', 'brand-acceptance', false, false],
  ];
  for (const row of cases) {
    const context = diagnosticContext(...row);
    for (const [job, expected] of Object.entries(original)) {
      assert.equal(
        e2eExpression(e2eJobCondition(workflow, job), context),
        expected(context),
        `${row.join('/')} ${job}`,
      );
    }
  }
});

test('diagnostic inputs stay dispatch-only and isolate concurrency from ordinary E2E', () => {
  const workflow = readWorkflow('e2e.yml');
  const dispatch = workflow
    .split('  workflow_dispatch:\n')[1]
    .split('  workflow_call:\n')[0];
  assert.match(
    dispatch,
    /acceptance_diagnostic:[\s\S]*type: choice[\s\S]*default: none[\s\S]*options: \[none, final, brand-acceptance\]/,
  );
  assert.doesNotMatch(
    workflow.split('  workflow_call:\n')[1].split('  schedule:\n')[0],
    /acceptance_diagnostic/,
  );
  assert.doesNotMatch(readWorkflow('full-suite.yml'), /acceptance_diagnostic/);
  const group = topLevelConcurrencyBlock(workflow, 'e2e.yml').match(
    /^ {2}group: (.+)$/m,
  )?.[1];
  assert.ok(group);
  const render = (context) =>
    group.replace(/\$\{\{ (.+?) \}\}/g, (_match, expression) =>
      e2eExpression(expression, context),
    );
  const normal = render(
    diagnosticContext('workflow_dispatch', 'E2E Tests', 'none'),
  );
  assert.equal(
    render(diagnosticContext('workflow_dispatch', 'E2E Tests', undefined)),
    normal,
  );
  const final = render(
    diagnosticContext('workflow_dispatch', 'E2E Tests', 'final'),
  );
  const brand = render(
    diagnosticContext('workflow_dispatch', 'E2E Tests', 'brand-acceptance'),
  );
  assert.equal(new Set([normal, final, brand]).size, 3);
  assert.ok(normal.endsWith('-none'));
  assert.ok(final.endsWith('-final'));
  assert.ok(brand.endsWith('-brand-acceptance'));
});

test('runtime acceptance workflows upload plaintext evidence without a public key variable', () => {
  for (const fileName of [
    'e2e.yml',
    '_dataset-acceptance.yml',
    'visual-code-isolation.yml',
  ]) {
    const workflow = readWorkflow(fileName);
    assert.doesNotMatch(workflow, /RUNTIME_ACCEPTANCE_PUBLIC_KEY/, fileName);
    assert.doesNotMatch(workflow, /evidence\.encrypted\.json/, fileName);
    assert.match(workflow, /public\/evidence\.json/, fileName);
  }
});

test('MCP real transport job is planned, required and publishes only its sanitized receipt', () => {
  const workflow = readWorkflow('_ci-validation.yml');
  const runtime = jobBlock(workflow, 'mcp-auth-runtime', 'ci.yml');
  const gate = jobBlock(workflow, 'tests-gate', 'ci.yml');
  assert.match(runtime, /if: needs\.plan\.outputs\.mcp_auth_runtime == 'true'/);
  assert.match(runtime, /timeout-minutes: 20/);
  assert.match(runtime, /--case-family brand-access/);
  assert.match(runtime, /--filter=@genfeedai\/api --filter=@genfeedai\/mcp/);
  assert.match(runtime, /if: always\(\)/);
  assert.match(runtime, /path:.*report\.json/);
  assert.match(runtime, /if-no-files-found: error/);
  assert.match(runtime, /retention-days: 7/);
  assert.doesNotMatch(runtime, /secrets\.|id-token|\.private\.log/);
  assert.match(gate, /- mcp-auth-runtime/);
  assert.match(gate, /PLAN_MCP_AUTH_RUNTIME:/);
  assert.match(gate, /MCP_AUTH_RUNTIME_RESULT:/);
});

test('link routing preserves ready direct PRs across fork trust and heavy callers', () => {
  const root = parseYaml(readWorkflow('ci.yml'));
  const ci = parseYaml(readWorkflow('_ci-frontend.yml'));
  const core = parseYaml(readWorkflow('_ci-validation.yml'));
  const manual = parseYaml(readWorkflow('link-check.yml'));
  assert.deepEqual(Object.keys(manual.on), ['workflow_dispatch']);
  assert.equal(manual.name, 'Link Check');
  assert.deepEqual(manual.concurrency, {
    group: '${{ github.workflow }}-${{ github.ref }}',
    'cancel-in-progress': true,
  });
  assert.deepEqual(root.on.pull_request, {
    branches: ['master'],
    types: ['opened', 'synchronize', 'reopened', 'ready_for_review'],
  });
  const detector = ci.jobs['link-check-detect'];
  assert.ok(detector, 'direct CI must own Link Check routing');
  assert.equal(detector.needs, undefined);
  for (const event of [
    'pull_request',
    'push',
    'workflow_dispatch',
    'merge_group',
  ]) {
    for (const draft of [false, true]) {
      for (const fork of [false, true]) {
        for (const heavy of [undefined, false, true]) {
          for (const association of ['MEMBER', 'CONTRIBUTOR', 'NONE']) {
            for (const labels of [[], [{ name: 'full-suite' }]]) {
              const github = {
                event_name: event,
                event: {
                  pull_request: {
                    draft,
                    author_association: association,
                    labels,
                    head: { repo: { fork } },
                  },
                },
              };
              assert.equal(
                runInNewContext(
                  detector.steps.find((step) => step.id === 'scope').if,
                  {
                    github,
                    inputs: { run_heavy_tests: heavy },
                  },
                ),
                event === 'pull_request' && !draft && heavy !== true,
              );
              assert.equal(
                runInNewContext(manual.jobs.detect.if, { github }),
                event !== 'pull_request' || !draft,
              );
            }
          }
        }
      }
    }
  }
  for (const [workflow, detectorId] of [
    [ci, 'link-check-detect'],
    [manual, 'detect'],
  ]) {
    for (const [id, name, timeout] of [
      [detectorId, 'Detect Link-Check Scope', 3],
      ['website-links', 'Website Links + Orphans + SEO', 20],
      ['docs-links', 'Docs + Markdown Dead Links', 10],
    ]) {
      const job = workflow.jobs[id];
      assert.ok(job, id);
      assert.equal(job.name, name);
      assert.equal(job['runs-on'], 'ubuntu-latest');
      assert.equal(job['timeout-minutes'], timeout);
      assert.deepEqual(job.permissions, { contents: 'read' });
      assert.equal(job.uses, undefined);
      assert.deepEqual(
        {
          ...job.steps.find((step) =>
            step.uses?.startsWith('actions/checkout@'),
          ),
          if: undefined,
        },
        {
          uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
          if: undefined,
          with: { 'fetch-depth': 0, 'persist-credentials': false },
        },
      );
      if (id === detectorId) continue;
      assert.equal(job.needs, detectorId);
      const scope = id === 'website-links' ? 'website' : 'docs';
      assert.equal(job.if, `needs.${detectorId}.outputs.${scope} == 'true'`);
      for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
        for (const value of ['true', 'false', '']) {
          // GitHub implicitly requires successful needs when no status function is present.
          const runnable = runInNewContext(
            `success() && (${job.if.replaceAll('needs.link-check-detect', 'needs["link-check-detect"]')})`,
            {
              success: () => result === 'success',
              needs: { [detectorId]: { result, outputs: { [scope]: value } } },
            },
          );
          assert.equal(runnable, result === 'success' && value === 'true');
        }
      }
    }
  }
  assert.deepEqual(core.jobs['tests-gate'].needs, [
    'plan',
    'static-checks',
    'spec-typecheck',
    'test-workspaces',
    'test-app',
    'test-api',
    'cloud-tenant-guard',
    'mcp-auth-runtime',
    'build',
  ]);
});

function evaluateCandidate(expression, context) {
  return runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g, ''), {
    always: () => true,
    cancelled: () => false,
    fromJSON: JSON.parse,
    contains: (values, value) => values.includes(value),
    ...context,
  });
}

test('combined entrypoint keeps required names static and decides applicability by trigger', () => {
  const root = parseYaml(readWorkflow('ci.yml'));
  const title = parseYaml(readWorkflow('pr-title.yml'));
  assert.deepEqual(Object.keys(root.on), [
    'pull_request',
    'merge_group',
    'workflow_call',
  ]);
  assert.deepEqual(root.on.pull_request, {
    branches: ['master'],
    types: ['opened', 'synchronize', 'reopened', 'ready_for_review'],
  });
  assert.deepEqual(root.on.merge_group, { types: ['checks_requested'] });
  assert.equal(root.on.workflow_call.inputs.called_workflow, undefined);
  assert.deepEqual(Object.keys(title.on), ['pull_request_target']);
  assert.deepEqual(title.on.pull_request_target, {
    types: ['opened', 'edited', 'synchronize', 'reopened'],
  });
  // GitHub cannot evaluate an expression for a skipped job and prints it raw,
  // and a skipped job reports success. Required leaves therefore carry a plain
  // name and no job-level routing: the triggers above decide when they exist.
  for (const [workflow, id, name] of [
    [title, 'conventional-title', 'PR Title'],
    [root, 'server-image', 'Build Server Image'],
    [root, 'tests-gate', 'Tests Gate'],
  ]) {
    assert.equal(workflow.jobs[id].name, name);
  }
  for (const workflow of [title, root])
    for (const job of Object.values(workflow.jobs))
      if (job.name !== undefined)
        assert.doesNotMatch(job.name, /\$\{\{/, 'job names must be static');
  assert.equal(title.jobs['conventional-title'].if, undefined);
  for (const id of ['core', 'frontend'])
    assert.equal(root.jobs[id].if, undefined);
  assert.equal(root.jobs['tests-gate'].if, 'always()');
  for (const event of [
    'pull_request',
    'merge_group',
    'push',
    'workflow_dispatch',
    'release',
  ])
    for (const action of ['opened', 'ready_for_review', 'labeled'])
      assert.equal(
        evaluateCandidate(root.jobs['server-image'].if, {
          github: { event_name: event, event: { action } },
        }),
        event === 'pull_request' && action !== 'labeled',
      );
});

test('combined workflow isolates metadata and image from source secrets and checkout', () => {
  const root = parseYaml(readWorkflow('ci.yml'));
  const core = parseYaml(readWorkflow('_ci-validation.yml'));
  const frontend = parseYaml(readWorkflow('_ci-frontend.yml'));
  const bundle = parseYaml(readWorkflow('_bundle-size.yml'));
  assert.deepEqual(root.permissions, {});
  assert.equal(root.env, undefined);
  assert.equal(root.concurrency, undefined);
  const schema = {
    TURBO_TOKEN: { required: false },
    GITLEAKS_LICENSE: { required: false },
    BETTER_AUTH_SECRET: { required: false },
  };
  assert.deepEqual(root.on.workflow_call.secrets, schema);
  assert.deepEqual(core.on.workflow_call.secrets, schema);
  assert.deepEqual(frontend.on.workflow_call.secrets, {
    TURBO_TOKEN: { required: false },
  });
  assert.deepEqual(bundle.on.workflow_call.secrets, {
    TURBO_TOKEN: { required: false },
  });
  for (const helper of [core, frontend]) {
    assert.deepEqual(helper.on.workflow_call.inputs.run_heavy_tests, {
      type: 'boolean',
      required: false,
      default: false,
    });
    assert.equal(helper.concurrency, undefined);
    assert.equal(helper.env.TURBO_TOKEN, '${{ secrets.TURBO_TOKEN }}');
    assert.equal(helper.env.TURBO_TEAM, '${{ vars.TURBO_TEAM }}');
    assert.equal(helper.env.TZ, 'UTC');
  }
  assert.deepEqual(root.jobs.core.secrets, {
    TURBO_TOKEN: '${{ secrets.TURBO_TOKEN }}',
    GITLEAKS_LICENSE: '${{ secrets.GITLEAKS_LICENSE }}',
    BETTER_AUTH_SECRET: '${{ secrets.BETTER_AUTH_SECRET }}',
  });
  for (const job of [root.jobs.frontend, frontend.jobs['bundle-size']]) {
    assert.deepEqual(job.secrets, {
      TURBO_TOKEN: '${{ secrets.TURBO_TOKEN }}',
    });
  }
  for (const job of [root.jobs.core, root.jobs.frontend]) {
    assert.deepEqual(job.with, {
      run_heavy_tests: '${{ inputs.run_heavy_tests == true }}',
    });
  }
  const titleWorkflow = parseYaml(readWorkflow('pr-title.yml'));
  const title = titleWorkflow.jobs['conventional-title'];
  assert.deepEqual(title.permissions, { 'pull-requests': 'read' });
  assert.equal(title.steps.length, 1);
  assert.equal(
    title.steps[0].uses,
    'amannn/action-semantic-pull-request@48f256284bd46cdaab1048c3721360e808335d50',
  );
  assert.deepEqual(title.steps[0].env, {
    GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
  });
  assert.equal(
    title.steps[0].with.types,
    'feat\nfix\ndocs\nrefactor\ntest\nchore\nbuild\nci\nperf\n',
  );
  for (const id of ['conventional-title', 'server-image', 'tests-gate']) {
    const job = id === 'conventional-title' ? title : root.jobs[id];
    assert.equal(job.secrets, undefined);
    assert.equal(job.env, undefined);
    assert.equal(job['continue-on-error'], undefined);
    const serialized = JSON.stringify(job);
    assert.doesNotMatch(
      serialized,
      /TURBO_TOKEN|TURBO_TEAM|GITLEAKS_LICENSE|BETTER_AUTH_SECRET|secrets: inherit/,
    );
    if (id === 'conventional-title')
      assert.doesNotMatch(serialized, /checkout|\.\/\.github/);
  }
  const bridge = root.jobs['tests-gate'];
  assert.deepEqual(bridge.permissions, { contents: 'read', actions: 'read' });
  assert.equal(bridge.needs, 'core');
  assert.equal(bridge['timeout-minutes'], 5);
  assert.equal(bridge.steps.at(-1).run, 'node scripts/ci/ci-job-verdict.mjs');
  assert.deepEqual(bridge.steps.at(-1).env, {
    GH_TOKEN: '${{ github.token }}',
    EXPECTED_EVENT: '${{ github.event_name }}',
    EXPECTED_WORKFLOW_REF: '${{ github.workflow_ref }}',
    EXPECTED_SOURCE_SHA: '${{ github.sha }}',
    EXPECTED_PR_NUMBER: '${{ github.event.pull_request.number }}',
    EXPECTED_PR_HEAD: '${{ github.event.pull_request.head.sha }}',
  });
  for (const [file, id] of [
    ['full-suite.yml', 'ci'],
    ['pr-heavy-ci.yml', 'full-suite'],
  ]) {
    assert.equal(
      parseYaml(readWorkflow(file)).jobs[id].permissions.actions,
      'read',
    );
  }
  assert.equal(root.jobs.frontend.needs, undefined);
  assert.equal(root.jobs.core.needs, undefined);
  assert.equal(root.jobs.frontend.permissions['pull-requests'], 'write');
  assert.equal(
    frontend.jobs['bundle-size'].permissions['pull-requests'],
    'write',
  );
});

test('frontend admission witness runs only the cheap false scope on inapplicable cases', () => {
  const detector = parseYaml(readWorkflow('_ci-frontend.yml')).jobs[
    'link-check-detect'
  ];
  assert.equal(detector.if, undefined);
  assert.equal(detector.needs, undefined);
  const [witness, checkout, scope] = detector.steps;
  assert.equal(witness.id, 'admission');
  assert.equal(witness.uses, undefined);
  assert.equal(witness.shell, 'bash');
  assert.equal(
    witness.run,
    'echo "website=false" >> "$GITHUB_OUTPUT"\necho "docs=false" >> "$GITHUB_OUTPUT"\n',
  );
  assert.equal(checkout.if, scope.if);
  for (const event of [
    'pull_request',
    'merge_group',
    'push',
    'workflow_dispatch',
    'release',
  ]) {
    for (const draft of [false, true]) {
      for (const heavy of [undefined, false, true]) {
        const context = {
          github: { event_name: event, event: { pull_request: { draft } } },
          inputs: { run_heavy_tests: heavy },
        };
        const applicable = event === 'pull_request' && !draft && heavy !== true;
        assert.equal(evaluateCandidate(witness.if, context), !applicable);
        assert.equal(evaluateCandidate(checkout.if, context), applicable);
        assert.equal(evaluateCandidate(scope.if, context), applicable);
      }
    }
  }
});

test('domain sequences preserve independent workload replacement and never cancel on metadata or ready image events', () => {
  const root = parseYaml(readWorkflow('ci.yml'));
  const title = parseYaml(readWorkflow('pr-title.yml'));
  const events = [
    ['pull_request', 'opened', false, 'master'],
    ['pull_request', 'synchronize', false, 'master'],
    ['pull_request', 'reopened', false, 'master'],
    ['pull_request', 'ready_for_review', false, 'master'],
    ['pull_request_target', 'opened', false, 'master'],
    ['pull_request_target', 'edited', false, 'master'],
    ['pull_request_target', 'synchronize', false, 'other'],
    ['pull_request', 'opened', false, 'other'],
    ['pull_request', 'ready_for_review', false, 'other'],
    ['pull_request', 'labeled', true, 'master'],
    ['workflow_dispatch', '', true, 'master'],
    ['release', '', true, 'master'],
  ];
  const domains = ['conventional-title', 'server-image', 'core', 'frontend'];
  // Applicability is decided by `on:` triggers, not job-level `if:`, so a
  // required leaf never exists as a skipped job.
  function isSelected(id, [event, action, called, base], values) {
    if (id === 'conventional-title')
      return (
        !called &&
        event === 'pull_request_target' &&
        title.on.pull_request_target.types.includes(action)
      );
    if (id === 'server-image')
      return evaluateCandidate(root.jobs[id].if, values);
    return (
      called ||
      (event === 'pull_request' &&
        base === 'master' &&
        root.on.pull_request.types.includes(action))
    );
  }
  function context([event, action, called, base], pr = 42) {
    return {
      github: {
        event_name: event,
        workflow: called ? 'PR Heavy CI' : 'CI',
        ref:
          called && event !== 'pull_request'
            ? 'refs/heads/master'
            : 'refs/pull/' + pr + '/merge',
        base_ref: base,
        event: { action, pull_request: { number: pr } },
      },
      inputs: { called_workflow: called },
    };
  }
  function group(expression, values) {
    return expression.replace(/\$\{\{(.*?)\}\}/g, (_, inner) =>
      String(evaluateCandidate(inner, values)),
    );
  }
  let sequences = 0;
  for (const first of events) {
    for (const second of events) {
      for (const third of events) {
        for (const sibling of [false, true]) {
          const actual = new Map();
          const independent = new Map();
          for (const [index, event] of [first, second, third].entries()) {
            const values = context(event, sibling && index === 1 ? 43 : 42);
            for (const id of domains) {
              const job =
                id === 'conventional-title' ? title.jobs[id] : root.jobs[id];
              if (!isSelected(id, event, values)) continue;
              const key = group(job.concurrency.group, values);
              const cancel =
                typeof job.concurrency['cancel-in-progress'] === 'boolean'
                  ? job.concurrency['cancel-in-progress']
                  : evaluateCandidate(
                      job.concurrency['cancel-in-progress'],
                      values,
                    );
              const domainKey = id + ':' + key;
              const before = actual.get(key) ?? {
                running: null,
                pending: null,
              };
              const baseline = independent.get(domainKey) ?? {
                running: null,
                pending: null,
              };
              function admit(state) {
                if (state.running === null || cancel)
                  return { running: index, pending: null };
                return { running: state.running, pending: index };
              }
              actual.set(key, admit(before));
              independent.set(domainKey, admit(baseline));
              assert.deepEqual(actual.get(key), independent.get(domainKey));
              if (id === 'conventional-title') assert.equal(cancel, false);
              if (id === 'core' || id === 'frontend')
                assert.equal(cancel, event[0] === 'pull_request');
              if (id === 'server-image') {
                assert.equal(cancel, true);
                assert.ok(
                  [
                    'opened',
                    'synchronize',
                    'reopened',
                    'ready_for_review',
                  ].includes(event[1]),
                );
              }
            }
          }
          assert.equal(
            actual.size,
            independent.size,
            'domains must never share a cancellation group',
          );
          sequences++;
        }
      }
    }
  }
  assert.equal(sequences, 3456);
});
