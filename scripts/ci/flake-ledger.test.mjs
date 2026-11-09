import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildFlakeLedger,
  collectFlakeOccurrences,
  FLAKE_LEDGER_LABEL,
  FLAKE_LEDGER_MARKER,
  FLAKE_LEDGER_WORKFLOWS,
  listRunWindows,
  normalizeTestName,
  renderFlakeLedger,
  runFlakeLedger,
  syncFlakeTracker,
} from './flake-ledger.mjs';

const NOW = Date.parse('2026-11-09T06:00:00Z');
const OWNER = 'genfeedai';
const REPO = 'genfeed.ai';

const PLAYWRIGHT_TEST =
  '[app-core] › playwright/e2e/tests/studio/clipper.spec.ts:860:7 › Clip Factory › should keep polling in progress view until clips are actually completed';
const VITEST_TEST =
  '[@genfeedai/api-unit] src/collections/outliers/services/breakout-acceptance-media.postgres.spec.ts > breakout acceptance: media formats (PostgreSQL) > counts a media output';

function rerunRun(id, overrides = {}) {
  return {
    created_at: '2026-11-08T10:00:00Z',
    event: 'pull_request',
    head_branch: 'feat/example',
    head_sha: `${String(id).padStart(40, 'a')}`,
    html_url: `https://github.com/genfeedai/genfeed.ai/actions/runs/${id}`,
    id,
    pull_requests: [{ number: 9001 }],
    run_attempt: 2,
    updated_at: '2026-11-08T11:00:00Z',
    ...overrides,
  };
}

function failedJob(id, name, stepName, overrides = {}) {
  return {
    completed_at: '2026-11-08T10:30:00Z',
    conclusion: 'failure',
    html_url: `https://github.com/genfeedai/genfeed.ai/actions/runs/1/job/${id}`,
    id,
    name,
    steps: [
      { conclusion: 'success', name: 'Set up job' },
      { conclusion: 'failure', name: stepName },
    ],
    ...overrides,
  };
}

function testAnnotation(title) {
  return {
    annotation_level: 'failure',
    message: 'TimeoutError: locator.click: Timeout 15000ms exceeded.',
    path: 'playwright/e2e/tests/studio/clipper.spec.ts',
    title,
  };
}

const STEP_FAILURE = {
  annotation_level: 'failure',
  message: 'Process completed with exit code 1.',
  path: '.github',
  title: '',
};

/**
 * Fake Octokit that serves fixtures and records every call. Only read
 * endpoints exist on `actions` and `checks`, so a rerun, cancel or delete
 * would throw.
 */
function fakeGithub({
  runs = {},
  attemptJobs = {},
  latestJobs = {},
  annotations = {},
  issues = [],
} = {}) {
  const calls = [];
  const record = (name, handler) => async (params) => {
    calls.push({ name, params });
    return handler(params);
  };
  const github = {
    calls,
    async paginate(method, params) {
      const response = await method(params);
      const data = response.data;
      return Array.isArray(data) ? data : (data.workflow_runs ?? data.jobs);
    },
    rest: {
      actions: {
        listJobsForWorkflowRun: record('listJobsForWorkflowRun', (params) => ({
          data: { jobs: latestJobs[params.run_id] ?? [] },
        })),
        listJobsForWorkflowRunAttempt: record(
          'listJobsForWorkflowRunAttempt',
          (params) => ({
            data: {
              jobs:
                attemptJobs[`${params.run_id}:${params.attempt_number}`] ?? [],
            },
          }),
        ),
        listWorkflowRuns: record('listWorkflowRuns', (params) => ({
          data: {
            workflow_runs: params.created.startsWith('2026-11-08')
              ? (runs[params.workflow_id] ?? [])
              : [],
          },
        })),
      },
      checks: {
        listAnnotations: record('listAnnotations', (params) => ({
          data: annotations[params.check_run_id] ?? [],
        })),
      },
      issues: {
        addLabels: record('addLabels', (params) => ({
          data: params.labels.map((name) => ({ name })),
        })),
        create: record('create', () => ({ data: { number: 9999 } })),
        getLabel: record('getLabel', () => ({ data: {} })),
        listForRepo: record('listForRepo', () => ({ data: issues })),
        update: record('update', () => ({ data: {} })),
      },
    },
  };
  return github;
}

async function collect(github) {
  return collectFlakeOccurrences({
    github,
    owner: OWNER,
    repo: REPO,
    now: NOW,
    core: { info() {} },
  });
}

test('a run that failed on attempt 1 and passed on attempt 2 names the job and the failing test', async () => {
  const github = fakeGithub({
    runs: { 'playwright-full-nightly.yml': [rerunRun(41958991026)] },
    attemptJobs: {
      '41958991026:1': [
        failedJob(
          127020708114,
          'Playwright Full (Shard 7/8)',
          'Run full E2E shard 7/8',
        ),
      ],
    },
    latestJobs: {
      41958991026: [
        { conclusion: 'success', name: 'Playwright Full (Shard 7/8)' },
      ],
    },
    annotations: {
      127020708114: [STEP_FAILURE, testAnnotation(PLAYWRIGHT_TEST)],
    },
  });

  const collected = await collect(github);
  const [entry] = buildFlakeLedger(collected.occurrences);

  assert.equal(entry.workflowName, 'Nightly Playwright Full Tier');
  assert.deepEqual(entry.jobs, ['Playwright Full (Shard 7/8)']);
  assert.deepEqual(entry.steps, ['Run full E2E shard 7/8']);
  assert.equal(
    entry.test,
    '[app-core] › playwright/e2e/tests/studio/clipper.spec.ts › Clip Factory › should keep polling in progress view until clips are actually completed',
  );
  const markdown = renderFlakeLedger(collected, {
    generatedAt: '2026-11-09T06:00:00Z',
  });
  assert.match(markdown, /Playwright Full \(Shard 7\/8\)/u);
  assert.match(markdown, /Run full E2E shard 7\/8/u);
  assert.match(markdown, /Clip Factory › should keep polling/u);
});

test('a failing step with no test annotation is listed by job and step with its message', async () => {
  const github = fakeGithub({
    runs: { 'ci.yml': [rerunRun(1)] },
    attemptJobs: {
      '1:1': [failedJob(11, 'Build app', 'Install dependencies')],
    },
    latestJobs: { 1: [{ conclusion: 'success', name: 'Build app' }] },
    annotations: {
      11: [
        STEP_FAILURE,
        {
          annotation_level: 'failure',
          message: 'ECONNRESET while fetching a registry tarball',
          path: '.github',
          title: '',
        },
      ],
    },
  });

  const [entry] = buildFlakeLedger((await collect(github)).occurrences);

  assert.equal(entry.test, null);
  assert.deepEqual(entry.jobs, ['Build app']);
  assert.deepEqual(entry.steps, ['Install dependencies']);
  assert.equal(entry.detail, 'ECONNRESET while fetching a registry tarball');
});

test('a test seen in 3 distinct runs is listed before a more recent one-off', async () => {
  const flaky = (id, day) =>
    rerunRun(id, { created_at: `2026-11-0${day}T10:00:00Z` });
  const runs = [flaky(1, 8), flaky(2, 8), flaky(3, 8), flaky(4, 8)];
  const attemptJobs = {};
  const latestJobs = {};
  const annotations = {};
  for (const [index, run] of runs.entries()) {
    const jobId = 100 + index;
    const title = index < 3 ? VITEST_TEST : PLAYWRIGHT_TEST;
    attemptJobs[`${run.id}:1`] = [
      failedJob(jobId, 'Test API (shard 3/4)', 'Run API tests', {
        completed_at: `2026-11-08T1${index}:00:00Z`,
      }),
    ];
    latestJobs[run.id] = [
      { conclusion: 'success', name: 'Test API (shard 3/4)' },
    ];
    annotations[jobId] = [STEP_FAILURE, testAnnotation(title)];
  }
  const github = fakeGithub({
    runs: { 'ci.yml': runs },
    attemptJobs,
    latestJobs,
    annotations,
  });

  const entries = buildFlakeLedger((await collect(github)).occurrences);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].count, 3);
  assert.equal(entries[0].isRecurring, true);
  assert.match(
    entries[0].test,
    /breakout-acceptance-media\.postgres\.spec\.ts/u,
  );
  assert.equal(entries[1].count, 1);
  assert.equal(entries[1].isRecurring, false);
  const markdown = renderFlakeLedger(await collect(github));
  assert.ok(
    markdown.indexOf('## Seen 3 or more times') <
      markdown.indexOf('## Seen fewer than 3 times'),
  );
});

test('a gate job that only restates another failed job is dropped, but kept when it is the only failure', async () => {
  const gate = failedJob(
    12,
    'Core Validation / Validation Verdict',
    'Aggregate test and build results',
  );
  const github = fakeGithub({
    runs: { 'ci.yml': [rerunRun(1), rerunRun(2)] },
    attemptJobs: {
      '1:1': [failedJob(11, 'Test API (shard 3/4)', 'Run API tests'), gate],
      '2:1': [gate],
    },
    latestJobs: {
      1: [
        { conclusion: 'success', name: 'Test API (shard 3/4)' },
        { conclusion: 'success', name: gate.name },
      ],
      2: [{ conclusion: 'success', name: gate.name }],
    },
  });

  const occurrences = (await collect(github)).occurrences;

  assert.deepEqual(
    occurrences.map((entry) => [entry.runId, entry.jobName]),
    [
      [1, 'Test API (shard 3/4)'],
      [2, 'Core Validation / Validation Verdict'],
    ],
  );
});

test('a job that was not green in the final attempt is not reported as a flake', async () => {
  const github = fakeGithub({
    runs: { 'ci.yml': [rerunRun(1)] },
    attemptJobs: {
      '1:1': [failedJob(11, 'Test API (shard 3/4)', 'Run API tests')],
    },
    latestJobs: {
      1: [{ conclusion: 'skipped', name: 'Test API (shard 3/4)' }],
    },
  });

  const collected = await collect(github);

  assert.deepEqual(collected.occurrences, []);
  assert.equal(collected.unconfirmedJobs, 1);
});

test('runs older than the window and single-attempt runs are not scanned for failures', async () => {
  const github = fakeGithub({
    runs: {
      'ci.yml': [
        rerunRun(1, { created_at: '2026-10-01T10:00:00Z' }),
        rerunRun(2, { run_attempt: 1 }),
      ],
    },
  });

  const collected = await collect(github);

  assert.equal(collected.rerunGreenRuns, 0);
  assert.equal(
    github.calls.filter((call) => call.name === 'listJobsForWorkflowRunAttempt')
      .length,
    0,
  );
});

test('the scan covers all four workflows over one range per day, only for green runs', async () => {
  const github = fakeGithub();

  await collect(github);

  const listings = github.calls.filter(
    (call) => call.name === 'listWorkflowRuns',
  );
  assert.deepEqual(
    [...new Set(listings.map((call) => call.params.workflow_id))].sort(),
    ['ci.yml', 'e2e.yml', 'full-suite.yml', 'playwright-full-nightly.yml'],
  );
  assert.equal(listings.length, 4 * 15);
  assert.ok(listings.every((call) => call.params.status === 'success'));
  assert.deepEqual(listRunWindows(NOW, 1), [
    '2026-11-09T00:00:00Z..2026-11-09T23:59:59Z',
    '2026-11-08T00:00:00Z..2026-11-08T23:59:59Z',
  ]);
});

test('the scan only reads: it uses list endpoints and never reruns, cancels or retries', async () => {
  const github = fakeGithub({
    runs: { 'ci.yml': [rerunRun(1)] },
    attemptJobs: {
      '1:1': [failedJob(11, 'Test API (shard 3/4)', 'Run API tests')],
    },
    latestJobs: {
      1: [{ conclusion: 'success', name: 'Test API (shard 3/4)' }],
    },
    annotations: { 11: [STEP_FAILURE, testAnnotation(VITEST_TEST)] },
  });

  await runFlakeLedger({
    github,
    owner: OWNER,
    repo: REPO,
    now: NOW,
    core: { info() {} },
  });

  const names = new Set(github.calls.map((call) => call.name));
  for (const name of names) {
    assert.match(
      name,
      /^(?:list\w+|getLabel|addLabels|create|update)$/u,
      `unexpected API call ${name}`,
    );
  }
  assert.deepEqual(
    github.calls
      .filter((call) => call.name === 'create' || call.name === 'update')
      .map((call) => Object.keys(call.params).sort()),
    [['body', 'labels', 'owner', 'repo', 'title']],
  );
  const source = readFileSync(
    fileURLToPath(new URL('./flake-ledger.mjs', import.meta.url)),
    'utf8',
  );
  assert.doesNotMatch(source, /reRun|cancelWorkflowRun|deleteWorkflowRun/u);
});

test('the tracking issue is created once when entries exist, then updated in place', async () => {
  const body = `<!-- ${FLAKE_LEDGER_MARKER} -->\nledger`;

  const first = fakeGithub();
  const createdNumber = await syncFlakeTracker({
    github: first,
    owner: OWNER,
    repo: REPO,
    body,
    hasEntries: true,
    core: { info() {} },
  });
  assert.equal(createdNumber, 9999);
  assert.ok(first.calls.some((call) => call.name === 'create'));

  const second = fakeGithub({
    issues: [
      { body, number: 321 },
      { body: 'unrelated', number: 322 },
    ],
  });
  const updatedNumber = await syncFlakeTracker({
    github: second,
    owner: OWNER,
    repo: REPO,
    body: `${body}\nnewer`,
    hasEntries: false,
    core: { info() {} },
  });
  assert.equal(updatedNumber, 321);
  assert.equal(
    second.calls.some((call) => call.name === 'create'),
    false,
  );
  const update = second.calls.find((call) => call.name === 'update');
  assert.equal(update.params.issue_number, 321);
  assert.match(update.params.body, /newer/u);
  assert.equal(
    second.calls.find((call) => call.name === 'listForRepo').params.labels,
    FLAKE_LEDGER_LABEL,
  );
});

test('with no flakes and no existing tracker nothing is created', async () => {
  const github = fakeGithub();

  const result = await runFlakeLedger({
    github,
    owner: OWNER,
    repo: REPO,
    now: NOW,
    core: { info() {} },
  });

  assert.equal(result.issueNumber, null);
  assert.equal(
    github.calls.some((call) => call.name === 'create'),
    false,
  );
  assert.match(result.markdown, /No job failed and then passed/u);
});

test('test names drop line and column so an edit above a test does not split its history', () => {
  assert.equal(
    normalizeTestName('[app-core] › playwright/a.spec.ts:12:3 › Suite › case'),
    '[app-core] › playwright/a.spec.ts › Suite › case',
  );
});

test('the nightly workflow reads Actions and Checks and writes only issues', () => {
  const workflow = readFileSync(
    fileURLToPath(
      new URL('../../.github/workflows/flake-ledger.yml', import.meta.url),
    ),
    'utf8',
  );
  assert.match(workflow, /^ {2}schedule:\n {4}- cron:/mu);
  assert.match(workflow, /actions: read/u);
  assert.match(workflow, /checks: read/u);
  assert.match(workflow, /issues: write/u);
  assert.doesNotMatch(
    workflow,
    /(?:actions|contents|pull-requests|checks): write/u,
  );
  for (const { file } of FLAKE_LEDGER_WORKFLOWS) {
    assert.ok(
      readFileSync(
        fileURLToPath(
          new URL(`../../.github/workflows/${file}`, import.meta.url),
        ),
        'utf8',
      ),
      `${file} must exist`,
    );
  }
});

test('gate-only failures sit in their own section after every test entry', async () => {
  const gate = failedJob(12, 'Tests Gate', 'Qualify verdict');
  const days = ['2026-11-08', '2026-11-08', '2026-11-08'];
  const runs = days.map((day, index) =>
    rerunRun(index + 1, { created_at: `${day}T10:00:00Z` }),
  );
  const attemptJobs = {};
  const latestJobs = {};
  for (const run of runs) {
    attemptJobs[`${run.id}:1`] = [gate];
    latestJobs[run.id] = [{ conclusion: 'success', name: gate.name }];
  }
  attemptJobs['3:1'] = [failedJob(13, 'Test API (shard 3/4)', 'Run API tests')];
  latestJobs[3] = [{ conclusion: 'success', name: 'Test API (shard 3/4)' }];
  const github = fakeGithub({
    runs: { 'ci.yml': runs },
    attemptJobs,
    latestJobs,
  });

  const markdown = renderFlakeLedger(await collect(github));

  assert.ok(
    markdown.indexOf('Test API (shard 3/4)') <
      markdown.indexOf('## Failed only at an aggregate gate'),
  );
  assert.match(
    markdown,
    /## Failed only at an aggregate gate[\s\S]*Tests Gate \| Qualify verdict \| 2 \|/u,
  );
});
