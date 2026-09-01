import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AREA_INFRA,
  BLAST_RADIUS_INFRA,
  ISSUE_TYPE_BUG,
  PRIORITY_P0,
} from './genfeed-project-board.mjs';
import {
  buildScheduledFailureBody,
  classifyScheduledFailure,
  collectScheduledRunFailures,
  computeFailureFingerprint,
  extractActionableFailureScenarios,
  PUBLIC_EXCERPT_LIMIT,
  parseTrackerState,
  recordScheduledWorkflowGreen,
  reportScheduledFailure,
} from './scheduled-failure-tracker.mjs';

function githubFixture({ rejectLabels = false } = {}) {
  const issues = [];
  const calls = {
    comments: [],
    graphql: [],
    labels: [],
    logDownloads: [],
    updates: [],
  };
  let nextNumber = 100;
  const listForRepo = async () => ({ data: issues });
  const searchIssues = async () => ({ data: { items: issues } });
  const github = {
    paginate: async (endpoint, options) => {
      if (endpoint === searchIssues) {
        return issues.filter((issue) =>
          String(issue.body).includes('genfeed-scheduled-failure:v1'),
        );
      }
      return issues.filter(
        (issue) =>
          (options.state === 'all' || issue.state === options.state) &&
          issue.labels.includes(options.labels),
      );
    },
    request: async (_route, input) => {
      calls.logDownloads.push(input.job_id);
      return { data: input.log };
    },
    rest: {
      search: { issuesAndPullRequests: searchIssues },
      issues: {
        listForRepo,
        getLabel: async () => ({ data: {} }),
        createLabel: async () => ({ data: {} }),
        create: async (input) => {
          const issue = {
            ...input,
            labels: [],
            number: nextNumber++,
            node_id: `NODE_${nextNumber}`,
            state: 'open',
          };
          issues.push(issue);
          return { data: issue };
        },
        addLabels: async (input) => {
          calls.labels.push(input);
          if (rejectLabels) {
            const error = new Error('Resource not accessible by integration');
            error.status = 403;
            throw error;
          }
          const issue = issues.find(
            ({ number }) => number === input.issue_number,
          );
          issue.labels = [...new Set([...issue.labels, ...input.labels])];
          return { data: issue.labels.map((name) => ({ name })) };
        },
        get: async ({ issue_number }) => ({
          data: issues.find(({ number }) => number === issue_number),
        }),
        update: async (input) => {
          calls.updates.push(input);
          const issue = issues.find(
            ({ number }) => number === input.issue_number,
          );
          Object.assign(issue, input);
          return { data: issue };
        },
        createComment: async (input) => {
          calls.comments.push(input);
          return { data: {} };
        },
      },
    },
    graphql: async (query, variables) => {
      calls.graphql.push({ query, variables });
      if (query.includes('updateIssue(')) {
        return {
          updateIssue: {
            issue: {
              id: variables.issueId,
              issueType: { id: ISSUE_TYPE_BUG },
              issueFieldValues: {
                nodes: [
                  { field: { name: 'Priority' }, value: PRIORITY_P0 },
                  { field: { name: 'Area' }, value: AREA_INFRA },
                  {
                    field: { name: 'Blast radius' },
                    value: BLAST_RADIUS_INFRA,
                  },
                ],
              },
            },
          },
        };
      }
      return query.includes('addProjectV2ItemById')
        ? { addProjectV2ItemById: { item: { id: 'ITEM_1' } } }
        : { unexpectedMutation: true };
    },
  };
  return { calls, github, issues };
}

function failure(overrides = {}) {
  return {
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    trackerLabel: 'nightly-test-failure',
    trackerDescription: 'Scheduled test failures',
    workflowIdentity: '.github/workflows/nightly.yml',
    failedJob: 'test-full',
    excerpt: 'AssertionError: expected 200, received 500',
    sha: '1111111111111111111111111111111111111111',
    runId: 10,
    runUrl: 'https://github.test/runs/10',
    occurredAt: '2026-08-20T01:00:00.000Z',
    ...overrides,
  };
}

test('classifies deterministic failure classes', () => {
  assert.equal(
    classifyScheduledFailure('Expected 2, received 3').failureClass,
    'test-assertion',
  );
  assert.equal(
    classifyScheduledFailure('Coverage below threshold').failureClass,
    'coverage-threshold',
  );
  assert.equal(
    classifyScheduledFailure('ENOENT: coverage report missing').failureClass,
    'missing-report',
  );
  assert.equal(
    classifyScheduledFailure('Hosted runner network unavailable').failureClass,
    'runner-infrastructure',
  );
  assert.equal(
    classifyScheduledFailure('Something novel happened').failureClass,
    'unknown',
  );
});

test('redacts credentials and bounds every public excerpt', () => {
  const evidence = classifyScheduledFailure(
    `authorization: Bearer ghp_${'a'.repeat(40)}\npassword=hunter2\n${'x'.repeat(2_000)}`,
  ).publicExcerpt;
  assert.ok(evidence.length <= PUBLIC_EXCERPT_LIMIT);
  assert.doesNotMatch(evidence, /hunter2|ghp_/u);
  assert.match(evidence, /\[REDACTED\]/u);
  assert.match(evidence, /excerpt truncated/u);
});

test('fingerprint is stable across volatile SHAs, URLs, counts, and timestamps', () => {
  const first = classifyScheduledFailure(
    'AssertionError at spec.ts:42:9 on 2026-08-20T01:02:03Z run https://example.test/10 expected 2 received 3',
  );
  const second = classifyScheduledFailure(
    'AssertionError at spec.ts:99:2 on 2026-08-21T02:03:04Z run https://example.test/11 expected 4 received 5',
  );
  assert.equal(
    computeFailureFingerprint({
      workflowIdentity: 'nightly.yml',
      failedJob: 'test-full',
      failureClass: first.failureClass,
      signature: first.signature,
    }),
    computeFailureFingerprint({
      workflowIdentity: 'nightly.yml',
      failedJob: 'test-full',
      failureClass: second.failureClass,
      signature: second.signature,
    }),
  );
});

test('extracts distinct actionable Playwright scenarios from one failed job log', () => {
  const scenarios = extractActionableFailureScenarios(`
2026-09-01T08:03:05.9916708Z     [app-core] › playwright/e2e/tests/workflows/workflows.spec.ts:42:7 › Workflows › workflow detail renders restored editor chrome
2026-09-01T08:03:05.9917390Z     [app-core] › playwright/e2e/tests/agent/agent.spec.ts:99:2 › Agent › sends a queued follow-up
2026-09-01T08:03:06.0973151Z ##[notice]  2 failed
`);

  assert.deepEqual(scenarios, [
    '[app-core] › playwright/e2e/tests/workflows/workflows.spec.ts:42:7 › Workflows › workflow detail renders restored editor chrome',
    '[app-core] › playwright/e2e/tests/agent/agent.spec.ts:99:2 › Agent › sends a queued follow-up',
  ]);
});

test('collects one stable failure per actionable scenario and ignores shard identity', async () => {
  const fixture = githubFixture();
  fixture.github.request = async (_route, input) => {
    fixture.calls.logDownloads.push(input.job_id);
    return {
      data: [
        '2026-09-01T08:03:05Z   2 failed',
        '2026-09-01T08:03:05Z     [app-core] › playwright/e2e/tests/workflows/workflows.spec.ts:42:7 › Workflows › restores editor chrome',
        '2026-09-01T08:03:05Z     [app-core] › playwright/e2e/tests/agent/agent.spec.ts:99:2 › Agent › sends a queued follow-up',
      ].join('\n'),
    };
  };

  const failures = await collectScheduledRunFailures({
    github: fixture.github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    jobs: [
      {
        conclusion: 'failure',
        databaseId: 9001,
        fallbackExcerpt: 'Playwright full tier failed.',
        name: 'Playwright Full (Shard 8/8)',
        trackerJob: 'e2e-frontend-full',
      },
    ],
  });

  assert.deepEqual(fixture.calls.logDownloads, [9001]);
  assert.deepEqual(
    failures.map(({ failedJob }) => failedJob),
    ['e2e-frontend-full', 'e2e-frontend-full'],
  );
  assert.match(failures[0].excerpt, /restores editor chrome/u);
  assert.match(failures[1].excerpt, /sends a queued follow-up/u);
});

test('body carries a parseable marker and implementation-ready bounded contract', () => {
  const state = {
    ...failure(),
    fingerprint: 'abc123',
    failureClass: 'test-assertion',
    occurrences: 2,
    firstSeenAt: '2026-08-20T01:00:00.000Z',
    lastSeenAt: '2026-08-21T01:00:00.000Z',
    firstSha: '1111111111111111111111111111111111111111',
    lastSha: '2222222222222222222222222222222222222222',
    firstRunUrl: 'https://github.test/runs/10',
    lastRunUrl: 'https://github.test/runs/11',
    greenStreak: 0,
    status: 'active',
  };
  const body = buildScheduledFailureBody({
    state,
    excerpt: 'AssertionError: expected 2, received 3',
    reproduction: 'Dispatch nightly.yml.',
  });
  assert.equal(parseTrackerState(body).fingerprint, 'abc123');
  assert.match(body, /Occurrences: \*\*2\*\*/u);
  assert.match(body, /Acceptance criteria/u);
  assert.match(body, /Verification plan/u);
  assert.match(body, /111111111111/u);
  assert.match(body, /222222222222/u);
});

test('recurrence updates one issue with occurrence and first/last run evidence', async () => {
  const fixture = githubFixture();
  const first = await reportScheduledFailure({
    github: fixture.github,
    ...failure(),
  });
  const second = await reportScheduledFailure({
    github: fixture.github,
    ...failure({
      sha: '2222222222222222222222222222222222222222',
      runId: 11,
      runUrl: 'https://github.test/runs/11',
      occurredAt: '2026-08-21T01:00:00.000Z',
    }),
  });
  assert.equal(first.action, 'created');
  assert.equal(second.action, 'updated');
  assert.equal(fixture.issues.length, 1);
  const state = parseTrackerState(fixture.issues[0].body);
  assert.equal(state.occurrences, 2);
  assert.equal(state.firstRunUrl, 'https://github.test/runs/10');
  assert.equal(state.lastRunUrl, 'https://github.test/runs/11');
});

test('recurrence finds an unlabeled canonical tracker and reopens it after recovery', async () => {
  const fixture = githubFixture({ rejectLabels: true });
  const first = await reportScheduledFailure({
    github: fixture.github,
    ...failure(),
  });
  assert.equal(first.action, 'created');
  assert.deepEqual(fixture.issues[0].labels, []);

  const green = (runId) =>
    recordScheduledWorkflowGreen({
      github: fixture.github,
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      trackerLabel: 'nightly-test-failure',
      workflowIdentity: '.github/workflows/nightly.yml',
      sha: String(runId).repeat(40).slice(0, 40),
      runId,
      runUrl: `https://github.test/runs/${runId}`,
      occurredAt: `2026-08-${20 + runId}T01:00:00.000Z`,
    });
  await green(1);
  await green(2);
  assert.equal((await green(3)).action, 'closed');
  assert.equal(fixture.issues[0].state, 'closed');

  const recurrence = await reportScheduledFailure({
    github: fixture.github,
    ...failure({
      runId: 14,
      runUrl: 'https://github.test/runs/14',
      occurredAt: '2026-08-24T01:00:00.000Z',
    }),
  });
  assert.equal(recurrence.action, 'reopened');
  assert.equal(recurrence.issueNumber, first.issueNumber);
  assert.equal(fixture.issues[0].state, 'open');
  assert.equal(parseTrackerState(fixture.issues[0].body).occurrences, 2);
});

test('recurrence reconciles historical duplicate trackers into the oldest issue', async () => {
  const fixture = githubFixture();
  await reportScheduledFailure({ github: fixture.github, ...failure() });
  fixture.issues.push({
    ...structuredClone(fixture.issues[0]),
    number: 101,
    node_id: 'NODE_101',
    state: 'open',
  });

  const recurrence = await reportScheduledFailure({
    github: fixture.github,
    ...failure({ runId: 12, runUrl: 'https://github.test/runs/12' }),
  });

  assert.equal(recurrence.issueNumber, 100);
  assert.equal(fixture.issues[0].state, 'open');
  assert.equal(fixture.issues[1].state, 'closed');
  assert.equal(fixture.issues[1].state_reason, 'not_planned');
  assert.equal(parseTrackerState(fixture.issues[0].body).occurrences, 3);
});

test('transient runner noise stays closed until recurrence threshold with visible reason', async () => {
  const fixture = githubFixture();
  const first = await reportScheduledFailure({
    github: fixture.github,
    ...failure({ excerpt: 'Hosted runner network unavailable' }),
  });
  assert.equal(first.action, 'suppressed');
  assert.match(first.reason, /requires 2 consecutive occurrences/u);
  assert.equal(fixture.issues[0].state, 'closed');
  assert.equal(fixture.issues[0].labels.includes('codex:automation'), false);

  const second = await reportScheduledFailure({
    github: fixture.github,
    ...failure({
      excerpt: 'Hosted runner network unavailable',
      runId: 11,
      runUrl: 'https://github.test/runs/11',
      occurredAt: '2026-08-21T01:00:00.000Z',
    }),
  });
  assert.equal(second.action, 'promoted');
  assert.equal(fixture.issues[0].state, 'open');
  assert.equal(fixture.issues[0].labels.includes('codex:automation'), true);
});

test('a scheduled green resets a suppressed transient recurrence streak', async () => {
  const fixture = githubFixture();
  await reportScheduledFailure({
    github: fixture.github,
    ...failure({ excerpt: 'Hosted runner network unavailable' }),
  });
  const green = await recordScheduledWorkflowGreen({
    github: fixture.github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    trackerLabel: 'nightly-test-failure',
    workflowIdentity: '.github/workflows/nightly.yml',
    sha: '2222222222222222222222222222222222222222',
    runId: 11,
    runUrl: 'https://github.test/runs/11',
  });
  assert.equal(green.action, 'reset-suppression');

  const next = await reportScheduledFailure({
    github: fixture.github,
    ...failure({
      excerpt: 'Hosted runner network unavailable',
      runId: 12,
      runUrl: 'https://github.test/runs/12',
    }),
  });
  assert.equal(next.action, 'suppressed');
  assert.equal(parseTrackerState(fixture.issues[0].body).occurrences, 2);
});

test('three consecutive greens close the canonical tracker, never the first two', async () => {
  const fixture = githubFixture();
  await reportScheduledFailure({ github: fixture.github, ...failure() });
  const green = (runId) =>
    recordScheduledWorkflowGreen({
      github: fixture.github,
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      trackerLabel: 'nightly-test-failure',
      workflowIdentity: '.github/workflows/nightly.yml',
      sha: String(runId).repeat(40).slice(0, 40),
      runId,
      runUrl: `https://github.test/runs/${runId}`,
      occurredAt: `2026-08-${20 + runId}T01:00:00.000Z`,
    });
  assert.equal((await green(1)).action, 'recovering');
  assert.equal(fixture.issues[0].state, 'open');
  assert.equal((await green(2)).action, 'recovering');
  assert.equal(fixture.issues[0].state, 'open');
  assert.equal((await green(3)).action, 'closed');
  assert.equal(fixture.issues[0].state, 'closed');
  assert.equal(fixture.calls.comments.length, 1);
});

test('concurrent creates converge on the oldest canonical tracker', async () => {
  const fixture = githubFixture();
  let releases = 0;
  let releaseBoth;
  const barrier = new Promise((resolve) => {
    releaseBoth = resolve;
  });
  const originalCreate = fixture.github.rest.issues.create;
  fixture.github.rest.issues.create = async (input) => {
    const result = await originalCreate(input);
    releases += 1;
    if (releases === 2) releaseBoth();
    await barrier;
    return result;
  };

  await Promise.all([
    reportScheduledFailure({ github: fixture.github, ...failure() }),
    reportScheduledFailure({
      github: fixture.github,
      ...failure({ runId: 11, runUrl: 'https://github.test/runs/11' }),
    }),
  ]);
  const open = fixture.issues.filter((issue) => issue.state === 'open');
  assert.equal(open.length, 1);
  assert.equal(open[0].number, 100);
  assert.equal(parseTrackerState(open[0].body).occurrences, 2);
});
