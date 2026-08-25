import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  NIGHTLY_E2E_FAILURE_LABEL,
  reportNightlyE2eFailure,
  selectNewestEligibleClosedTracker,
} from './nightly-e2e-failure-reporter.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WORKFLOWS_DIRECTORY = path.join(REPOSITORY_ROOT, '.github', 'workflows');
const CANCELLABLE_PULL_REQUEST_WORKFLOWS = [
  'ci.yml',
  'curated-action-catalog.yml',
  'desktop-qa.yml',
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

function createNightlyReporterFixture(initialIssues = []) {
  const issues = initialIssues.map((issue) => ({ ...issue }));
  const calls = {
    comments: [],
    creates: [],
    pagination: [],
    updates: [],
  };
  const listForRepo = async () => {
    throw new Error('listForRepo must be called through github.paginate');
  };

  const github = {
    paginate: async (endpoint, options) => {
      assert.equal(endpoint, listForRepo);
      calls.pagination.push({ ...options });

      const matching = issues.filter(
        (issue) =>
          issue.state === options.state &&
          issue.labels.includes(NIGHTLY_E2E_FAILURE_LABEL),
      );
      const pages = [];
      for (let index = 0; index < matching.length; index += options.per_page) {
        pages.push(matching.slice(index, index + options.per_page));
      }
      return pages.flat();
    },
    rest: {
      issues: {
        create: async (input) => {
          calls.creates.push({ ...input });
          const issue = {
            closed_at: null,
            labels: input.labels,
            number: 1000 + calls.creates.length,
            state: 'open',
          };
          issues.push(issue);
          return { data: issue };
        },
        createComment: async (input) => {
          calls.comments.push({ ...input });
          return { data: { id: calls.comments.length } };
        },
        createLabel: async () => ({ data: {} }),
        getLabel: async () => ({ data: {} }),
        listForRepo,
        update: async (input) => {
          calls.updates.push({ ...input });
          const issue = issues.find(
            (candidate) => candidate.number === input.issue_number,
          );
          assert.ok(issue, `missing fixture issue #${input.issue_number}`);
          issue.state = input.state;
          return { data: issue };
        },
      },
    },
  };

  return { calls, github, issues };
}

function createNonCancelingReporterQueue() {
  let tail = Promise.resolve();

  return (report) => {
    const result = tail.then(report);
    tail = result.catch(() => {});
    return result;
  };
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
    'packages/tools/src/registry/curated-action-catalog.ts',
    'packages/tools/scripts/report-curated-action-catalog.ts',
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
    /run: \|\n {10}bun run --filter=@genfeedai\/tools catalog:changes \\/m,
    'the report job must invoke the reporter through its package script',
  );
  // Without --summary the report exists only in raw job logs.
  assert.match(workflow, /--summary="\$GITHUB_STEP_SUMMARY"/m);
});

test('runs desktop QA for affected pull requests and release callers', () => {
  const workflow = readWorkflow('desktop-qa.yml');

  assert.match(workflow, /^ {2}pull_request:\n {4}paths:/m);
  for (const pathFilter of [
    'apps/app/**',
    'apps/desktop/**',
    'packages/agent/**',
    '.github/workflows/desktop-release.yml',
  ]) {
    assert.ok(
      workflow.includes(`      - "${pathFilter}"\n`),
      `desktop-qa.yml must stay reachable for ${pathFilter}`,
    );
  }
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
  assert.match(workflow, /^ {2}workflow_call:$/m);
});

test('server image PR validation bounds cache export without changing reachability', () => {
  const workflow = readWorkflow('server-image-pr.yml');

  assert.match(workflow, /^ {2}pull_request:\n/m);
  for (const pathFilter of [
    'apps/server/**',
    'packages/**',
    'docker/Dockerfile.server',
    '.github/workflows/server-image-pr.yml',
  ]) {
    assert.ok(
      workflow.includes(`      - '${pathFilter}'\n`),
      `server-image-pr.yml must stay reachable for ${pathFilter}`,
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

test('ordinary labels do not restart CI and full-suite has an isolated dispatcher', () => {
  const ci = readWorkflow('ci.yml');
  const dispatcher = readWorkflow('pr-full-suite.yml');

  assert.match(ci, /^ {4}types: \[opened, synchronize, reopened\]$/m);
  assert.doesNotMatch(ci, /\b(?:labeled|unlabeled)\b/);
  assert.match(
    ci,
    /--run-heavy "\$\{\{ inputs\.run_heavy_tests \|\| github\.event_name == 'merge_group' \|\| contains\(github\.event\.pull_request\.labels\.\*\.name, 'full-suite'\) \}\}"/,
  );

  assert.match(dispatcher, /^ {4}types: \[labeled\]$/m);
  assert.match(dispatcher, /if: github\.event\.label\.name == 'full-suite'/);
  assert.match(dispatcher, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(dispatcher, /^ {6}run_heavy_tests: true$/m);
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

test('selects the newest eligible tracker strictly by closed_at', () => {
  const cutoff = Date.parse('2026-06-01T00:00:00Z');
  const selected = selectNewestEligibleClosedTracker(
    [
      {
        closed_at: '2026-06-10T00:00:00Z',
        number: 10,
        updated_at: '2026-07-20T00:00:00Z',
      },
      {
        closed_at: null,
        number: 11,
        updated_at: '2026-07-25T00:00:00Z',
      },
      {
        closed_at: '2026-05-31T23:59:59Z',
        number: 12,
        updated_at: '2026-07-26T00:00:00Z',
      },
      {
        closed_at: '2026-06-20T00:00:00Z',
        number: 20,
        updated_at: '2026-06-20T00:00:00Z',
      },
      {
        closed_at: '2026-06-30T00:00:00Z',
        number: 30,
        pull_request: {},
        updated_at: '2026-06-30T00:00:00Z',
      },
    ],
    cutoff,
  );

  assert.equal(selected?.number, 20);
});

test('paginates closed trackers before reopening the newest closed_at candidate', async () => {
  const closedIssues = Array.from({ length: 101 }, (_, index) => ({
    closed_at: `2026-06-${String((index % 20) + 1).padStart(2, '0')}T00:00:00Z`,
    labels: [NIGHTLY_E2E_FAILURE_LABEL],
    number: index + 1,
    state: 'closed',
    updated_at: `2026-07-${String((index % 20) + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  closedIssues[100] = {
    closed_at: '2026-07-25T00:00:00Z',
    labels: [NIGHTLY_E2E_FAILURE_LABEL],
    number: 101,
    state: 'closed',
    updated_at: '2026-06-01T00:00:00Z',
  };
  const fixture = createNightlyReporterFixture(closedIssues);

  const result = await reportNightlyE2eFailure({
    github: fixture.github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'nightly failed',
    now: Date.parse('2026-07-27T00:00:00Z'),
  });

  assert.deepEqual(result, { action: 'reopened', issueNumber: 101 });
  assert.deepEqual(
    fixture.calls.pagination.map(({ per_page, state }) => ({
      per_page,
      state,
    })),
    [
      { per_page: 100, state: 'open' },
      { per_page: 100, state: 'closed' },
    ],
  );
  assert.deepEqual(
    fixture.calls.updates.map(({ issue_number, state }) => ({
      issue_number,
      state,
    })),
    [{ issue_number: 101, state: 'open' }],
  );
  assert.equal(fixture.calls.comments.length, 1);
  assert.equal(fixture.calls.creates.length, 0);
});

test('serializes overlapping reporter attempts into one mutation path at a time', async () => {
  const fixture = createNightlyReporterFixture([
    {
      closed_at: '2026-07-25T00:00:00Z',
      labels: [NIGHTLY_E2E_FAILURE_LABEL],
      number: 42,
      state: 'closed',
      updated_at: '2026-07-25T00:00:00Z',
    },
  ]);
  const enqueue = createNonCancelingReporterQueue();

  const results = await Promise.all([
    enqueue(() =>
      reportNightlyE2eFailure({
        github: fixture.github,
        owner: 'genfeedai',
        repo: 'genfeed.ai',
        body: 'first failed run',
        now: Date.parse('2026-07-27T00:00:00Z'),
      }),
    ),
    enqueue(() =>
      reportNightlyE2eFailure({
        github: fixture.github,
        owner: 'genfeedai',
        repo: 'genfeed.ai',
        body: 'second failed run',
        now: Date.parse('2026-07-27T00:00:00Z'),
      }),
    ),
  ]);

  assert.deepEqual(results, [
    { action: 'reopened', issueNumber: 42 },
    { action: 'commented', issueNumber: 42 },
  ]);
  assert.equal(fixture.calls.updates.length, 1);
  assert.equal(fixture.calls.creates.length, 0);
  assert.deepEqual(
    fixture.calls.comments.map(({ body }) => body),
    [
      'first failed run\n\nReopened automatically: this is the newest tracker closed within the last 30 days, and the nightly is red again.',
      'second failed run',
    ],
  );
});

test('keeps E2E workflow concurrency while queueing the full reporter job', () => {
  const workflow = readWorkflow('e2e.yml');

  assert.match(
    topLevelConcurrencyBlock(workflow, 'e2e.yml'),
    /^ {2}group: e2e-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true$/m,
  );
  assert.match(
    workflow,
    /^ {2}nightly-failure-report:[\s\S]*?^ {4}concurrency:\n {6}group: nightly-e2e-failure-reporter\n {6}cancel-in-progress: false\n {6}queue: max$/m,
  );
  assert.match(
    workflow,
    /name: Checkout workflow helpers[\s\S]*?persist-credentials: false[\s\S]*?nightly-e2e-failure-reporter\.mjs[\s\S]*?reportNightlyE2eFailure/,
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
