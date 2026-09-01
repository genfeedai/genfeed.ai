import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveFullSuiteEvidence,
  selectFullSuiteRun,
} from './full-suite-evidence.mjs';

const RELEASE_SHA = '9aa1d2ef5a829b8688e3aebcb830609f40f00d12';

function run(overrides = {}) {
  return {
    id: 33504809990,
    created_at: '2026-09-01T11:53:47Z',
    event: 'push',
    head_branch: 'master',
    head_sha: RELEASE_SHA,
    html_url:
      'https://github.com/genfeedai/genfeed.ai/actions/runs/33504809990',
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  };
}

function harness(overrides = {}) {
  return {
    releaseSha: RELEASE_SHA,
    listRuns: async () => [],
    getRun: async () => run(),
    listJobs: async () => [],
    sleep: async () => {},
    discoveryAttempts: 1,
    pollAttempts: 3,
    ...overrides,
  };
}

test('selects only exact-SHA master push or manual Full Suite evidence', () => {
  const selected = selectFullSuiteRun(
    [
      run({ id: 1, head_sha: 'a'.repeat(40) }),
      run({ id: 2, head_branch: 'feature' }),
      run({ id: 3, event: 'workflow_call' }),
      run({ id: 4, event: 'workflow_dispatch' }),
    ],
    RELEASE_SHA,
  );

  assert.equal(selected?.id, 4);
});

test('prefers completed green evidence over an in-flight duplicate', () => {
  const selected = selectFullSuiteRun(
    [run({ id: 1 }), run({ id: 2, status: 'in_progress', conclusion: null })],
    RELEASE_SHA,
  );

  assert.equal(selected?.id, 1);
});

test('waits for an in-flight exact-SHA Full Suite and reuses it', async () => {
  const states = [run({ status: 'in_progress', conclusion: null }), run()];
  let polls = 0;
  const result = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => [states[0]],
      getRun: async () => states[++polls],
    }),
  );

  assert.equal(result.kind, 'verified');
  assert.equal(polls, 1);
});

test('allows a short discovery race before requesting fallback verification', async () => {
  let lookups = 0;
  const result = await resolveFullSuiteEvidence(
    harness({
      discoveryAttempts: 3,
      listRuns: async () => (++lookups === 3 ? [run()] : []),
    }),
  );

  assert.equal(result.kind, 'verified');
  assert.equal(lookups, 3);
});

test('falls back when no exact-SHA master run appears', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({ discoveryAttempts: 2 }),
  );

  assert.equal(result.kind, 'fallback');
  assert.match(result.reason, /No master Full Suite run appeared/);
});

test('falls back on API lookup failure instead of skipping verification', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => {
        throw new Error('HTTP 500');
      },
    }),
  );

  assert.equal(result.kind, 'fallback');
  assert.match(result.reason, /lookup failed.*HTTP 500/);
});

test('blocks release when the exact-SHA Full Suite fails', async () => {
  await assert.rejects(
    () =>
      resolveFullSuiteEvidence(
        harness({ listRuns: async () => [run({ conclusion: 'failure' })] }),
      ),
    /repair the failed surface and release a new SHA/,
  );
});

test('distinguishes a cancelled failed run from a cancellation collision', async () => {
  await assert.rejects(
    () =>
      resolveFullSuiteEvidence(
        harness({
          listRuns: async () => [run({ conclusion: 'cancelled' })],
          listJobs: async () => [{ name: 'Test API', conclusion: 'failure' }],
        }),
      ),
    /Test API concluded failure/,
  );

  const collision = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => [run({ conclusion: 'cancelled' })],
      listJobs: async () => [
        { name: 'Build & Boot Check', conclusion: 'cancelled' },
        { name: 'Tests Gate', conclusion: 'success' },
      ],
    }),
  );
  assert.equal(collision.kind, 'fallback');
  assert.match(collision.reason, /concluded cancelled/);
});

test('refuses to start a duplicate when an in-flight run never finishes', async () => {
  const active = run({ status: 'in_progress', conclusion: null });
  await assert.rejects(
    () =>
      resolveFullSuiteEvidence(
        harness({
          listRuns: async () => [active],
          getRun: async () => active,
          pollAttempts: 2,
        }),
      ),
    /refusing to start a duplicate run/,
  );
});
