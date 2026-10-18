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
  FOREIGN_MASTER_CI_TRACKER_LABELS,
  isForeignWorkflowTracker,
  MASTER_CI_FAILURE_LABEL,
  reportMasterCiFailure,
  resolveMasterCiFailure,
  updateMasterCiFailureFromVerdict,
} from './master-ci-failure-reporter.mjs';
import { NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL } from './nightly-playwright-full-failure-reporter.mjs';
import { SCHEDULED_FAILURE_MARKER } from './scheduled-failure-tracker.mjs';

const UNLABELED_TRACKER_TITLE = '🚨 Full Suite failed on master — 2026-08-27';

function createGithubMock({
  openIssues = [],
  unlabeledTitleIssues = [],
  createNumber = 99,
  labelsApplied = [MASTER_CI_FAILURE_LABEL],
  masterSha = 'a'.repeat(40),
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
      git: {
        getRef: async ({ ref }) => {
          assert.equal(ref, 'heads/master');
          return { data: { object: { sha: masterSha } } };
        },
      },
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

test('repository credentials label new and existing trackers while project credentials triage', async () => {
  for (const openIssues of [[], [{ number: 42 }]]) {
    const repository = createGithubMock({ openIssues });
    const project = createGithubMock();
    await reportMasterCiFailure({
      github: repository.github,
      projectGithub: project.github,
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      body: 'Failure',
      date: '2026-09-06',
      core: { info() {}, warning() {} },
    });
    assert.equal(repository.labelCalls.length, 1);
    assert.equal(project.labelCalls.length, 0);
    assert.equal(repository.graphqlCalls.length, 0);
    assert.ok(project.graphqlCalls.length > 0);
  }
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

test('reportMasterCiFailure files the issue and warns once, without failing the job, when triage GraphQL is permission-denied', async () => {
  // Regression test for #5204: the reporter token (Genfeed bot App) can
  // lack the org-level scopes for native issue metadata / Project #12. That
  // must degrade to a single actionable warning, not fail the job — the
  // tracker issue itself was already created by this point.
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
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /not authorized/);
});

test('reportMasterCiFailure keeps Project membership when native metadata verification fails', async () => {
  const { github, created } = createGithubMock({ openIssues: [] });
  const mutationOrder = [];
  github.graphql = async (query, vars) => {
    if (query.includes('addProjectV2ItemById')) {
      mutationOrder.push('project');
      return { addProjectV2ItemById: { item: { id: 'PROJECT_ITEM_1' } } };
    }
    if (query.includes('updateIssue(')) {
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
    }
    // The current-Priority read, ahead of the metadata write.
    mutationOrder.push('priority-read');
    return { node: { issueFieldValues: { nodes: [] } } };
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
  assert.deepEqual(mutationOrder, ['project', 'priority-read', 'metadata']);
});

test('reportMasterCiFailure still writes native metadata when Project membership fails', async () => {
  const { github, created } = createGithubMock({ openIssues: [] });
  const mutationOrder = [];
  github.graphql = async (query, vars) => {
    if (query.includes('addProjectV2ItemById')) {
      mutationOrder.push('project');
      throw new Error('Project is unavailable');
    }
    if (query.includes('updateIssue(')) {
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
    }
    // The current-Priority read, ahead of the metadata write.
    mutationOrder.push('priority-read');
    return { node: { issueFieldValues: { nodes: [] } } };
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
  assert.deepEqual(mutationOrder, ['project', 'priority-read', 'metadata']);
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

test('foreign tracker labels include the nightly Playwright full-tier label', () => {
  assert.ok(
    FOREIGN_MASTER_CI_TRACKER_LABELS.includes(
      NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL,
    ),
  );
  assert.equal(
    isForeignWorkflowTracker({
      title: 'Fix six app-core regressions in Nightly Playwright',
      labels: [
        { name: MASTER_CI_FAILURE_LABEL },
        { name: NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL },
      ],
    }),
    true,
  );
  assert.equal(
    isForeignWorkflowTracker({
      title: UNLABELED_TRACKER_TITLE,
      labels: [{ name: MASTER_CI_FAILURE_LABEL }],
    }),
    false,
  );
});

test('resolveMasterCiFailure does not close a nightly Playwright tracker that also carries master-ci-failure', async () => {
  // #4579 was labeled both `master-ci-failure` and
  // `nightly-playwright-full-failure`. A green Tests Gate then closed it
  // while the nightly full tier was still red (#4689).
  const { github, comments, updates } = createGithubMock({
    openIssues: [
      {
        number: 4579,
        title: 'Fix six app-core regressions in Nightly Playwright',
        labels: [
          { name: MASTER_CI_FAILURE_LABEL },
          { name: NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL },
        ],
      },
    ],
  });

  const result = await resolveMasterCiFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'Tests Gate is green on master',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'noop');
  assert.deepEqual(result.closed, []);
  assert.equal(comments.length, 0);
  assert.equal(updates.length, 0);
});

test('resolveMasterCiFailure still closes Tests Gate trackers when a nightly tracker is also labeled', async () => {
  const { github, comments, updates } = createGithubMock({
    openIssues: [
      {
        number: 2600,
        title: UNLABELED_TRACKER_TITLE,
        labels: [{ name: MASTER_CI_FAILURE_LABEL }],
      },
      {
        number: 4579,
        title: 'Fix six app-core regressions in Nightly Playwright',
        labels: [
          { name: MASTER_CI_FAILURE_LABEL },
          { name: NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL },
        ],
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
  assert.deepEqual(result.closed, [2600]);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].issue_number, 2600);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].issue_number, 2600);
});

test('reportMasterCiFailure files a new Tests Gate tracker instead of commenting on a nightly issue', async () => {
  const { github, comments, created } = createGithubMock({
    openIssues: [
      {
        number: 4579,
        title: 'Fix six app-core regressions in Nightly Playwright',
        labels: [
          { name: MASTER_CI_FAILURE_LABEL },
          { name: NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL },
        ],
      },
    ],
  });

  const result = await reportMasterCiFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    body: 'Tests Gate failed on a master push',
    date: '2026-09-08',
    core: { info: () => {}, warning: () => {} },
  });

  assert.equal(result.action, 'created');
  assert.equal(result.issueNumber, 99);
  assert.equal(comments.length, 0);
  assert.equal(created.length, 1);
  assert.match(created[0].title, /^🚨 Full Suite failed on master/);
});

test('resolveMasterCiFailure does not close a scheduled-failure tracker that only has the Tests Gate label', async () => {
  const { github, comments, updates } = createGithubMock({
    openIssues: [
      {
        number: 4544,
        title:
          '[Scheduled failure] .github/workflows/playwright-full-nightly.yml / e2e-frontend-full / test-assertion',
        labels: [{ name: MASTER_CI_FAILURE_LABEL }],
        body: `<!-- ${SCHEDULED_FAILURE_MARKER}:eyJ3b3JrZmxvd0lkZW50aXR5IjoicGxheXdyaWdodC1mdWxsLW5pZ2h0bHkifQ -->\nNightly full tier failed.`,
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

  assert.equal(result.action, 'noop');
  assert.deepEqual(result.closed, []);
  assert.equal(comments.length, 0);
  assert.equal(updates.length, 0);
});

const GREEN_RESULTS = {
  ci: 'success',
  'build-verify': 'success',
  e2e: 'success',
  'visual-connected': 'skipped',
  'runtime-acceptance-gate': 'skipped',
};

function verdictInput(mock, overrides = {}) {
  return {
    github: mock.github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    defaultBranch: 'master',
    sha: 'a'.repeat(40),
    verdict: 'failure',
    results: { ...GREEN_RESULTS, e2e: 'failure' },
    date: '2026-10-17',
    headline: 'fix: validated commit',
    runUrl: 'https://example.test/run/2',
    core: { info: () => {}, warning: () => {} },
    ...overrides,
  };
}

test('an E2E-only red aggregate opens the tracker despite a green CI gate', async () => {
  const mock = createGithubMock();
  const result = await updateMasterCiFailureFromVerdict(verdictInput(mock));
  assert.equal(result.action, 'created');
  assert.equal(mock.created.length, 1);
  assert.match(mock.created[0].body, /Full Suite/);
  assert.match(mock.created[0].body, /ci=success/);
  assert.match(mock.created[0].body, /e2e=failure/);
  assert.equal(mock.updates.length, 0);
});

test('a green CI gate with red E2E updates an existing tracker without closing it', async () => {
  const mock = createGithubMock({ openIssues: [{ number: 5884 }] });
  const result = await updateMasterCiFailureFromVerdict(verdictInput(mock));
  assert.equal(result.action, 'commented');
  assert.equal(mock.comments[0].issue_number, 5884);
  assert.equal(mock.updates.length, 0);
});

test('a complete green current-SHA aggregate closes only its own trackers', async () => {
  const mock = createGithubMock({
    openIssues: [
      { number: 5884 },
      {
        number: 6150,
        labels: [{ name: NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL }],
      },
    ],
  });
  const result = await updateMasterCiFailureFromVerdict(
    verdictInput(mock, { verdict: 'success', results: GREEN_RESULTS }),
  );
  assert.deepEqual(result.closed, [5884]);
  assert.match(mock.comments[0].body, /Full Suite is green/);
  assert.equal(mock.updates.length, 1);
  assert.equal(mock.updates[0].issue_number, 5884);
});

for (const verdict of ['success', 'failure']) {
  test(`a stale/nontrunk SHA cannot ${verdict === 'success' ? 'close' : 'open'} a trunk tracker`, async () => {
    const mock = createGithubMock({
      masterSha: 'b'.repeat(40),
      openIssues: [{ number: 5884 }],
    });
    const result = await updateMasterCiFailureFromVerdict(
      verdictInput(mock, { verdict }),
    );
    assert.equal(result.action, 'ignored');
    assert.equal(
      mock.comments.length + mock.created.length + mock.updates.length,
      0,
    );
    assert.equal(mock.graphqlCalls.length, 0);
  });
}

for (const overrides of [
  { verdict: 'cancelled' },
  { verdict: 'skipped' },
  { results: { ...GREEN_RESULTS, e2e: 'cancelled' } },
]) {
  test(`incomplete verification cannot mutate a tracker: ${JSON.stringify(overrides)}`, async () => {
    const mock = createGithubMock({ openIssues: [{ number: 5884 }] });
    const result = await updateMasterCiFailureFromVerdict(
      verdictInput(mock, overrides),
    );
    assert.equal(result.action, 'ignored');
    assert.equal(
      mock.comments.length + mock.created.length + mock.updates.length,
      0,
    );
    assert.equal(mock.graphqlCalls.length, 0);
  });
}

test('a failed freshness lookup propagates without issue writes', async () => {
  const mock = createGithubMock();
  mock.github.rest.git.getRef = async () => {
    throw new Error('lookup unavailable');
  };
  await assert.rejects(
    updateMasterCiFailureFromVerdict(verdictInput(mock)),
    /lookup unavailable/,
  );
  assert.equal(
    mock.comments.length + mock.created.length + mock.updates.length,
    0,
  );
});

const CI_WORKFLOW = readFileSync(
  fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)),
  'utf8',
);
const FULL_SUITE = readFileSync(
  fileURLToPath(
    new URL('../../.github/workflows/full-suite.yml', import.meta.url),
  ),
  'utf8',
);

function suiteJob(name) {
  const start = FULL_SUITE.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `full-suite.yml must define ${name}`);
  const rest = FULL_SUITE.slice(start + 1);
  const end = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return end === -1 ? rest : rest.slice(0, end);
}

test('the tracker consumes the aggregate and cannot be closed by the CI gate alone', () => {
  assert.doesNotMatch(CI_WORKFLOW, /^ {2}master-failure-tracker:/m);
  const tracker = suiteJob('master-failure-tracker');
  assert.match(
    tracker,
    /needs: \[master-sha-verdict, ci, build-verify, e2e, visual-connected, runtime-acceptance-gate\]/,
  );
  assert.match(tracker, /!cancelled\(\)/);
  assert.match(tracker, /needs\.master-sha-verdict\.result == 'failure'/);
  assert.match(tracker, /needs\.master-sha-verdict\.result == 'success'/);
  assert.doesNotMatch(tracker, /needs\.tests-gate/);
  assert.match(tracker, /group: master-ci-failure-tracker/);
  assert.match(tracker, /cancel-in-progress: false/);
  assert.match(tracker, /continue-on-error: true/);
  assert.match(tracker, /issues: write/);
  assert.match(
    tracker,
    /VERDICT: \$\{\{ needs\.master-sha-verdict\.result \}\}/,
  );
  for (const [name, id] of [
    ['CI_RESULT', 'ci'],
    ['BUILD_RESULT', 'build-verify'],
    ['E2E_RESULT', 'e2e'],
    ['VISUAL_RESULT', 'visual-connected'],
    ['CONNECTED_RESULT', 'runtime-acceptance-gate'],
  ]) {
    assert.ok(tracker.includes(`${name}: \${{ needs.${id}.result }}`));
  }
  assert.match(tracker, /updateMasterCiFailureFromVerdict/);
  assert.match(tracker, /github: getOctokit\(process\.env\.REPOSITORY_TOKEN\)/);
  assert.match(tracker, /projectGithub: github/);
  assert.match(
    tracker,
    /github-token: \$\{\{ steps\.reporter-token\.outputs\.token \|\| github\.token \}\}/,
  );
});

test('the tracker validates a current trusted SHA before checkout or App credentials', () => {
  const tracker = suiteJob('master-failure-tracker');
  const preflight = tracker.indexOf(
    '- name: Validate current default-branch SHA',
  );
  const checkout = tracker.indexOf('- name: Checkout failure reporter');
  const mint = tracker.indexOf('- name: Mint reporter token (Genfeed bot App)');
  assert.ok(preflight !== -1 && preflight < checkout && checkout < mint);
  assert.match(tracker, /github\.rest\.git\.getRef/);
  assert.match(
    tracker,
    /ref: `heads\/\$\{context\.payload\.repository\.default_branch\}`/,
  );
  assert.match(tracker, /data\.object\.sha === context\.sha/);
  assert.equal(
    (
      tracker.match(/if: steps\.trusted-head\.outputs\.current == 'true'/g) ??
      []
    ).length,
    4,
  );
  assert.match(tracker, /persist-credentials: false/);
  assert.match(tracker, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(
    tracker,
    /client-id: \$\{\{ secrets\.GENFEED_BOT_CLIENT_ID \}\}/,
  );
  assert.match(
    tracker,
    /private-key: \$\{\{ secrets\.GENFEED_BOT_PRIVATE_KEY \}\}/,
  );
  assert.doesNotMatch(tracker, /CONSOLE_DEPLOY_TOKEN/);
});
