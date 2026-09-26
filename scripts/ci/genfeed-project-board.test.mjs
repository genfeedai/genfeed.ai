import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AREA_INFRA,
  BLAST_RADIUS_INFRA,
  GENFEED_PROJECT_ID,
  ISSUE_TYPE_BUG,
  PRIORITY_P0,
  triageCiFailureOnProject,
} from './genfeed-project-board.mjs';

function resourceNotAccessibleError({ status = 403 } = {}) {
  const error = new Error('Resource not accessible by personal access token');
  error.status = status;
  return error;
}

function forbiddenGraphqlError() {
  const error = new Error('Request failed due to following response errors');
  error.errors = [
    { type: 'FORBIDDEN', message: 'Resource not accessible by integration' },
  ];
  return error;
}

function createGithubMock({
  currentPriority = null,
  onAddToProject,
  onUpdateIssue,
} = {}) {
  const graphqlCalls = [];

  const github = {
    rest: {
      issues: {
        get: async ({ issue_number }) => ({
          data: { number: issue_number, node_id: `ISSUE_NODE_${issue_number}` },
        }),
      },
    },
    graphql: async (query, vars) => {
      graphqlCalls.push({ query, vars });

      if (query.includes('addProjectV2ItemById')) {
        if (onAddToProject) {
          return onAddToProject(vars);
        }
        return { addProjectV2ItemById: { item: { id: 'PROJECT_ITEM_1' } } };
      }

      if (query.includes('updateIssue(')) {
        if (onUpdateIssue) {
          return onUpdateIssue(vars);
        }
        return {
          updateIssue: {
            issue: {
              id: vars.issueId,
              issueType: { id: ISSUE_TYPE_BUG },
              issueFieldValues: {
                nodes: [
                  { field: { name: 'Priority' }, value: vars.priority },
                  { field: { name: 'Area' }, value: vars.area },
                  {
                    field: { name: 'Blast radius' },
                    value: vars.blastRadius,
                  },
                ],
              },
            },
          },
        };
      }

      // The current-Priority read query.
      return {
        node: {
          issueFieldValues: {
            nodes: currentPriority
              ? [{ field: { name: 'Priority' }, value: currentPriority }]
              : [],
          },
        },
      };
    },
  };

  return { github, graphqlCalls };
}

test('triageCiFailureOnProject sets native metadata and adds the project item on success', async () => {
  const { github, graphqlCalls } = createGithubMock();
  const warnings = [];

  const result = await triageCiFailureOnProject(github, {
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    issueNumber: 4375,
    trackerName: 'nightly-e2e-failure',
    core: { info: () => {}, warning: (msg) => warnings.push(msg) },
  });

  assert.deepEqual(result, {
    ok: true,
    itemId: 'PROJECT_ITEM_1',
    degraded: false,
  });
  assert.equal(warnings.length, 0);
  assert.ok(
    graphqlCalls.some(
      (call) =>
        call.query.includes('addProjectV2ItemById') &&
        call.vars.projectId === GENFEED_PROJECT_ID,
    ),
  );
  const metadataCall = graphqlCalls.find((call) =>
    call.query.includes('updateIssue('),
  );
  assert.equal(metadataCall.vars.issueTypeId, ISSUE_TYPE_BUG);
  assert.equal(metadataCall.vars.priority, PRIORITY_P0);
  assert.equal(metadataCall.vars.area, AREA_INFRA);
  assert.equal(metadataCall.vars.blastRadius, BLAST_RADIUS_INFRA);
});

test('triageCiFailureOnProject degrades a rejected native-metadata mutation to a single warning, not a thrown error', async () => {
  const { github } = createGithubMock({
    onUpdateIssue: () => {
      throw resourceNotAccessibleError();
    },
  });
  const warnings = [];

  const result = await triageCiFailureOnProject(github, {
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    issueNumber: 4375,
    trackerName: 'nightly-e2e-failure',
    core: { info: () => {}, warning: (msg) => warnings.push(msg) },
  });

  // The reporter job must not fail solely because the token cannot set
  // native metadata: project membership still landed and the call resolves.
  assert.equal(result.ok, true);
  assert.equal(result.degraded, true);
  assert.equal(result.itemId, 'PROJECT_ITEM_1');

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /native issue type and org issue fields/u);
  assert.match(warnings[0], /not authorized/u);
});

test('triageCiFailureOnProject degrades a GraphQL FORBIDDEN error the same as an HTTP 403', async () => {
  const { github } = createGithubMock({
    onAddToProject: () => {
      throw forbiddenGraphqlError();
    },
  });
  const warnings = [];

  const result = await triageCiFailureOnProject(github, {
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    issueNumber: 4375,
    trackerName: 'nightly-e2e-failure',
    core: { info: () => {}, warning: (msg) => warnings.push(msg) },
  });

  assert.equal(result.ok, true);
  assert.equal(result.degraded, true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Project #12 membership/u);
});

test('triageCiFailureOnProject still throws for a non-permission metadata failure', async () => {
  const { github } = createGithubMock({
    onUpdateIssue: () => {
      throw new Error('GraphQL request timed out');
    },
  });
  const warnings = [];

  await assert.rejects(
    triageCiFailureOnProject(github, {
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      issueNumber: 4375,
      trackerName: 'nightly-e2e-failure',
      core: { info: () => {}, warning: (msg) => warnings.push(msg) },
    }),
    /Native issue metadata failed: GraphQL request timed out/u,
  );
  assert.ok(warnings.length > 0);
});

test('triageCiFailureOnProject treats a permission rejection as fatal when metadataRequired is set', async () => {
  const { github } = createGithubMock({
    onUpdateIssue: () => {
      throw resourceNotAccessibleError();
    },
  });

  await assert.rejects(
    triageCiFailureOnProject(github, {
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      issueNumber: 4375,
      trackerName: 'nightly-e2e-failure',
      metadataRequired: true,
      core: { info: () => {}, warning: () => {} },
    }),
    /Native issue metadata failed/u,
  );
});

test('triageCiFailureOnProject does not overwrite a human-set Priority with the default', async () => {
  const { github, graphqlCalls } = createGithubMock({ currentPriority: 'P1' });

  const result = await triageCiFailureOnProject(github, {
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    issueNumber: 4375,
    trackerName: 'nightly-e2e-failure',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.ok, true);
  const metadataCall = graphqlCalls.find((call) =>
    call.query.includes('updateIssue('),
  );
  assert.equal(metadataCall.vars.priority, 'P1');
});

test('triageCiFailureOnProject sets the default Priority when none is set yet', async () => {
  const { github, graphqlCalls } = createGithubMock({ currentPriority: null });

  await triageCiFailureOnProject(github, {
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    issueNumber: 4375,
    trackerName: 'nightly-e2e-failure',
    core: { info: () => {}, warning: () => {} },
  });

  const metadataCall = graphqlCalls.find((call) =>
    call.query.includes('updateIssue('),
  );
  assert.equal(metadataCall.vars.priority, PRIORITY_P0);
});

test('triageCiFailureOnProject re-sends the existing P0 rather than treating it as human-overridden', async () => {
  const { github, graphqlCalls } = createGithubMock({
    currentPriority: PRIORITY_P0,
  });

  await triageCiFailureOnProject(github, {
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    issueNumber: 4375,
    trackerName: 'nightly-e2e-failure',
    core: { info: () => {}, warning: () => {} },
  });

  const metadataCall = graphqlCalls.find((call) =>
    call.query.includes('updateIssue('),
  );
  assert.equal(metadataCall.vars.priority, PRIORITY_P0);
});
