import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AREA_INFRA,
  BLAST_RADIUS_INFRA,
  GENFEED_PROJECT_ID,
  PRIORITY_P0,
  WORK_TYPE_BUG,
} from './genfeed-project-board.mjs';
import {
  buildMasterCiFailureBody,
  MASTER_CI_FAILURE_LABEL,
  reportMasterCiFailure,
  resolveMasterCiFailure,
} from './master-ci-failure-reporter.mjs';

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
        getLabel: async () => ({ data: { name: MASTER_CI_FAILURE_LABEL } }),
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

test('buildMasterCiFailureBody names the commit, run, and auto-close contract', () => {
  const body = buildMasterCiFailureBody({
    date: '2026-08-08',
    sha: 'a6758fb6c',
    headline: 'fix(agent): mentions endpoints',
    runUrl: 'https://example.test/run/1',
  });

  assert.match(body, /a6758fb6c/);
  assert.match(body, /fix\(agent\): mentions endpoints/);
  assert.match(body, /https:\/\/example\.test\/run\/1/);
  assert.match(body, /Priority = P0/);
  assert.match(body, /closes automatically/);
});

test('reportMasterCiFailure comments existing open tracker and re-asserts P0', async () => {
  const { github, comments, created, graphqlCalls } = createGithubMock({
    openIssues: [{ number: 2600, pull_request: undefined }],
  });

  const result = await reportMasterCiFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'still red',
    date: '2026-08-08',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'commented');
  assert.equal(result.issueNumber, 2600);
  assert.equal(created.length, 0);
  assert.equal(comments[0].issue_number, 2600);
  assert.ok(graphqlCalls.some((c) => c.query.includes('addProjectV2ItemById')));
  assert.ok(
    graphqlCalls.some(
      (c) =>
        c.vars?.projectId === GENFEED_PROJECT_ID &&
        c.vars?.optionId === PRIORITY_P0,
    ),
  );
});

test('reportMasterCiFailure creates tracker and triages project fields', async () => {
  const { github, created, graphqlCalls } = createGithubMock({
    openIssues: [],
  });

  const result = await reportMasterCiFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'first red push',
    date: '2026-08-08',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'created');
  assert.equal(result.issueNumber, 99);
  assert.equal(created[0].labels[0], MASTER_CI_FAILURE_LABEL);
  assert.match(created[0].title, /2026-08-08/);

  const optionIds = graphqlCalls.map((c) => c.vars?.optionId).filter(Boolean);
  assert.ok(optionIds.includes(PRIORITY_P0));
  assert.ok(optionIds.includes(AREA_INFRA));
  assert.ok(optionIds.includes(WORK_TYPE_BUG));
  assert.ok(optionIds.includes(BLAST_RADIUS_INFRA));
});

test('reportMasterCiFailure still succeeds when project GraphQL is denied', async () => {
  const { github, created } = createGithubMock({ openIssues: [] });
  github.graphql = async () => {
    throw new Error('Resource not accessible by integration');
  };
  const warnings = [];

  const result = await reportMasterCiFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'first red push',
    date: '2026-08-08',
    core: {
      info: () => {},
      warning: (m) => warnings.push(m),
    },
  });

  assert.equal(result.action, 'created');
  assert.equal(created.length, 1);
  assert.ok(warnings.some((w) => w.includes('Could not triage')));
});

test('resolveMasterCiFailure closes all open trackers', async () => {
  const { github, comments, updates } = createGithubMock({
    openIssues: [{ number: 2600 }, { number: 2601 }],
  });

  const result = await resolveMasterCiFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'green again',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'closed');
  assert.deepEqual(result.closed, [2600, 2601]);
  assert.equal(comments.length, 2);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].state, 'closed');
  assert.equal(updates[0].state_reason, 'completed');
});

test('resolveMasterCiFailure is a noop when nothing is open', async () => {
  const { github, comments, updates } = createGithubMock({ openIssues: [] });

  const result = await resolveMasterCiFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'green again',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'noop');
  assert.deepEqual(result.closed, []);
  assert.equal(comments.length, 0);
  assert.equal(updates.length, 0);
});

// ── Workflow contract (#2510) ───────────────────────────────────────────────
//
// Master pushes must reach a conclusive Tests Gate, and a red gate must file
// the tracker. These pins fail the build if either half regresses to PR-only.

const CI_WORKFLOW = readFileSync(
  fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)),
  'utf8',
);

/** Slice one job out of ci.yml, ending at the next job key at the same indent. */
function ciJob(name) {
  const start = CI_WORKFLOW.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `ci.yml must define ${name}`);
  const rest = CI_WORKFLOW.slice(start + 1);
  const end = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return end === -1 ? rest : rest.slice(0, end);
}

test('tests-gate runs on master pushes as well as pull requests', () => {
  const gate = ciJob('tests-gate');
  assert.match(
    gate,
    /if: \$\{\{ always\(\) && \(github\.event_name == 'pull_request' \|\| github\.event_name == 'push'\) \}\}/,
    'tests-gate must produce a conclusive result on push events (#2510)',
  );
});

test('a red master gate files the tracker and a green one resolves it', () => {
  const report = ciJob('master-failure-report');
  assert.match(report, /needs: \[tests-gate\]/);
  assert.match(report, /!cancelled\(\)/);
  assert.match(report, /github\.event_name == 'push'/);
  assert.match(report, /needs\.tests-gate\.result == 'failure'/);
  assert.match(report, /issues: write/);
  assert.match(report, /master-ci-failure-reporter\.mjs/);

  const resolve = ciJob('master-failure-resolve');
  assert.match(resolve, /needs: \[tests-gate\]/);
  assert.match(resolve, /github\.event_name == 'push'/);
  assert.match(resolve, /needs\.tests-gate\.result == 'success'/);
  assert.match(resolve, /issues: write/);
  assert.match(resolve, /master-ci-failure-reporter\.mjs/);
});
