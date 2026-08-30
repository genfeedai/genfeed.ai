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
  buildMasterCiFailureBody,
  MASTER_CI_FAILURE_LABEL,
  reportMasterCiFailure,
  resolveMasterCiFailure,
} from './master-ci-failure-reporter.mjs';

const UNLABELED_TRACKER_TITLE =
  '🚨 Tests Gate failed on master push — 2026-08-27';

function createGithubMock({
  openIssues = [],
  unlabeledTitleIssues = [],
  createNumber = 99,
  labelsApplied = [MASTER_CI_FAILURE_LABEL],
} = {}) {
  const comments = [];
  const created = [];
  const updates = [];
  const graphqlCalls = [];
  const labelCalls = [];

  const github = {
    paginate: async (_fn, params) => {
      if (params.state !== 'open') {
        return [];
      }
      // Label lookup is how the reporter used to find trackers. Unlabeled
      // title-prefix issues must only appear on the unfiltered list, matching
      // GitHub's listForRepo `labels` filter (the production flood: 42 issues
      // with empty labels were invisible to `labels=master-ci-failure`).
      if (params.labels === MASTER_CI_FAILURE_LABEL) {
        return openIssues;
      }
      return [...openIssues, ...unlabeledTitleIssues];
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
  const { github, comments, created, labelCalls, graphqlCalls } =
    createGithubMock({
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
  assert.equal(labelCalls.length, 1);
  assert.equal(labelCalls[0].issue_number, 2600);
  assert.deepEqual(labelCalls[0].labels, [MASTER_CI_FAILURE_LABEL]);
  assert.ok(graphqlCalls.some((c) => c.query.includes('addProjectV2ItemById')));
  assert.ok(
    graphqlCalls.some(
      (c) =>
        c.vars?.issueTypeId === ISSUE_TYPE_BUG &&
        c.vars?.priority === PRIORITY_P0,
    ),
  );
});

test('reportMasterCiFailure creates tracker, sets native metadata, and adds it to the project', async () => {
  const { github, created, labelCalls, graphqlCalls } = createGithubMock({
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
  assert.match(created[0].title, /2026-08-08/);

  // Create still asks for the label, then addLabels re-applies it in case
  // GitHub silently dropped the create-time field (#3634, #3659, #3798).
  assert.deepEqual(created[0].labels, [MASTER_CI_FAILURE_LABEL]);
  assert.equal(labelCalls.length, 1);
  assert.equal(labelCalls[0].issue_number, 99);
  assert.deepEqual(labelCalls[0].labels, [MASTER_CI_FAILURE_LABEL]);

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

test('reportMasterCiFailure fails loudly when the tracker label does not land', async () => {
  // The silent-drop case (#3634, #3659): the issue is filed, the label is not,
  // and nothing downstream can ever find it again. Surfacing that as a red job
  // is the point — a silently unlabeled tracker looks like success.
  const { github, created, graphqlCalls } = createGithubMock({
    openIssues: [],
    labelsApplied: [],
  });

  await assert.rejects(
    reportMasterCiFailure({
      github,
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      body: 'first red push',
      date: '2026-08-08',
      core: { info: () => {}, warning: () => {} },
    }),
    new RegExp(`missing the ${MASTER_CI_FAILURE_LABEL} label`),
  );

  assert.equal(created.length, 1);
  // An unfindable tracker must not be promoted onto the board as if it were fine.
  assert.equal(graphqlCalls.length, 0);
});

test('reportMasterCiFailure files the issue but fails when triage GraphQL is denied', async () => {
  const { github, created } = createGithubMock({ openIssues: [] });
  github.graphql = async () => {
    throw new Error('Resource not accessible by integration');
  };
  const warnings = [];

  await assert.rejects(
    reportMasterCiFailure({
      github,
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      body: 'first red push',
      date: '2026-08-08',
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

test('reportMasterCiFailure keeps Project membership when native metadata verification fails', async () => {
  const { github, created } = createGithubMock({ openIssues: [] });
  const mutationOrder = [];
  github.graphql = async (query, vars) => {
    if (query.includes('addProjectV2ItemById')) {
      mutationOrder.push('project');
      return { addProjectV2ItemById: { item: { id: 'PROJECT_ITEM_1' } } };
    }
    mutationOrder.push('metadata');
    return {
      updateIssue: {
        issue: {
          id: vars.issueId,
          issueType: { id: ISSUE_TYPE_BUG },
          issueFieldValues: {
            nodes: [
              { field: { name: 'Priority' }, value: PRIORITY_P0 },
              { field: { name: 'Blast radius' }, value: BLAST_RADIUS_INFRA },
            ],
          },
        },
      },
    };
  };

  await assert.rejects(
    reportMasterCiFailure({
      github,
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      body: 'first red push',
      date: '2026-08-08',
      core: { info: () => {}, warning: () => {} },
    }),
    /did not persist the required native issue type and triage fields/,
  );

  assert.equal(created.length, 1);
  assert.deepEqual(mutationOrder, ['project', 'metadata']);
});

test('reportMasterCiFailure still writes native metadata when Project membership fails', async () => {
  const { github, created } = createGithubMock({ openIssues: [] });
  const mutationOrder = [];
  github.graphql = async (query, vars) => {
    if (query.includes('addProjectV2ItemById')) {
      mutationOrder.push('project');
      throw new Error('Project is unavailable');
    }
    mutationOrder.push('metadata');
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
  };

  await assert.rejects(
    reportMasterCiFailure({
      github,
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      body: 'first red push',
      date: '2026-08-08',
      core: { info: () => {}, warning: () => {} },
    }),
    /Project #12 membership failed: Project is unavailable/,
  );

  assert.equal(created.length, 1);
  assert.deepEqual(mutationOrder, ['project', 'metadata']);
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

test('reportMasterCiFailure comments an unlabeled title-prefix tracker instead of creating a duplicate', async () => {
  // Production filed 42 issues titled "🚨 Tests Gate failed on master push — …"
  // with labels: [] because create-with-labels did not stick. Lookup by label
  // then found zero open trackers and opened a new issue every red push.
  const { github, comments, created, labelCalls, graphqlCalls } =
    createGithubMock({
      openIssues: [],
      unlabeledTitleIssues: [
        {
          number: 3798,
          title: UNLABELED_TRACKER_TITLE,
          labels: [],
          pull_request: undefined,
        },
      ],
    });

  const result = await reportMasterCiFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'still red',
    date: '2026-08-27',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'commented');
  assert.equal(result.issueNumber, 3798);
  assert.equal(created.length, 0);
  assert.equal(comments[0].issue_number, 3798);
  assert.equal(labelCalls.length, 1);
  assert.equal(labelCalls[0].issue_number, 3798);
  assert.deepEqual(labelCalls[0].labels, [MASTER_CI_FAILURE_LABEL]);
  assert.ok(graphqlCalls.some((c) => c.query.includes('addProjectV2ItemById')));
});

test('reportMasterCiFailure prefers the labeled tracker over unlabeled title-prefix duplicates', async () => {
  const { github, comments, created } = createGithubMock({
    openIssues: [
      {
        number: 3798,
        title: UNLABELED_TRACKER_TITLE,
        labels: [{ name: MASTER_CI_FAILURE_LABEL }],
        pull_request: undefined,
      },
    ],
    unlabeledTitleIssues: [
      {
        number: 3701,
        title: '🚨 Tests Gate failed on master push — 2026-08-25',
        labels: [],
        pull_request: undefined,
      },
    ],
  });

  const result = await reportMasterCiFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'still red',
    date: '2026-08-27',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'commented');
  assert.equal(result.issueNumber, 3798);
  assert.equal(created.length, 0);
  assert.equal(comments[0].issue_number, 3798);
});

test('resolveMasterCiFailure closes unlabeled title-prefix trackers', async () => {
  const { github, comments, updates } = createGithubMock({
    openIssues: [],
    unlabeledTitleIssues: [
      {
        number: 3701,
        title: '🚨 Tests Gate failed on master push — 2026-08-25',
        labels: [],
      },
      {
        number: 3750,
        title: '🚨 Tests Gate failed on master push — 2026-08-26',
        labels: [],
      },
    ],
  });

  const result = await resolveMasterCiFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'green again',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'closed');
  assert.deepEqual(result.closed, [3701, 3750]);
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

test('tests-gate runs on master pushes and merge-queue runs as well as pull requests', () => {
  const gate = ciJob('tests-gate');
  assert.match(
    gate,
    /if: \$\{\{ always\(\) && \(github\.event_name == 'pull_request' \|\| github\.event_name == 'merge_group' \|\| github\.event_name == 'push'\) \}\}/,
    'tests-gate must produce a conclusive result on push (#2510) and merge_group (#3143) events',
  );
});

test('a red master gate files the tracker and a green one resolves it', () => {
  const report = ciJob('master-failure-report');
  assert.match(report, /needs: \[tests-gate\]/);
  assert.match(report, /group: master-ci-failure-tracker/);
  assert.match(report, /cancel-in-progress: false/);
  assert.match(report, /!cancelled\(\)/);
  assert.match(report, /github\.event_name == 'push'/);
  assert.match(report, /needs\.tests-gate\.result == 'failure'/);
  assert.match(report, /issues: write/);
  assert.match(report, /master-ci-failure-reporter\.mjs/);
  assert.match(
    report,
    /github-token: \$\{\{ secrets\.CONSOLE_DEPLOY_TOKEN \}\}/,
    'Project #12 writes must use the existing PAT, not repository GITHUB_TOKEN',
  );

  const resolve = ciJob('master-failure-resolve');
  assert.match(resolve, /needs: \[tests-gate\]/);
  assert.match(resolve, /group: master-ci-failure-tracker/);
  assert.match(resolve, /cancel-in-progress: false/);
  // Without a status function the implicit `success()` spans the transitive
  // needs graph, where skipped test lanes are routine — the resolve arm was
  // skipped on every green master push until this was pinned (#2625).
  assert.match(
    resolve,
    /!cancelled\(\)/,
    'master-failure-resolve must opt out of transitive skip propagation (#2625)',
  );
  assert.match(resolve, /github\.event_name == 'push'/);
  assert.match(resolve, /needs\.tests-gate\.result == 'success'/);
  assert.match(resolve, /issues: write/);
  assert.match(resolve, /master-ci-failure-reporter\.mjs/);
});
