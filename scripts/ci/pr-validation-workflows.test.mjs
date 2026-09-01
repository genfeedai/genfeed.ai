import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import './coverage-failure-reporter.test.mjs';
import './full-suite-evidence.test.mjs';
import './nightly-e2e-failure-reporter.test.mjs';
import './nightly-playwright-full-failure-reporter.test.mjs';
import './playwright-full-nightly.test.mjs';
import './scheduled-failure-tracker.test.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WORKFLOWS_DIRECTORY = path.join(REPOSITORY_ROOT, '.github', 'workflows');
const CANCELLABLE_PULL_REQUEST_WORKFLOWS = [
  'bundle-size.yml',
  'ci.yml',
  'curated-action-catalog.yml',
  'link-check.yml',
  'pr-full-suite.yml',
  'selfhosted-install-smoke.yml',
  'server-image-pr.yml',
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

test('keeps pull_request_target metadata-only', () => {
  const targetWorkflows = readdirSync(WORKFLOWS_DIRECTORY)
    .filter((fileName) => /\.ya?ml$/.test(fileName))
    .filter((fileName) =>
      /^ {2}pull_request_target:/m.test(readWorkflow(fileName)),
    )
    .sort();

  assert.deepEqual(targetWorkflows, ['pr-title.yml']);
  const title = readWorkflow('pr-title.yml');
  assert.match(title, /^permissions:\n {2}pull-requests: read$/m);
  assert.doesNotMatch(title, /uses: actions\/checkout@/);
  assert.doesNotMatch(title, /uses: \.\//);
});

test('enforces executable contracts through the aggregate suite', () => {
  // #1011 still requires CI to block new hard-coded content cron/action/publish
  // paths. Those scanners, Bull Board parity, and relation-alias ratchets run
  // from `test:executable-contracts` so a dead rule is deleted with its test.
  const workflow = readWorkflow('ci.yml');
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
    'scripts/ci/dispatch-hosted-saas.test.mjs',
    'scripts/ci/merge-queue-janitor.test.mjs',
    'scripts/ci/pr-validation-workflows.test.mjs',
  ]) {
    assert.match(
      script,
      new RegExp(contractTest.replaceAll('/', '\\/')),
      `test:executable-contracts must keep ${contractTest} instead of a new named CI guard`,
    );
  }

  for (const token of [
    'check:cron-boundary',
    'check:legacy-cron-surface',
    'check:product-workflow-boundary',
    'check:bull-board-parity',
    'check:relation-alias-reads',
    'check:relation-alias-writes',
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
  // sequentially inside one static-checks job. Build starts straight off
  // trust, and the tests gate reads static-checks directly, so the failure
  // semantics of the old topology (any red static fails the gate) survive.
  const workflow = readWorkflow('ci.yml');
  const staticChecks = jobBlock(workflow, 'static-checks', 'ci.yml');

  assert.match(staticChecks, /^ {4}name: Static Checks$/m);
  assert.match(staticChecks, /bun run format:check/);
  assert.match(staticChecks, /secretlint/);
  assert.match(staticChecks, /bunx turbo run lint/);
  assert.match(staticChecks, /bunx turbo run type-check/);
  assert.match(staticChecks, /bun run test:executable-contracts/);

  for (const retired of [
    'format',
    'lint',
    'typecheck',
    'guards',
    'secretlint',
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
    /^ {4}needs: \[trust\]$/m,
    'build must start immediately off trust instead of queueing behind statics',
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

test('caps the CI job inventory at twenty jobs', () => {
  // Runner-slot starvation is a head-count problem: every job occupies a
  // slot for its full queue+setup+run span. New validation belongs inside an
  // existing job (a step, or a test in test:executable-contracts) — see
  // feedback_no_new_ci_guard_steps. Raising this ceiling needs an explicit
  // capacity review, not a drive-by.
  const workflow = readWorkflow('ci.yml');
  const jobsSection = workflow.slice(workflow.indexOf('\njobs:\n') + 1);
  const jobIds = [...jobsSection.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)].map(
    (match) => match[1],
  );

  assert.ok(jobIds.length > 0, 'ci.yml must define jobs');
  assert.ok(
    jobIds.length <= 20,
    `ci.yml defines ${jobIds.length} jobs (${jobIds.join(', ')}); the ceiling is 20`,
  );
});

test('reaps zombie merge-queue runs after each master push', () => {
  // Merged queue entries leave behind queued/in_progress merge_group runs on
  // deleted gh-readonly-queue refs; each zombie holds a runner slot until the
  // 6-hour timeout. The janitor cancels runs whose queue ref no longer
  // resolves. Push-gated: every queue merge lands as a push to master, so the
  // cleanup runs exactly when zombies can appear.
  const workflow = readWorkflow('ci.yml');
  const janitor = jobBlock(workflow, 'merge-queue-janitor', 'ci.yml');

  assert.match(
    janitor,
    /if: github\.event_name == 'push'/,
    'the janitor must run only on push events',
  );
  assert.match(
    janitor,
    /^ {6}actions: write$/m,
    'cancelling workflow runs requires actions: write',
  );
  assert.match(
    janitor,
    /merge-queue-janitor\.mjs[\s\S]*?cleanMergeQueueRuns/,
    'the janitor must run cleanMergeQueueRuns from scripts/ci/merge-queue-janitor.mjs',
  );
});

test('reusable CI callers grant the merge-queue janitor permission ceiling', () => {
  // GitHub validates every called job before evaluating its `if` expression.
  // A caller that omits actions:write therefore startup-fails even when the
  // push-only janitor would be skipped for that caller's event.
  for (const [fileName, jobId] of [
    ['full-suite.yml', 'ci'],
    ['pr-full-suite.yml', 'full-suite'],
  ]) {
    const caller = jobBlock(readWorkflow(fileName), jobId, fileName);

    assert.match(
      caller,
      /^ {6}actions: write$/m,
      `${fileName} must let reusable ci.yml grant actions:write to its janitor job`,
    );
  }
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

test('runs desktop QA nightly and for release callers', () => {
  const workflow = readWorkflow('desktop-qa.yml');

  // The desktop shell boots the apps/app bundle, so an honest PR path filter
  // matched effectively every frontend PR — each paying a ~30 min
  // macos-latest run while the desktop surface is dormant. Nightly bounds
  // drift to one day; the release path keeps its mandatory run via
  // workflow_call from desktop-release.yml.
  assert.doesNotMatch(
    workflow,
    /^ {2}pull_request:/m,
    'desktop-qa.yml must not run per pull request while the surface is dormant',
  );
  assert.match(workflow, /^ {2}schedule:\n {4}- cron: /m);
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
  assert.match(workflow, /^ {2}workflow_call:$/m);
});

test('server image PR validation bounds cache export without changing reachability', () => {
  const workflow = readWorkflow('server-image-pr.yml');

  assert.match(workflow, /^ {2}pull_request:\n/m);
  for (const pathFilter of [
    'docker/Dockerfile.server',
    'webpack.base.config.js',
    'bun.lock',
    '.github/workflows/server-image-pr.yml',
  ]) {
    assert.ok(
      workflow.includes(`      - '${pathFilter}'\n`),
      `server-image-pr.yml must stay reachable for ${pathFilter}`,
    );
  }
  // Source paths are validated by normal CI and by build-server-image.yml on
  // every master push; the PR docker build is scoped to the image definition.
  for (const droppedPath of ['apps/server/**', 'packages/**']) {
    assert.ok(
      !workflow.includes(`      - '${droppedPath}'\n`),
      `server-image-pr.yml must not rebuild the image for ${droppedPath}`,
    );
  }
  assert.match(
    workflow,
    /uses: docker\/build-push-action@[0-9a-f]{40} # v7\.\d+\.\d+[\s\S]*?push: false/,
  );
  assert.match(workflow, /^ {10}cache-from: type=gha,scope=server-image-pr$/m);
  assert.match(
    workflow,
    /^ {10}cache-to: type=gha,mode=min,scope=server-image-pr,timeout=3m,ignore-error=true$/m,
  );
  assert.doesNotMatch(workflow, /cache-to: type=gha,mode=max/);
  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
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
  const dispatcher = readWorkflow('pr-full-suite.yml');

  assert.match(ci, /^ {4}types: \[opened, synchronize, reopened\]$/m);
  assert.doesNotMatch(ci, /\b(?:labeled|unlabeled)\b/);
  assert.match(
    ci,
    /--run-heavy "\$\{\{ needs\.trust\.outputs\.heavy-tier \}\}"/,
  );

  assert.match(dispatcher, /^ {4}types: \[labeled\]$/m);
  assert.match(dispatcher, /if: github\.event\.label\.name == 'full-suite'/);
  assert.match(dispatcher, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(dispatcher, /^ {6}run_heavy_tests: true$/m);
});

test('external contributor pull requests run the heavy tier maintainers skip', () => {
  const ci = readWorkflow('ci.yml');
  const trust = jobBlock(ci, 'trust', 'ci.yml');

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

  // The tier is resolved once, in Trust Check. A heavy gate that re-derives it
  // from `inputs.run_heavy_tests` would silently keep external contributors on
  // the affected tier.
  assert.doesNotMatch(
    ci.slice(ci.indexOf('  gitleaks:')),
    /inputs\.run_heavy_tests(?![^\n]*description)/,
  );

  const heavyGates = ci.match(
    /^ {6}&& \(needs\.trust\.outputs\.heavy-tier == 'true'$/gm,
  );
  assert.equal(
    heavyGates?.length,
    4,
    'the packages, server-services, web/desktop/mobile, and extension jobs gate on the resolved tier',
  );
});

test('spec typecheck scope escalates shared server configs before ignoring apps', () => {
  const ci = readWorkflow('ci.yml');
  const loop = ci
    .slice(ci.indexOf('declare -A affected=()'))
    .split('done <<<"${changed}"')[0];
  const branches = [...loop.matchAll(/^ {14}(\S+)\)$/gm)].map(
    (match) => match[1],
  );

  // `case` globs span `/`, so apps/server/tsconfig.typecheck.base.json misses
  // apps/server/*/* and lands on whichever branch comes next. If apps/* wins
  // that race, editing the base config every program extends scopes the ratchet
  // to nothing.
  assert.deepEqual(branches, [
    'apps/server/*/*',
    'apps/server/*',
    'apps/*',
    '*',
  ]);
});

test('reusable full-suite callers preserve planner applicability at the tests gate', () => {
  const ci = readWorkflow('ci.yml');

  for (const [environmentKey, outputKey] of [
    ['TEST_SCOPE_APP_TESTS', 'app_tests'],
    ['TEST_SCOPE_API_TESTS', 'api_tests'],
  ]) {
    assert.match(
      ci,
      new RegExp(
        `^ {10}${environmentKey}: \\$\\{\\{ needs\\.test-scope\\.outputs\\.${outputKey} \\}\\}$`,
        'm',
      ),
      `${environmentKey} must reach tests-gate from the planner`,
    );
  }

  for (const caller of ['full-suite.yml', 'pr-full-suite.yml']) {
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
    /^ {2}group: e2e-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true$/m,
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
  assert.match(workflow, /continue-on-error: true/);
  assert.match(
    workflow,
    /github-token: \$\{\{ secrets\.CONSOLE_DEPLOY_TOKEN \}\}/,
  );
});

test('serializes reusable build verification without cancelling another caller', () => {
  for (const fileName of [
    'build-verify.yml',
    'build-verify-selfhosted.yml',
  ]) {
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
    /name: Build app[\s\S]*?NEXT_PUBLIC_PLAYWRIGHT_TEST: "true"[\s\S]*?NEXT_PUBLIC_GENFEED_CLOUD: "false"[\s\S]*?NEXT_PUBLIC_API_ENDPOINT: https:\/\/api\.genfeed\.ai\/v1/,
  );
});
