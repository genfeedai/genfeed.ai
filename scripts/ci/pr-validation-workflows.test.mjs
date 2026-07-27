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
  'deploy-scripts-ci.yml',
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
    assert.match(
      concurrency,
      /^ {2}cancel-in-progress: true$/m,
      `${fileName} must cancel work superseded within its isolated group`,
    );
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
    /uses: docker\/build-push-action@v7[\s\S]*?push: false/,
  );
  assert.match(workflow, /^ {10}cache-from: type=gha,scope=server-image-pr$/m);
  assert.match(
    workflow,
    /^ {10}cache-to: type=gha,mode=min,scope=server-image-pr,timeout=3m,ignore-error=true$/m,
  );
  assert.doesNotMatch(workflow, /cache-to: type=gha,mode=max/);
  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
});

test('ordinary labels do not restart CI and full-suite has an isolated dispatcher', () => {
  const ci = readWorkflow('ci.yml');
  const dispatcher = readWorkflow('pr-full-suite.yml');

  assert.match(ci, /^ {4}types: \[opened, synchronize, reopened\]$/m);
  assert.doesNotMatch(ci, /\b(?:labeled|unlabeled)\b/);
  assert.match(
    ci,
    /--run-heavy "\$\{\{ inputs\.run_heavy_tests \|\| contains\(github\.event\.pull_request\.labels\.\*\.name, 'full-suite'\) \}\}"/,
  );

  assert.match(dispatcher, /^ {4}types: \[labeled\]$/m);
  assert.match(dispatcher, /if: github\.event\.label\.name == 'full-suite'/);
  assert.match(dispatcher, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(dispatcher, /^ {6}run_heavy_tests: true$/m);
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
