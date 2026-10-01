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
import './runtime-acceptance.test.mjs';
import './scheduled-failure-tracker.test.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WORKFLOWS_DIRECTORY = path.join(REPOSITORY_ROOT, '.github', 'workflows');
const CANCELLABLE_PULL_REQUEST_WORKFLOWS = [
  'bundle-size.yml',
  'ci.yml',
  'curated-action-catalog.yml',
  'link-check.yml',
  'playwright-coverage-policy.yml',
  'pr-full-suite.yml',
  'selfhosted-install-smoke.yml',
  'server-image-pr.yml',
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
    'check:runtime-complexity',
    'check:deterministic-locale',
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
  const workflow = readWorkflow('ci.yml');
  const staticChecks = jobBlock(workflow, 'static-checks', 'ci.yml');

  assert.match(staticChecks, /^ {4}name: Static Checks$/m);
  assert.match(staticChecks, /bun run format:check/);
  assert.match(staticChecks, /secretlint/);
  assert.match(staticChecks, /bunx turbo run lint/);
  assert.match(staticChecks, /bunx turbo run type-check/);
  assert.match(staticChecks, /bun run test:executable-contracts/);
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

test('caps the CI job inventory at twenty jobs', () => {
  // Runner-slot starvation is a head-count problem: every job occupies a
  // slot for its full queue+setup+run span. New validation belongs inside an
  // existing job (a step, or a test in test:executable-contracts) — see
  // feedback_code_ci_not_workflow_gates. Raising this ceiling needs an explicit
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

test('reusable CI callers grant the failure tracker permission ceiling', () => {
  // GitHub validates every called job before evaluating its `if` expression.
  // A caller that omits issues:write startup-fails even when the
  // schedule-only tracker would be skipped for that caller's event.
  for (const [fileName, jobId] of [
    ['full-suite.yml', 'ci'],
    ['pr-full-suite.yml', 'full-suite'],
  ]) {
    const caller = jobBlock(readWorkflow(fileName), jobId, fileName);

    assert.match(
      caller,
      /^ {6}issues: write$/m,
      `${fileName} must let reusable ci.yml grant issues:write to its failure tracker`,
    );
  }
});

test('the full suite runs on every master push and never cancels a run', () => {
  const workflow = readWorkflow('full-suite.yml');

  // A cron cadence was tried and dropped: this repository's scheduled
  // workflows start hours late, which left master unvalidated.
  assert.match(workflow, /^ {2}push:\n {4}branches: \[master\]$/m);
  assert.doesNotMatch(workflow, /^ {2}schedule:/m);
  assert.match(
    topLevelConcurrencyBlock(workflow, 'full-suite.yml'),
    /^ {2}cancel-in-progress: false$/m,
  );
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
    ['ci.yml', 'plan'],
    ['bundle-size.yml', 'detect'],
    ['link-check.yml', 'detect'],
  ]) {
    const workflow = readWorkflow(fileName);
    assert.match(
      workflow,
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

  assert.match(
    ci,
    /^ {4}types: \[opened, synchronize, reopened, ready_for_review\]$/m,
  );
  assert.doesNotMatch(ci, /\b(?:labeled|unlabeled)\b/);
  assert.match(ci, /--run-heavy "\$\{\{ steps\.tier\.outputs\.heavy \}\}"/);

  assert.match(dispatcher, /^ {4}types: \[labeled\]$/m);
  assert.match(dispatcher, /if: github\.event\.label\.name == 'full-suite'/);
  assert.match(dispatcher, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(dispatcher, /^ {6}run_heavy_tests: true$/m);
});

test('external contributor pull requests run the heavy tier maintainers skip', () => {
  const ci = readWorkflow('ci.yml');
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
  const ci = readWorkflow('ci.yml');

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
  const report = workflow
    .split('  nightly-failure-report:')[1]
    .split('  nightly-recovery-report:')[0];
  const step = report.split(
    '- name: Create or update bounded nightly-failure trackers',
  )[1];
  assert.match(step, /REPOSITORY_TOKEN: \$\{\{ github.token \}\}/u);
  assert.match(step, /github-token: \$\{\{ secrets.CONSOLE_DEPLOY_TOKEN \}\}/u);
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

test('bundle report publishing isolates write credentials from PR build code', () => {
  const workflow = readWorkflow('bundle-size.yml');
  const measure = jobBlock(workflow, 'measure', 'bundle-size.yml');
  const comment = jobBlock(workflow, 'comment', 'bundle-size.yml');
  assert.match(measure, /permissions:\n {6}contents: read\n {4}strategy:/);
  assert.doesNotMatch(measure, /: write/);
  assert.match(measure, /uses: actions\/upload-artifact@/);
  assert.match(comment, /needs: measure/);
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

test('dataset diagnostic freezes inspected control before the exact candidate checkout', () => {
  const workflow = readWorkflow('dataset-diagnostic.yml');
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
  assert.match(workflow, /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(
    workflow,
    /^ {2}(?:pull_request|push|schedule|workflow_call):/m,
  );
  assert.match(workflow, /^ {4}timeout-minutes: 20$/m);
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
  assert.match(workflow, /node "\$CONTROL_RUNNER" dataset-diagnostic/);
  assert.match(
    workflow,
    /RUNTIME_ACCEPTANCE_PUBLIC_KEY: \$\{\{ vars\.RUNTIME_ACCEPTANCE_PUBLIC_KEY \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /secrets: inherit|continue-on-error|passWithNoTests|upload[^\n]*raw/,
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /public\/receipt\.json/);
  assert.match(workflow, /public\/evidence\.encrypted\.json/);
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
  assert.match(runtime, /if: inputs\.run_runtime_acceptance == true/);
  assert.match(runtime, /timeout-minutes: 60/);
  assert.match(runtime, /TURBO_TOKEN: ''/);
  assert.match(
    runtime,
    /RUNTIME_ACCEPTANCE_OWNER_CONTRACT: \$\{\{ vars\.RUNTIME_ACCEPTANCE_OWNER_CONTRACT \}\}/,
  );
  assert.match(runtime, /image: pgvector\/pgvector:pg17/);
  assert.match(runtime, /image: redis:7/);
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
    /needs: \[e2e-route-coverage, e2e-frontend, e2e-api, runtime-acceptance\]/,
  );
  assert.ok(gate.includes('needs.runtime-acceptance.outputs.result'));
  assert.match(gate, /needs\.runtime-acceptance\.result \}\}" = skipped/);
});

test('final visual proof uses separate bounded isolation and connected jobs with encrypted uploads', () => {
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
  const diagnostic = readWorkflow('dataset-diagnostic.yml');
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
    assert.match(block, /genfeed-visual-code:4\.0\.530/);
    assert.match(
      block,
      /steps\.seal\.outputs\.result == 'passed' && steps\.upload\.outcome == 'success'/,
    );
    assert.match(block, /public\/receipt\.json/);
    assert.match(block, /public\/evidence\.encrypted\.json/);
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
  for (const caller of ['pr-full-suite.yml', 'release.yml']) {
    assert.doesNotMatch(
      readWorkflow(caller),
      /run_api_full: true|run_runtime_acceptance: true/,
    );
  }
});

test('dedicated production agent and BRAND jobs preserve full-tier selection and immutable receipt gates', () => {
  const workflow = readWorkflow('e2e.yml'),
    suite = readWorkflow('full-suite.yml');
  const full = jobBlock(workflow, 'e2e-api-full', 'e2e.yml');
  assert.match(
    full,
    /if: \(github.event_name == 'schedule' && github.workflow == 'E2E Tests'\) \|\| inputs\.run_api_full == true/,
  );
  assert.doesNotMatch(full, /if: .*run_runtime_acceptance/);
  const delegated = [
    'test/integration/proactive-agent-production-turn.integration.spec.ts',
    'test/integration/branded-generation/branded-generation-receipts.integration.spec.ts',
  ];
  assert.equal((full.match(/--exclude /g) ?? []).length, 2);
  for (const file of delegated) assert.ok(full.includes(`--exclude ${file}`));
  assert.ok(
    full.includes(
      'env -u PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB -u BRANDED_GENERATION_TEST_DATABASE_URL',
    ),
  );
  assert.ok(full.includes('verifySharedApiFullPartition(process.cwd())'));
  assert.ok(
    full.indexOf('Check exact shared full partition') >
      full.indexOf('Run API E2E full tier'),
  );
  assert.match(
    full,
    /partition: \$\{\{ steps\.partition\.outputs\.partition \}\}/,
  );
  const diagnostic = readWorkflow('dataset-diagnostic.yml');
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
    assert.match(block, /image: pgvector\/pgvector:pg17/);
    assert.equal(block.includes('image: redis:7'), redis);
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
      const serviceValue = block.match(
        new RegExp(`^ {10}POSTGRES_${field}: (.+)$`, 'm'),
      )?.[1];
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
    assert.match(block, /public\/evidence\.encrypted\.json/);
    assert.match(block, /if-no-files-found: error/);
    assert.doesNotMatch(
      block,
      /continue-on-error|secrets: inherit|PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB:|BRANDED_GENERATION_TEST_DATABASE_URL:/,
    );
  }
  const gate = jobBlock(workflow, 'e2e-api-full-gate', 'e2e.yml');
  assert.match(gate, /if: always\(\) && .*inputs\.run_api_full == true/);
  assert.doesNotMatch(gate, /if: .*run_runtime_acceptance/);
  assert.match(
    gate,
    /needs: \[e2e-api-full, agent-production-acceptance, brand-acceptance\]/,
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
