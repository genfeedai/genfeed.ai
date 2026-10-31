import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifySuiteEvidence,
  evaluateBrowserSuites,
  isNeutralPath,
  REQUIRED_BROWSER_SUITES,
  runCli,
} from './browser-suite-evidence.mjs';

const SHA = '9aa1d2ef5a829b8688e3aebcb830609f40f00d12';
const PARENT = 'a'.repeat(40);
const GRANDPARENT = 'b'.repeat(40);
const UNRELATED = 'c'.repeat(40);
const SUITE = REQUIRED_BROWSER_SUITES[0];
const LEARNING = REQUIRED_BROWSER_SUITES[1];
const NOW = Date.parse('2026-10-20T12:00:00Z');

// PARENT is one commit before SHA and GRANDPARENT two; UNRELATED is on
// another line of history.
function history(changedFiles) {
  return {
    isAncestor: (sha) => sha === PARENT || sha === GRANDPARENT,
    commitsBetween: (sha) => (sha === PARENT ? 1 : 2),
    changedFiles: (sha) => changedFiles[sha] ?? [],
  };
}

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
    run({ head_sha: UNRELATED }),
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

test('carries a green earlier run when only neutral files changed', () => {
  const result = classifySuiteEvidence(
    SUITE,
    [run({ head_sha: PARENT })],
    SHA,
    {
      git: history({
        [PARENT]: ['apps/server/api/src/main.ts', 'docs/e2e-tiers.md'],
      }),
      now: NOW,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.carriedFrom, PARENT);
});

test('refuses to carry a green run past a file the suite covers', () => {
  const result = classifySuiteEvidence(
    SUITE,
    [run({ head_sha: PARENT })],
    SHA,
    {
      git: history({
        [PARENT]: ['apps/server/api/src/main.ts', 'apps/app/src/page.tsx'],
      }),
      now: NOW,
    },
  );
  assert.equal(result.ok, false);
  assert.match(
    result.reason,
    /1 file\(s\) it covers changed since: apps\/app\/src\/page\.tsx\./,
  );
  assert.match(result.reason, /Dispatch playwright-full-nightly\.yml/);
});

test('the nearest earlier verdict decides, so a red parent blocks an older green', () => {
  const result = classifySuiteEvidence(
    SUITE,
    [
      run({ id: 1, head_sha: GRANDPARENT }),
      run({ id: 2, head_sha: PARENT, conclusion: 'failure' }),
    ],
    SHA,
    { git: history({}), now: NOW },
  );
  assert.equal(result.ok, false);
  assert.match(
    result.reason,
    /concluded failure on a{40}.*nothing it covers changed since\. Fix it on master/,
  );
});

test('a red earlier run with covered changes since asks for a fresh run', () => {
  const result = classifySuiteEvidence(
    SUITE,
    [run({ head_sha: PARENT, conclusion: 'failure' })],
    SHA,
    {
      git: history({ [PARENT]: ['playwright/e2e/tests/editor.spec.ts'] }),
      now: NOW,
    },
  );
  assert.equal(result.ok, false);
  assert.match(
    result.reason,
    /concluded failure on a{40}.*1 file\(s\) it covers changed since: playwright\/e2e\/tests\/editor\.spec\.ts\. Dispatch playwright-full-nightly\.yml/,
  );
});

test('an exact-SHA red is never overridden by a green earlier run', () => {
  const result = classifySuiteEvidence(
    SUITE,
    [run({ id: 1, head_sha: PARENT }), run({ id: 2, conclusion: 'failure' })],
    SHA,
    { git: history({}), now: NOW },
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /concluded failure on 9aa1d2ef/);
});

test('does not carry a run that is not an ancestor or is too old', () => {
  const options = { git: history({}), now: NOW };
  assert.equal(
    classifySuiteEvidence(SUITE, [run({ head_sha: UNRELATED })], SHA, options)
      .ok,
    false,
  );
  assert.equal(
    classifySuiteEvidence(
      SUITE,
      [run({ head_sha: PARENT, created_at: '2026-10-18T11:00:00Z' })],
      SHA,
      options,
    ).ok,
    false,
  );
});

test('each suite has its own neutral paths', () => {
  assert.equal(isNeutralPath(SUITE, 'apps/server/api/src/main.ts'), true);
  assert.equal(isNeutralPath(LEARNING, 'apps/server/api/src/main.ts'), false);
  assert.equal(isNeutralPath(SUITE, 'apps/app/src/page.tsx'), false);
  assert.equal(isNeutralPath(LEARNING, 'apps/app/src/page.tsx'), true);
  assert.equal(isNeutralPath(SUITE, 'scripts/ci/runtime-acceptance.mjs'), true);
  assert.equal(
    isNeutralPath(LEARNING, 'scripts/ci/runtime-acceptance.mjs'),
    false,
  );
});

test('shared neutral paths: docs, agent notes and other workflows', () => {
  assert.equal(isNeutralPath(SUITE, 'README.md'), true);
  assert.equal(isNeutralPath(SUITE, 'docs/e2e-tiers.md'), true);
  assert.equal(isNeutralPath(SUITE, '.agents/memory/MEMORY.md'), true);
  assert.equal(isNeutralPath(SUITE, '.github/workflows/release.yml'), true);
  assert.equal(
    isNeutralPath(SUITE, '.github/workflows/playwright-full-nightly.yml'),
    false,
  );
  assert.equal(
    isNeutralPath(LEARNING, '.github/workflows/learning-runtime.yml'),
    false,
  );
  assert.equal(
    isNeutralPath(SUITE, '.github/actions/setup-playwright-app/action.yml'),
    false,
  );
  assert.equal(isNeutralPath(SUITE, 'packages/ui/README.md'), false);
  assert.equal(
    isNeutralPath(LEARNING, 'scripts/ci/runtime-acceptance.test.mjs'),
    true,
  );
  assert.equal(isNeutralPath(SUITE, 'bun.lock'), false);
  assert.equal(isNeutralPath(SUITE, 'skills/content/SKILL.md'), false);
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
  const spawnSync = (cmd, args) => {
    if (cmd === 'git') return { status: 1, stdout: '', stderr: '' };
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
  assert.deepEqual(calls, [
    `repos/genfeedai/genfeed.ai/actions/workflows/playwright-full-nightly.yml/runs?branch=master&per_page=50&head_sha=${SHA}`,
    'repos/genfeedai/genfeed.ai/actions/workflows/playwright-full-nightly.yml/runs?branch=master&per_page=50',
    `repos/genfeedai/genfeed.ai/actions/workflows/learning-runtime.yml/runs?branch=master&per_page=50&head_sha=${SHA}`,
    'repos/genfeedai/genfeed.ai/actions/workflows/learning-runtime.yml/runs?branch=master&per_page=50',
  ]);
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
