import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AREA_INFRA,
  BLAST_RADIUS_INFRA,
  buildReleaseE2eFailureBody,
  GENFEED_PROJECT_ID,
  PRIORITY_P0,
  RELEASE_E2E_FAILURE_LABEL,
  reportReleaseE2eFailure,
  resolveReleaseE2eFailure,
  WORK_TYPE_BUG,
} from './release-e2e-failure-reporter.mjs';

function createGithubMock({ openIssues = [], createNumber = 99 } = {}) {
  const comments = [];
  const created = [];
  const updates = [];
  const graphqlCalls = [];

  const github = {
    paginate: async (_fn, params) => {
      if (params.state === 'open') {
        return openIssues;
      }
      return [];
    },
    rest: {
      issues: {
        listForRepo: async () => ({ data: openIssues }),
        getLabel: async () => ({ data: { name: RELEASE_E2E_FAILURE_LABEL } }),
        createLabel: async () => {
          throw new Error('createLabel should not run when getLabel succeeds');
        },
        createComment: async (payload) => {
          comments.push(payload);
          return { data: {} };
        },
        create: async (payload) => {
          created.push(payload);
          return {
            data: {
              number: createNumber,
              node_id: `ISSUE_NODE_${createNumber}`,
            },
          };
        },
        get: async ({ issue_number }) => ({
          data: {
            number: issue_number,
            node_id: `ISSUE_NODE_${issue_number}`,
          },
        }),
        update: async (payload) => {
          updates.push(payload);
          return { data: {} };
        },
      },
    },
    graphql: async (query, vars) => {
      graphqlCalls.push({ query, vars });
      if (query.includes('addProjectV2ItemById')) {
        return {
          addProjectV2ItemById: { item: { id: 'PROJECT_ITEM_1' } },
        };
      }
      return {
        updateProjectV2ItemFieldValue: {
          projectV2Item: { id: 'PROJECT_ITEM_1' },
        },
      };
    },
  };

  return { github, comments, created, updates, graphqlCalls };
}

test('buildReleaseE2eFailureBody names Priority as a project field', () => {
  const body = buildReleaseE2eFailureBody({
    date: '2026-07-28',
    releaseTag: 'v0.1.3',
    imageTag: '0.1.3',
    runUrl: 'https://example.test/run/1',
    failureClass: 'missing-install-assets',
  });

  assert.match(body, /v0\.1\.3/);
  assert.match(body, /missing-install-assets/);
  assert.match(body, /Priority = P0/);
  assert.doesNotMatch(body, /P0 status/);
});

test('reportReleaseE2eFailure comments existing open tracker and re-asserts P0', async () => {
  const { github, comments, created, graphqlCalls } = createGithubMock({
    openIssues: [{ number: 2079, pull_request: undefined }],
  });
  const logs = [];

  const result = await reportReleaseE2eFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'failed again',
    date: '2026-07-28',
    core: { info: (m) => logs.push(m), warning: (m) => logs.push(m) },
  });

  assert.equal(result.action, 'commented');
  assert.equal(result.issueNumber, 2079);
  assert.equal(created.length, 0);
  assert.equal(comments[0].issue_number, 2079);
  assert.ok(graphqlCalls.some((c) => c.query.includes('addProjectV2ItemById')));
  assert.ok(
    graphqlCalls.some(
      (c) =>
        c.vars?.projectId === GENFEED_PROJECT_ID &&
        c.vars?.optionId === PRIORITY_P0,
    ),
  );
});

test('reportReleaseE2eFailure creates tracker and triages project fields', async () => {
  const { github, created, graphqlCalls } = createGithubMock({
    openIssues: [],
  });

  const result = await reportReleaseE2eFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'first failure',
    date: '2026-07-26',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'created');
  assert.equal(result.issueNumber, 99);
  assert.equal(created[0].labels[0], RELEASE_E2E_FAILURE_LABEL);
  assert.match(created[0].title, /2026-07-26/);

  const optionIds = graphqlCalls.map((c) => c.vars?.optionId).filter(Boolean);
  assert.ok(optionIds.includes(PRIORITY_P0));
  assert.ok(optionIds.includes(AREA_INFRA));
  assert.ok(optionIds.includes(WORK_TYPE_BUG));
  assert.ok(optionIds.includes(BLAST_RADIUS_INFRA));
});

test('reportReleaseE2eFailure still succeeds when project GraphQL is denied', async () => {
  const { github, created } = createGithubMock({ openIssues: [] });
  github.graphql = async () => {
    throw new Error('Resource not accessible by integration');
  };
  const warnings = [];

  const result = await reportReleaseE2eFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'first failure',
    date: '2026-07-26',
    core: {
      info: () => {},
      warning: (m) => warnings.push(m),
    },
  });

  assert.equal(result.action, 'created');
  assert.equal(created.length, 1);
  assert.ok(warnings.some((w) => w.includes('Could not triage')));
});

test('resolveReleaseE2eFailure closes all open trackers', async () => {
  const { github, comments, updates } = createGithubMock({
    openIssues: [{ number: 2079 }, { number: 2100 }],
  });

  const result = await resolveReleaseE2eFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'green',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'closed');
  assert.deepEqual(result.closed, [2079, 2100]);
  assert.equal(comments.length, 2);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].state, 'closed');
  assert.equal(updates[0].state_reason, 'completed');
});

test('resolveReleaseE2eFailure is a noop when nothing is open', async () => {
  const { github, comments, updates } = createGithubMock({ openIssues: [] });

  const result = await resolveReleaseE2eFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'green',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'noop');
  assert.deepEqual(result.closed, []);
  assert.equal(comments.length, 0);
  assert.equal(updates.length, 0);
});
