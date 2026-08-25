import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanMergeQueueRuns,
  MERGE_QUEUE_REF_PREFIX,
} from './merge-queue-janitor.mjs';

function createJanitorFixture({
  runs = [],
  liveRefs = [],
  refErrors = new Map(),
  cancelFailures = new Map(),
} = {}) {
  const calls = { cancels: [], listings: [], refChecks: [] };
  const listWorkflowRunsForRepo = async () => {
    throw new Error('listWorkflowRunsForRepo must go through github.paginate');
  };

  const github = {
    paginate: async (endpoint, options) => {
      assert.equal(endpoint, listWorkflowRunsForRepo);
      calls.listings.push({ ...options });
      return runs.filter((run) => run.status === options.status);
    },
    rest: {
      actions: {
        cancelWorkflowRun: async (input) => {
          calls.cancels.push({ ...input });
          const failureStatus = cancelFailures.get(input.run_id);
          if (failureStatus) {
            const error = new Error(`cancel failed (${failureStatus})`);
            error.status = failureStatus;
            throw error;
          }
          return { data: {} };
        },
        listWorkflowRunsForRepo,
      },
      git: {
        getRef: async (input) => {
          calls.refChecks.push({ ...input });
          const errorStatus = refErrors.get(input.ref);
          if (errorStatus) {
            const error = new Error(`ref lookup failed (${errorStatus})`);
            error.status = errorStatus;
            throw error;
          }
          if (liveRefs.includes(input.ref)) {
            return { data: {} };
          }
          const error = new Error('Not Found');
          error.status = 404;
          throw error;
        },
      },
    },
  };

  return { calls, github };
}

const silentCore = { info: () => {}, warning: () => {} };

test('cancels queued and in-progress runs whose queue ref is gone', async () => {
  const fixture = createJanitorFixture({
    runs: [
      {
        head_branch: `${MERGE_QUEUE_REF_PREFIX}master/pr-100-abc`,
        id: 1,
        status: 'queued',
      },
      {
        head_branch: `${MERGE_QUEUE_REF_PREFIX}master/pr-101-def`,
        id: 2,
        status: 'in_progress',
      },
    ],
  });

  const result = await cleanMergeQueueRuns({
    github: fixture.github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    core: silentCore,
  });

  assert.deepEqual(result, { cancelled: [1, 2], errors: [], kept: [] });
  assert.deepEqual(
    fixture.calls.listings.map(({ event, status }) => ({ event, status })),
    [
      { event: 'merge_group', status: 'queued' },
      { event: 'merge_group', status: 'in_progress' },
    ],
  );
  assert.deepEqual(
    fixture.calls.cancels.map(({ run_id }) => run_id),
    [1, 2],
  );
});

test('keeps runs on live queue refs and runs outside the queue namespace', async () => {
  const liveRef = `heads/${MERGE_QUEUE_REF_PREFIX}master/pr-200-live`;
  const fixture = createJanitorFixture({
    liveRefs: [liveRef],
    runs: [
      {
        head_branch: `${MERGE_QUEUE_REF_PREFIX}master/pr-200-live`,
        id: 10,
        status: 'queued',
      },
      // merge_group runs always ride queue refs, but the janitor must never
      // trust that: anything outside the namespace is not its business.
      { head_branch: 'feat/some-branch', id: 11, status: 'in_progress' },
    ],
  });

  const result = await cleanMergeQueueRuns({
    github: fixture.github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    core: silentCore,
  });

  assert.deepEqual(result, { cancelled: [], errors: [], kept: [10, 11] });
  assert.equal(fixture.calls.cancels.length, 0);
  // The non-queue branch never triggers a ref lookup.
  assert.deepEqual(
    fixture.calls.refChecks.map(({ ref }) => ref),
    [liveRef],
  );
});

test('tolerates cancel API failures per run instead of aborting the sweep', async () => {
  // Zombie records with zero jobs have answered the cancel API with HTTP 500;
  // the sweep must record the miss and still cancel every other zombie.
  const fixture = createJanitorFixture({
    cancelFailures: new Map([[20, 500]]),
    runs: [
      {
        head_branch: `${MERGE_QUEUE_REF_PREFIX}master/pr-300-aaa`,
        id: 20,
        status: 'queued',
      },
      {
        head_branch: `${MERGE_QUEUE_REF_PREFIX}master/pr-301-bbb`,
        id: 21,
        status: 'queued',
      },
    ],
  });

  const result = await cleanMergeQueueRuns({
    github: fixture.github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    core: silentCore,
  });

  assert.deepEqual(result, {
    cancelled: [21],
    errors: [{ runId: 20, status: 500 }],
    kept: [],
  });
});

test('propagates unexpected ref-lookup failures instead of cancelling blind', async () => {
  // Anything other than a clean 404 (rate limit, auth, outage) leaves the
  // ref's existence unknown — cancelling on that would kill a live queue
  // entry and drop its PR out of the merge queue.
  const fixture = createJanitorFixture({
    refErrors: new Map([
      [`heads/${MERGE_QUEUE_REF_PREFIX}master/pr-400-ccc`, 403],
    ]),
    runs: [
      {
        head_branch: `${MERGE_QUEUE_REF_PREFIX}master/pr-400-ccc`,
        id: 30,
        status: 'queued',
      },
    ],
  });

  await assert.rejects(
    cleanMergeQueueRuns({
      github: fixture.github,
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      core: silentCore,
    }),
    /ref lookup failed \(403\)/,
  );
  assert.equal(fixture.calls.cancels.length, 0);
});
