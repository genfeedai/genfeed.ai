import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { recoverClaStatuses } from './cla-status-recovery.mjs';

function fixture({ statuses = [], responses = [302], heads = ['abc'] } = {}) {
  const requests = [];
  const statusReads = [];
  let reads = 0;
  const github = {
    rest: {
      pulls: {
        get: async () => ({
          data: {
            number: 6403,
            state: 'open',
            head: { sha: heads.shift() ?? 'abc' },
          },
        }),
      },
    },
    paginate: async (_route, args) => {
      statusReads.push(args.ref);
      return statuses[Math.min(reads++, statuses.length - 1)] ?? [];
    },
  };
  github.rest.repos = { listCommitStatusesForRef: 'statuses' };
  return {
    github,
    requests,
    statusReads,
    options: {
      owner: 'genfeedai',
      repo: 'genfeed.ai',
      numbers: [6403],
      attempts: 2,
      wait: async () => {},
      request: async (url, options) => {
        requests.push({ url: String(url), ...options });
        return { status: responses.shift() ?? 302 };
      },
    },
  };
}

const signed = { context: 'license/cla', state: 'success' };

test('recovers an accepted webhook that never posted a status', async () => {
  const f = fixture({ statuses: [[], [], [signed]] });
  const result = await recoverClaStatuses(f.github, f.options);
  assert.deepEqual(result, [
    { number: 6403, sha: 'abc', outcome: 'reported', state: 'success' },
  ]);
  assert.equal(f.requests.length, 2);
  assert.equal(
    f.requests[0].url,
    'https://cla-assistant.io/check/genfeedai/genfeed.ai?pullRequest=6403',
  );
  assert.equal(f.requests[0].redirect, 'manual');
});

test('retries a hosted outage and verifies the actual commit status', async () => {
  const f = fixture({ statuses: [[], [], [signed]], responses: [503, 302] });
  assert.equal(
    (await recoverClaStatuses(f.github, f.options))[0].state,
    'success',
  );
  assert.equal(f.requests.length, 2);
});

test('a redirect without a status fails instead of reporting recovery', async () => {
  const f = fixture();
  await assert.rejects(
    recoverClaStatuses(f.github, f.options),
    /6403.*license\/cla.*abc/,
  );
  assert.equal(f.requests.length, 2);
});

test('preserves legitimate unsigned and failed CLA verdicts', async () => {
  for (const state of ['pending', 'failure', 'error']) {
    const f = fixture({ statuses: [[{ ...signed, state }]] });
    assert.equal(
      (await recoverClaStatuses(f.github, f.options))[0].state,
      state,
    );
    assert.equal(f.requests.length, 0);
  }
});

test('does not use another context or an older status as CLA approval', async () => {
  const f = fixture({
    statuses: [[{ context: 'Tests Gate', state: 'success' }]],
  });
  await assert.rejects(recoverClaStatuses(f.github, f.options), /license\/cla/);
  assert.deepEqual(f.statusReads, ['abc', 'abc', 'abc']);
});

test('a push during recovery supersedes the old head', async () => {
  const f = fixture({ heads: ['abc', 'def'] });
  assert.deepEqual(await recoverClaStatuses(f.github, f.options), [
    { number: 6403, sha: 'abc', outcome: 'superseded' },
  ]);
  assert.equal(f.requests.length, 1);
});

test('continues recovering other PRs when one remains missing', async () => {
  const f = fixture();
  f.options.numbers = [6403, 6404];
  await assert.rejects(recoverClaStatuses(f.github, f.options), /6403.*6404/s);
  assert.equal(f.requests.length, 4);
});

test('rejects malformed destinations and PR numbers before network access', async () => {
  for (const options of [
    { owner: '../evil' },
    { repo: 'repo?x=1' },
    { numbers: [0] },
    { numbers: ['6403&other=1'] },
  ]) {
    const f = fixture();
    await assert.rejects(
      recoverClaStatuses(f.github, { ...f.options, ...options }),
      /Invalid/,
    );
    assert.equal(f.requests.length, 0);
  }
});

test('workflow runs trusted code and grants no status-writing permission', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/cla-status-recovery.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /statuses: read/);
  assert.doesNotMatch(
    workflow,
    /statuses: write|pull_request\.head|secrets\.GENFEED|cancel-in-progress: true/,
  );
});
