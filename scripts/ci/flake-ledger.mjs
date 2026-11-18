import { redactPublicEvidence } from './scheduled-failure-tracker.mjs';

/**
 * Flake ledger: finds CI runs that failed on an earlier attempt and then went
 * green on the same commit, and names the job, failing step and test.
 *
 * The scan is read-only against the Actions and Checks APIs. It never reruns,
 * retries, cancels, skips or quarantines anything. The only write is the one
 * rolling tracking issue that holds the ledger.
 */

export const FLAKE_LEDGER_WORKFLOWS = [
  { file: 'ci.yml', name: 'CI' },
  { file: 'e2e.yml', name: 'E2E Tests' },
  { file: 'playwright-full-nightly.yml', name: 'Nightly Playwright Full Tier' },
  { file: 'full-suite.yml', name: 'Full Suite' },
];
export const FLAKE_LEDGER_WINDOW_DAYS = 14;
export const FLAKE_LEDGER_RECURRING_THRESHOLD = 3;
export const FLAKE_LEDGER_LABEL = 'flake-ledger';
export const FLAKE_LEDGER_MARKER = 'genfeed-flake-ledger:v1';
export const FLAKE_LEDGER_TITLE =
  'Flake ledger: CI jobs that failed and then passed on the same commit';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
// GitHub caps a filtered run listing (`created`, `status`) at 1,000 results.
const RUN_LISTING_CAP = 1_000;
const MAX_TESTS_PER_JOB = 50;
const MAX_TEST_NAME_LENGTH = 300;
const MAX_DETAIL_LENGTH = 200;
const MAX_ROWS_PER_SECTION = 100;
const ISSUE_BODY_LIMIT = 60_000;
const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out']);
// Aggregate jobs only restate a failure that happened in another job.
const GATE_JOB_PATTERN = /\b(?:gate|verdict|tracker)\b/iu;
const GENERIC_STEP_FAILURE_PATTERN =
  /^Process completed with exit code \d+\.?$/u;
const TEST_FILE_LINE_SUFFIX_PATTERN =
  /(\.(?:spec|test)\.[cm]?[jt]sx?):\d+(?::\d+)?/giu;

function isoDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * One closed UTC-day range per day, newest first. A single filtered listing
 * stops at 1,000 results, which one busy workflow exceeds in two weeks.
 */
export function listRunWindows(now, days) {
  const windows = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const day = isoDay(now - offset * DAY_MS);
    windows.push(`${day}T00:00:00Z..${day}T23:59:59Z`);
  }
  return windows;
}

export function normalizeTestName(title) {
  return String(title ?? '')
    .replace(TEST_FILE_LINE_SUFFIX_PATTERN, '$1')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_TEST_NAME_LENGTH);
}

/**
 * Reads what failed in one job from its steps and failure annotations. Test
 * reporters attach one annotation per failing test, titled with the test; the
 * runner's own step failure has no title.
 */
export function describeJobFailure(job, annotations) {
  const failed = (annotations ?? []).filter(
    (annotation) => annotation.annotation_level === 'failure',
  );
  const tests = [
    ...new Set(
      failed
        .map((annotation) => normalizeTestName(annotation.title))
        .filter(Boolean),
    ),
  ];
  const detail = failed
    .filter((annotation) => !String(annotation.title ?? '').trim())
    .map((annotation) => String(annotation.message ?? '').trim())
    .find((message) => message && !GENERIC_STEP_FAILURE_PATTERN.test(message));
  const step = (job.steps ?? []).find((entry) =>
    FAILED_CONCLUSIONS.has(entry.conclusion),
  );
  return {
    detail: detail
      ? redactPublicEvidence(detail, MAX_DETAIL_LENGTH).replace(/\n/gu, ' ')
      : null,
    step: step?.name ?? null,
    tests: tests.slice(0, MAX_TESTS_PER_JOB),
  };
}

const READ_ATTEMPTS = 3;
const READ_RETRY_DELAYS_MS = [2_000, 5_000];

// Anything but a server error (a missing permission, a bad request) is a
// setup fault the nightly job must fail on rather than report around.
function rethrowUnlessServerError(error) {
  if (!(Number(error?.status) >= 500)) {
    throw error;
  }
}

/**
 * Re-reads one Actions API call that answered with a server error. Only reads
 * are repeated; nothing about a workflow run is ever re-triggered.
 */
async function readWithRetry(read, wait) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      const isServerError = Number(error?.status) >= 500;
      if (!isServerError || attempt >= READ_ATTEMPTS) {
        throw error;
      }
      await wait(READ_RETRY_DELAYS_MS[attempt - 1]);
    }
  }
}

async function listRerunSuccessRuns(
  github,
  { owner, repo, workflowFile, now, days },
) {
  const cutoff = now - days * DAY_MS;
  const runs = new Map();
  const truncatedWindows = [];
  for (const created of listRunWindows(now, days)) {
    const listed = await github.paginate(github.rest.actions.listWorkflowRuns, {
      owner,
      repo,
      workflow_id: workflowFile,
      status: 'success',
      created,
      per_page: PAGE_SIZE,
    });
    if (listed.length >= RUN_LISTING_CAP) {
      truncatedWindows.push(`${workflowFile} ${created}`);
    }
    for (const run of listed) {
      if (run.run_attempt > 1 && Date.parse(run.created_at) >= cutoff) {
        runs.set(run.id, run);
      }
    }
  }
  return { runs: [...runs.values()], scanned: runs.size, truncatedWindows };
}

async function listFailedJobs(github, { owner, repo, runId, attempt }) {
  const jobs = await github.paginate(
    github.rest.actions.listJobsForWorkflowRunAttempt,
    {
      owner,
      repo,
      run_id: runId,
      attempt_number: attempt,
      per_page: PAGE_SIZE,
    },
  );
  const failed = jobs.filter((job) => FAILED_CONCLUSIONS.has(job.conclusion));
  const roots = failed.filter((job) => !GATE_JOB_PATTERN.test(job.name));
  return roots.length > 0 ? roots : failed;
}

async function listGreenJobNames(github, { owner, repo, runId }) {
  const latest = await github.paginate(
    github.rest.actions.listJobsForWorkflowRun,
    { owner, repo, run_id: runId, filter: 'latest', per_page: PAGE_SIZE },
  );
  return new Set(
    latest.filter((job) => job.conclusion === 'success').map((job) => job.name),
  );
}

async function collectRunOccurrences(github, { owner, repo, workflow, run }) {
  const greenJobNames = await listGreenJobNames(github, {
    owner,
    repo,
    runId: run.id,
  });
  const occurrences = [];
  let unconfirmedJobs = 0;
  for (let attempt = 1; attempt < run.run_attempt; attempt += 1) {
    const failedJobs = await listFailedJobs(github, {
      owner,
      repo,
      runId: run.id,
      attempt,
    });
    for (const job of failedJobs) {
      if (!greenJobNames.has(job.name)) {
        unconfirmedJobs += 1;
        continue;
      }
      const annotations = await github.paginate(
        github.rest.checks.listAnnotations,
        { owner, repo, check_run_id: job.id, per_page: PAGE_SIZE },
      );
      const failure = describeJobFailure(job, annotations);
      const base = {
        attempt,
        branch: run.head_branch ?? null,
        detail: failure.detail,
        event: run.event ?? null,
        finalAttempt: run.run_attempt,
        jobName: job.name,
        jobUrl: job.html_url ?? run.html_url,
        occurredAt: job.completed_at ?? job.started_at ?? run.updated_at,
        pullRequest: run.pull_requests?.[0]?.number ?? null,
        runId: run.id,
        runUrl: run.html_url,
        sha: run.head_sha,
        step: failure.step,
        workflowFile: workflow.file,
        workflowName: workflow.name,
      };
      if (failure.tests.length === 0) {
        occurrences.push({ ...base, test: null });
      }
      for (const test of failure.tests) {
        occurrences.push({ ...base, test });
      }
    }
  }
  return { occurrences, unconfirmedJobs };
}

/**
 * Finds every run in the window that ended green after more than one attempt
 * and lists what failed in the earlier attempts.
 */
export async function collectFlakeOccurrences({
  github,
  owner,
  repo,
  now = Date.now(),
  days = FLAKE_LEDGER_WINDOW_DAYS,
  workflows = FLAKE_LEDGER_WORKFLOWS,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  core = console,
}) {
  const occurrences = [];
  const truncatedWindows = [];
  const unreadable = [];
  let scannedRuns = 0;
  let unconfirmedJobs = 0;
  for (const workflow of workflows) {
    let listing;
    try {
      listing = await readWithRetry(
        () =>
          listRerunSuccessRuns(github, {
            owner,
            repo,
            workflowFile: workflow.file,
            now,
            days,
          }),
        wait,
      );
    } catch (error) {
      rethrowUnlessServerError(error);
      core.warning?.(`${workflow.file}: run listing failed: ${error.message}`);
      unreadable.push(workflow.file);
      continue;
    }
    scannedRuns += listing.scanned;
    truncatedWindows.push(...listing.truncatedWindows);
    core.info?.(
      `${workflow.file}: ${listing.runs.length} green runs with more than one attempt`,
    );
    for (const run of listing.runs) {
      try {
        const found = await readWithRetry(
          () => collectRunOccurrences(github, { owner, repo, workflow, run }),
          wait,
        );
        occurrences.push(...found.occurrences);
        unconfirmedJobs += found.unconfirmedJobs;
      } catch (error) {
        rethrowUnlessServerError(error);
        core.warning?.(`${run.html_url}: could not be read: ${error.message}`);
        unreadable.push(run.html_url);
      }
    }
  }
  return {
    days,
    flakyRuns: new Set(occurrences.map((entry) => entry.runId)).size,
    occurrences,
    rerunGreenRuns: scannedRuns,
    truncatedWindows,
    unconfirmedJobs,
    unreadable,
  };
}

function entryKey(occurrence) {
  return occurrence.test
    ? [occurrence.workflowFile, 'test', occurrence.test].join('\u0000')
    : [
        occurrence.workflowFile,
        'job',
        occurrence.jobName,
        occurrence.step ?? '',
      ].join('\u0000');
}

/**
 * Groups occurrences per test (or per job and step when no test is named).
 * `count` is the number of distinct runs it failed in and then passed on the
 * same commit. Entries seen at least the recurring threshold come first.
 */
export function buildFlakeLedger(occurrences) {
  const groups = new Map();
  for (const occurrence of occurrences) {
    const key = entryKey(occurrence);
    const entry = groups.get(key) ?? {
      detail: null,
      failedAttempts: 0,
      firstSeen: occurrence.occurredAt,
      jobs: new Set(),
      key,
      lastRun: occurrence,
      lastSeen: occurrence.occurredAt,
      runIds: new Set(),
      steps: new Set(),
      test: occurrence.test,
      workflowFile: occurrence.workflowFile,
      workflowName: occurrence.workflowName,
    };
    entry.failedAttempts += 1;
    entry.jobs.add(occurrence.jobName);
    entry.runIds.add(occurrence.runId);
    if (occurrence.step) entry.steps.add(occurrence.step);
    entry.detail = entry.detail ?? occurrence.detail;
    if (occurrence.occurredAt < entry.firstSeen) {
      entry.firstSeen = occurrence.occurredAt;
    }
    if (occurrence.occurredAt >= entry.lastSeen) {
      entry.lastSeen = occurrence.occurredAt;
      entry.lastRun = occurrence;
    }
    groups.set(key, entry);
  }
  return [...groups.values()]
    .map((entry) => ({
      ...entry,
      count: entry.runIds.size,
      isGateOnly:
        !entry.test &&
        [...entry.jobs].every((job) => GATE_JOB_PATTERN.test(job)),
      isRecurring: entry.runIds.size >= FLAKE_LEDGER_RECURRING_THRESHOLD,
      jobs: [...entry.jobs].sort(),
      steps: [...entry.steps].sort(),
    }))
    .sort(
      (left, right) =>
        Number(left.isGateOnly) - Number(right.isGateOnly) ||
        Number(right.isRecurring) - Number(left.isRecurring) ||
        right.count - left.count ||
        String(right.lastSeen).localeCompare(String(left.lastSeen)) ||
        left.key.localeCompare(right.key),
    );
}

function cell(value, limit = 160) {
  const text = String(value ?? '')
    .replace(/\s+/gu, ' ')
    .replace(/\|/gu, '\\|')
    .replace(/</gu, '&lt;')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text || '–';
}

function describeLastRun(entry) {
  const run = entry.lastRun;
  const where = run.pullRequest ? `PR #${run.pullRequest}` : run.event;
  return `[${cell(where ?? 'run', 40)} · attempt ${run.attempt} of ${run.finalAttempt}](${run.runUrl})`;
}

function renderTable(entries) {
  const rows = entries.slice(0, MAX_ROWS_PER_SECTION).map((entry) => {
    const what = entry.test
      ? cell(entry.test, 240)
      : `(no test named) ${cell(entry.detail ?? '', 120)}`;
    return `| ${what} | ${cell(entry.workflowName)} | ${cell(entry.jobs.join(', '))} | ${cell(entry.steps.join(', '))} | ${entry.count} | ${cell(String(entry.lastSeen).slice(0, 10), 10)} | ${describeLastRun(entry)} |`;
  });
  const omitted = entries.length - rows.length;
  return [
    '| Test, or job when no test is named | Workflow | Job | Failing step | Runs | Last seen | Latest failed attempt |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
    ...rows,
    ...(omitted > 0 ? [``, `…and ${omitted} more not shown.`] : []),
  ].join('\n');
}

export function renderFlakeLedger(
  collected,
  { generatedAt = new Date().toISOString(), runUrl = null } = {},
) {
  const entries = buildFlakeLedger(collected.occurrences);
  const gateOnly = entries.filter((entry) => entry.isGateOnly);
  const recurring = entries.filter(
    (entry) => !entry.isGateOnly && entry.isRecurring,
  );
  const occasional = entries.filter(
    (entry) => !entry.isGateOnly && !entry.isRecurring,
  );
  const lines = [
    `<!-- ${FLAKE_LEDGER_MARKER} -->`,
    `# ${FLAKE_LEDGER_TITLE}`,
    '',
    `Last ${collected.days} days, updated ${generatedAt}${runUrl ? ` by [this run](${runUrl})` : ''}.`,
    `${collected.rerunGreenRuns} runs of ${FLAKE_LEDGER_WORKFLOWS.map((workflow) => workflow.file).join(', ')} went green after more than one attempt; ${collected.flakyRuns} of them had a failed job in an earlier attempt, giving ${entries.length} distinct ${entries.length === 1 ? 'entry' : 'entries'} below.`,
    '',
    'Each row failed on an earlier attempt and passed on a rerun of the same commit. A test is fixed or deleted, never retried or quarantined.',
    '',
  ];
  if (entries.length === 0) {
    lines.push(
      'No job failed and then passed on the same commit in this window.',
    );
  }
  if (recurring.length > 0) {
    lines.push(
      `## Seen ${FLAKE_LEDGER_RECURRING_THRESHOLD} or more times`,
      '',
      renderTable(recurring),
      '',
    );
  }
  if (occasional.length > 0) {
    lines.push(
      `## Seen fewer than ${FLAKE_LEDGER_RECURRING_THRESHOLD} times`,
      '',
      renderTable(occasional),
      '',
    );
  }
  if (gateOnly.length > 0) {
    lines.push(
      '## Failed only at an aggregate gate',
      '',
      'The gate failed but no job behind it is listed for that attempt, for example because its jobs were abandoned. Open the run to see why.',
      '',
      renderTable(gateOnly),
      '',
    );
  }
  if (collected.unconfirmedJobs > 0) {
    lines.push(
      `${collected.unconfirmedJobs} failed jobs were left out because they were not green in the final attempt.`,
      '',
    );
  }
  if (collected.unreadable.length > 0) {
    lines.push(
      `Incomplete: GitHub kept answering with a server error for ${collected.unreadable.join(', ')}, so those runs are not in the ledger. The next nightly run reads them again.`,
      '',
    );
  }
  if (collected.truncatedWindows.length > 0) {
    lines.push(
      `Incomplete: GitHub returns at most 1,000 runs per listing, reached for ${collected.truncatedWindows.join(', ')}.`,
      '',
    );
  }
  return lines.join('\n').trimEnd();
}

async function ensureLabel(github, { owner, repo }) {
  try {
    await github.rest.issues.getLabel({
      owner,
      repo,
      name: FLAKE_LEDGER_LABEL,
    });
  } catch (error) {
    if (error?.status !== 404) throw error;
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: FLAKE_LEDGER_LABEL,
      color: 'fbca04',
      description: 'Nightly ledger of CI jobs that failed then passed',
    });
  }
}

/**
 * Keeps one rolling tracking issue current. It creates the issue only when
 * there is something to list, and otherwise just refreshes an existing one.
 */
export async function syncFlakeTracker({
  github,
  owner,
  repo,
  body,
  hasEntries,
  core = console,
}) {
  await ensureLabel(github, { owner, repo });
  const open = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    labels: FLAKE_LEDGER_LABEL,
    per_page: PAGE_SIZE,
  });
  const tracker = open.find(
    (issue) => !issue.pull_request && issue.body?.includes(FLAKE_LEDGER_MARKER),
  );
  const issueBody =
    body.length > ISSUE_BODY_LIMIT
      ? `${body.slice(0, ISSUE_BODY_LIMIT)}\n\n…truncated, see the run's job summary for the full ledger.`
      : body;
  if (tracker) {
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: tracker.number,
      body: issueBody,
    });
    core.info?.(`Updated flake ledger #${tracker.number}`);
    return tracker.number;
  }
  if (!hasEntries) {
    return null;
  }
  const created = await github.rest.issues.create({
    owner,
    repo,
    title: FLAKE_LEDGER_TITLE,
    body: issueBody,
    labels: [FLAKE_LEDGER_LABEL],
  });
  // `labels` on create is dropped silently without push access, and the
  // tracker is found again by label, so confirm it landed.
  const applied = await github.rest.issues.addLabels({
    owner,
    repo,
    issue_number: created.data.number,
    labels: [FLAKE_LEDGER_LABEL],
  });
  if (
    !(applied?.data ?? []).some((label) => label.name === FLAKE_LEDGER_LABEL)
  ) {
    throw new Error(
      `Flake ledger #${created.data.number} is missing the ${FLAKE_LEDGER_LABEL} label.`,
    );
  }
  core.info?.(`Created flake ledger #${created.data.number}`);
  return created.data.number;
}

export async function runFlakeLedger({
  github,
  owner,
  repo,
  days = FLAKE_LEDGER_WINDOW_DAYS,
  now = Date.now(),
  runUrl = null,
  core = console,
}) {
  const collected = await collectFlakeOccurrences({
    github,
    owner,
    repo,
    now,
    days,
    core,
  });
  const markdown = renderFlakeLedger(collected, {
    generatedAt: new Date(now).toISOString(),
    runUrl,
  });
  await core.summary?.addRaw(markdown, true).write();
  const issueNumber = await syncFlakeTracker({
    github,
    owner,
    repo,
    body: markdown,
    hasEntries: collected.occurrences.length > 0,
    core,
  });
  return { collected, issueNumber, markdown };
}
