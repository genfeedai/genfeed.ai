import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AREA_INFRA,
  BLAST_RADIUS_INFRA,
  ISSUE_TYPE_BUG,
  PRIORITY_P0,
} from './genfeed-project-board.mjs';
import {
  buildReleaseE2eFailureBody,
  RELEASE_E2E_FAILURE_LABEL,
  reportReleaseE2eFailure,
  resolveReleaseE2eFailure,
} from './release-e2e-failure-reporter.mjs';

function createGithubMock({
  openIssues = [],
  createNumber = 99,
  labelsApplied = [RELEASE_E2E_FAILURE_LABEL],
} = {}) {
  const comments = [];
  const created = [];
  const updates = [];
  const graphqlCalls = [];
  const labelCalls = [];

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
        // Mirrors the real endpoint: it returns the issue's labels AFTER the
        // add, which is the only trustworthy signal that the label landed.
        addLabels: async (payload) => {
          labelCalls.push(payload);
          return { data: labelsApplied.map((name) => ({ name })) };
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
      if (query.includes('updateIssue(')) {
        return {
          updateIssue: {
            issue: {
              id: vars.issueId,
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
      if (query.includes('addProjectV2ItemById')) {
        return {
          addProjectV2ItemById: { item: { id: 'PROJECT_ITEM_1' } },
        };
      }
      return {
        unexpectedMutation: true,
      };
    },
  };

  return { github, comments, created, labelCalls, updates, graphqlCalls };
}

test('buildReleaseE2eFailureBody names Priority as native issue metadata', () => {
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
        c.vars?.issueTypeId === ISSUE_TYPE_BUG &&
        c.vars?.priority === PRIORITY_P0,
    ),
  );
});

test('reportReleaseE2eFailure creates tracker, sets native metadata, and adds it to the project', async () => {
  const { github, created, labelCalls, graphqlCalls } = createGithubMock({
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
  assert.match(created[0].title, /2026-07-26/);

  // The label is applied through addLabels, never left to create-time labels:
  // GitHub silently drops that field for a token without push access, and an
  // unlabeled tracker is invisible to both the dedupe and the resolve path.
  assert.equal(labelCalls.length, 1);
  assert.equal(labelCalls[0].issue_number, 99);
  assert.deepEqual(labelCalls[0].labels, [RELEASE_E2E_FAILURE_LABEL]);

  const nativeUpdate = graphqlCalls.find((c) =>
    c.query.includes('updateIssue('),
  );
  assert.equal(nativeUpdate.vars.issueTypeId, ISSUE_TYPE_BUG);
  assert.equal(nativeUpdate.vars.priority, PRIORITY_P0);
  assert.equal(nativeUpdate.vars.area, AREA_INFRA);
  assert.equal(nativeUpdate.vars.blastRadius, BLAST_RADIUS_INFRA);
  assert.ok(graphqlCalls.some((c) => c.query.includes('addProjectV2ItemById')));
  assert.equal(
    graphqlCalls.some((c) => c.query.includes('updateProjectV2ItemFieldValue')),
    false,
  );
});

test('reportReleaseE2eFailure fails loudly when the tracker label does not land', async () => {
  // The silent-drop case: the issue is filed, the label is not, and nothing
  // downstream can ever find it again. Surfacing that as a red job is the
  // point — a silently unlabeled tracker looks like success.
  const { github, created, graphqlCalls } = createGithubMock({
    openIssues: [],
    labelsApplied: [],
  });

  await assert.rejects(
    reportReleaseE2eFailure({
      github,
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      body: 'first failure',
      date: '2026-07-26',
      core: { info: () => {}, warning: () => {} },
    }),
    new RegExp(`missing the ${RELEASE_E2E_FAILURE_LABEL} label`),
  );

  assert.equal(created.length, 1);
  // An unfindable tracker must not be promoted onto the board as if it were fine.
  assert.equal(graphqlCalls.length, 0);
});

test('reportReleaseE2eFailure files the issue but fails when triage GraphQL is denied', async () => {
  const { github, created } = createGithubMock({ openIssues: [] });
  github.graphql = async () => {
    throw new Error('Resource not accessible by integration');
  };
  const warnings = [];

  await assert.rejects(
    reportReleaseE2eFailure({
      github,
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      body: 'first failure',
      date: '2026-07-26',
      core: {
        info: () => {},
        warning: (m) => warnings.push(m),
      },
    }),
    /Resource not accessible by integration/,
  );

  assert.equal(created.length, 1);
  assert.ok(warnings.some((w) => w.includes('Could not triage')));
});

const RELEASE_E2E_WORKFLOW = readFileSync(
  fileURLToPath(
    new URL(
      '../../.github/workflows/e2e-selfhosted-release.yml',
      import.meta.url,
    ),
  ),
  'utf8',
);

test('release failure triage uses the existing PAT for issue metadata and Project membership writes', () => {
  assert.match(
    RELEASE_E2E_WORKFLOW,
    /Open or update tracking issue \(Priority P0\)[\s\S]*?github-token: \$\{\{ secrets\.CONSOLE_DEPLOY_TOKEN \}\}/,
  );
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
