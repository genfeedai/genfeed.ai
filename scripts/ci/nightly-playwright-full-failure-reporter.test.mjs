import assert from 'node:assert/strict';
import test from 'node:test';
import { NIGHTLY_E2E_FAILURE_LABEL } from './nightly-e2e-failure-reporter.mjs';
import {
  NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL,
  NIGHTLY_PLAYWRIGHT_FULL_FAILURE_TITLE,
  reportNightlyPlaywrightFullFailure,
  selectNewestEligibleClosedTracker,
} from './nightly-playwright-full-failure-reporter.mjs';

function createReporterFixture(initialIssues = []) {
  const issues = initialIssues.map((issue) => ({ ...issue }));
  const calls = {
    comments: [],
    creates: [],
    labels: [],
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
      return issues.filter(
        (issue) =>
          issue.state === options.state &&
          issue.labels.includes(options.labels),
      );
    },
    rest: {
      issues: {
        create: async (input) => {
          calls.creates.push({ ...input });
          const issue = {
            closed_at: null,
            labels: input.labels,
            number: 2000 + calls.creates.length,
            state: 'open',
          };
          issues.push(issue);
          return { data: issue };
        },
        createComment: async (input) => {
          calls.comments.push({ ...input });
          return { data: { id: calls.comments.length } };
        },
        createLabel: async (input) => {
          calls.labels.push(input);
          return { data: {} };
        },
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

test('Playwright full-tier tracker uses a distinct label from the core nightly', () => {
  assert.equal(
    NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL,
    'nightly-playwright-full-failure',
  );
  assert.notEqual(
    NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL,
    NIGHTLY_E2E_FAILURE_LABEL,
  );
  assert.equal(
    NIGHTLY_PLAYWRIGHT_FULL_FAILURE_TITLE,
    'Nightly Playwright full tier is failing',
  );
});

test('comments an open full-tier tracker instead of creating a duplicate', async () => {
  const fixture = createReporterFixture([
    {
      labels: [NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL],
      number: 88,
      state: 'open',
    },
  ]);

  const result = await reportNightlyPlaywrightFullFailure({
    github: fixture.github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'full tier red',
  });

  assert.deepEqual(result, { action: 'commented', issueNumber: 88 });
  assert.equal(fixture.calls.creates.length, 0);
  assert.equal(fixture.calls.comments[0].issue_number, 88);
});

test('reopens the newest eligible closed full-tier tracker within 30 days', async () => {
  const fixture = createReporterFixture([
    {
      closed_at: '2026-07-01T00:00:00Z',
      labels: [NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL],
      number: 10,
      state: 'closed',
    },
    {
      closed_at: '2026-08-01T00:00:00Z',
      labels: [NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL],
      number: 20,
      state: 'closed',
    },
  ]);

  const result = await reportNightlyPlaywrightFullFailure({
    github: fixture.github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'full tier red again',
    now: Date.parse('2026-08-14T00:00:00Z'),
  });

  assert.deepEqual(result, { action: 'reopened', issueNumber: 20 });
  assert.equal(fixture.calls.creates.length, 0);
  assert.equal(fixture.calls.updates[0].state, 'open');
});

test('creates a full-tier tracker when none is open or revivable', async () => {
  const fixture = createReporterFixture([]);

  const result = await reportNightlyPlaywrightFullFailure({
    github: fixture.github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'first red full tier',
  });

  assert.equal(result.action, 'created');
  assert.deepEqual(fixture.calls.creates[0].labels, [
    NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL,
  ]);
  assert.equal(
    fixture.calls.creates[0].title,
    NIGHTLY_PLAYWRIGHT_FULL_FAILURE_TITLE,
  );
});

test('selectNewestEligibleClosedTracker ignores pull requests and stale closures', () => {
  const selected = selectNewestEligibleClosedTracker(
    [
      {
        closed_at: '2026-08-10T00:00:00Z',
        number: 1,
        pull_request: {},
      },
      {
        closed_at: '2026-07-01T00:00:00Z',
        number: 2,
      },
      {
        closed_at: '2026-08-12T00:00:00Z',
        number: 3,
      },
    ],
    Date.parse('2026-07-15T00:00:00Z'),
  );

  assert.equal(selected?.number, 3);
});
