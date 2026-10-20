import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifySuiteEvidence,
  evaluateBrowserSuites,
  REQUIRED_BROWSER_SUITES,
  runCli,
} from './browser-suite-evidence.mjs';

const SHA = '9aa1d2ef5a829b8688e3aebcb830609f40f00d12';
const SUITE = REQUIRED_BROWSER_SUITES[0];

function run(overrides = {}) {
  return {
    id: 1,
    created_at: '2026-10-20T05:58:00Z',
    event: 'workflow_dispatch',
    head_branch: 'master',
    head_sha: SHA,
    html_url: 'https://github.com/genfeedai/genfeed.ai/actions/runs/1',
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  };
}

test('requires both browser suites that Full Suite does not run', () => {
  assert.deepEqual(
    REQUIRED_BROWSER_SUITES.map((suite) => suite.workflow),
    ['playwright-full-nightly.yml', 'learning-runtime.yml'],
  );
});

test('accepts a green exact-SHA dispatch or nightly run', () => {
  assert.equal(classifySuiteEvidence(SUITE, [run()], SHA).ok, true);
  assert.equal(
    classifySuiteEvidence(SUITE, [run({ event: 'schedule' })], SHA).ok,
    true,
  );
});

test('rejects a missing run and says which workflow to dispatch', () => {
  const result = classifySuiteEvidence(SUITE, [], SHA);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Dispatch playwright-full-nightly\.yml/);
});

test('ignores runs for other SHAs, branches, or events', () => {
  const runs = [
    run({ head_sha: 'a'.repeat(40) }),
    run({ head_branch: 'feature' }),
    run({ event: 'pull_request' }),
  ];
  assert.equal(classifySuiteEvidence(SUITE, runs, SHA).ok, false);
});

test('a red run blocks, and a newer green re-run clears it', () => {
  const red = run({ id: 1, conclusion: 'failure' });
  assert.equal(classifySuiteEvidence(SUITE, [red], SHA).ok, false);
  const green = run({
    id: 2,
    created_at: '2026-10-20T07:00:00Z',
    conclusion: 'success',
  });
  assert.equal(classifySuiteEvidence(SUITE, [red, green], SHA).ok, true);
});

test('a newer red run beats an older green one', () => {
  const green = run({ id: 1 });
  const red = run({
    id: 2,
    created_at: '2026-10-20T07:00:00Z',
    conclusion: 'failure',
  });
  const result = classifySuiteEvidence(SUITE, [green, red], SHA);
  assert.equal(result.ok, false);
  assert.match(result.reason, /concluded failure/);
});

test('a cancelled run is not a verdict', () => {
  const result = classifySuiteEvidence(
    SUITE,
    [run({ conclusion: 'cancelled' })],
    SHA,
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /no completed run/);
});

test('an in-flight run blocks without starting a duplicate', () => {
  const result = classifySuiteEvidence(
    SUITE,
    [run({ status: 'in_progress', conclusion: null })],
    SHA,
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /still in_progress/);
});

test('rejects a malformed release SHA', () => {
  assert.throws(() => classifySuiteEvidence(SUITE, [], 'main'), /40-character/);
});

test('evaluates every required suite', () => {
  const results = evaluateBrowserSuites(
    {
      'playwright-full-nightly.yml': [run()],
      'learning-runtime.yml': [],
    },
    SHA,
  );
  assert.deepEqual(
    results.map((result) => result.ok),
    [true, false],
  );
});

test('CLI exits non-zero unless every suite is green', () => {
  const calls = [];
  const spawnSync = (_cmd, args) => {
    calls.push(args[1]);
    const green = args[1].includes('playwright-full-nightly.yml');
    return {
      status: 0,
      stdout: JSON.stringify({ workflow_runs: green ? [run()] : [] }),
    };
  };
  const errors = [];
  const previous = process.exitCode;
  const results = runCli({
    env: {
      GH_TOKEN: 'token',
      GITHUB_REPOSITORY: 'genfeedai/genfeed.ai',
      RELEASE_SHA: SHA,
    },
    spawnSync,
    appendFileSync: () => {},
    log: () => {},
    error: (line) => errors.push(line),
  });
  assert.equal(process.exitCode, 1);
  process.exitCode = previous;
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.includes(`head_sha=${SHA}`)));
  assert.ok(errors.some((line) => line.includes('learning-runtime.yml')));
});

test('release.yml checks the evidence after Full Suite evidence and outside recovery', async () => {
  const { readFileSync } = await import('node:fs');
  const release = readFileSync(
    new URL('../../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );
  const step = release.slice(
    release.indexOf('- name: Require browser suite evidence'),
  );
  assert.ok(
    release.indexOf('- name: Check for existing Full Suite evidence') <
      release.indexOf('- name: Require browser suite evidence'),
  );
  assert.match(step, /if: \$\{\{ inputs\.recovery_run_id == '' \}\}/);
  assert.match(
    step,
    /RELEASE_SHA: \$\{\{ steps\.source\.outputs\.release_sha \}\}/,
  );
  assert.match(step, /run: node scripts\/ci\/browser-suite-evidence\.mjs/);
  // Evidence only: the long suites never join the release `needs` graph.
  assert.doesNotMatch(
    release,
    /uses: \.\/\.github\/workflows\/playwright-full-nightly\.yml/,
  );
  assert.doesNotMatch(
    release,
    /uses: \.\/\.github\/workflows\/learning-runtime\.yml/,
  );
});
