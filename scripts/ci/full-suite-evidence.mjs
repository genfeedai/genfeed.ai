import { pathToFileURL } from 'node:url';

const FINAL_CONNECTED_JOB = 'Final Connected Acceptance';
const MAX_API_PAGES = 10;

const EXACT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ACTIVE_STATUSES = new Set([
  'in_progress',
  'pending',
  'queued',
  'requested',
  'waiting',
]);
const HARD_FAILURE_CONCLUSIONS = new Set([
  'action_required',
  'failure',
  'startup_failure',
  'timed_out',
]);

export const DEFAULT_DISCOVERY_ATTEMPTS = 12;
export const DEFAULT_DISCOVERY_INTERVAL_MS = 5_000;
export const DEFAULT_POLL_ATTEMPTS = 150;
export const DEFAULT_POLL_INTERVAL_MS = 10_000;

function exactReleaseRun(run, releaseSha, currentRunId) {
  return (
    run?.head_sha === releaseSha &&
    (run.evidence_kind !== 'release' ||
      (Number.isSafeInteger(currentRunId) &&
        currentRunId > 0 &&
        run.id !== currentRunId &&
        run.status === 'completed' &&
        run.conclusion === 'success')) &&
    run?.head_branch === 'master' &&
    // A master push run or a manual dispatch; a release's own nested call
    // (`workflow_call`) is not independent evidence.
    (run?.event === 'push' || run?.event === 'workflow_dispatch')
  );
}

function newestFirst(left, right) {
  return String(right?.run_started_at ?? right?.created_at ?? '').localeCompare(
    String(left?.run_started_at ?? left?.created_at ?? ''),
  );
}

function hasVerdict(run) {
  return (
    run?.status === 'completed' &&
    (run.conclusion === 'success' || hardFailure(run.conclusion))
  );
}

export function selectFullSuiteRun(runs, releaseSha, currentRunId) {
  if (!EXACT_SHA_PATTERN.test(releaseSha ?? '')) {
    throw new Error(
      `Release SHA must be an exact lowercase 40-character commit: ${releaseSha}`,
    );
  }

  const matching = (runs ?? [])
    .filter((run) => exactReleaseRun(run, releaseSha, currentRunId))
    .sort(newestFirst);
  // A cancelled run (for example a manual re-run cancelled mid-flight) never
  // outranks a real verdict for the same SHA: it would hide that failure.
  return (
    matching.find(hasVerdict) ??
    matching.find((run) => ACTIVE_STATUSES.has(run.status)) ??
    matching.find((run) => run.conclusion !== 'cancelled') ??
    matching[0] ??
    null
  );
}

function runUrl(run) {
  return run?.html_url ?? `GitHub Actions run ${run?.id ?? 'unknown'}`;
}

function hardFailure(conclusion) {
  return HARD_FAILURE_CONCLUSIONS.has(conclusion ?? '');
}

function requireRunIdentity(run, expected, currentRunId) {
  if (
    run?.id !== expected.id ||
    !exactReleaseRun(
      { ...run, evidence_kind: expected.evidence_kind },
      expected.head_sha,
      currentRunId,
    ) ||
    (expected.workflow_id !== undefined &&
      run.workflow_id !== expected.workflow_id) ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1
  ) {
    throw new Error('Full Suite run identity or attempt is invalid.');
  }
}

async function attemptJobs(run, { getRun, listJobs, currentRunId }) {
  requireRunIdentity(run, run, currentRunId);
  // Attempt-specific jobs exclude successful jobs left over from earlier attempts.
  const jobs = await listJobs(run.id, run.run_attempt);
  if (!Array.isArray(jobs)) {
    throw new Error('Full Suite jobs response is invalid.');
  }
  const latest = await getRun(run.id);
  const observed = run.observedRun ?? run;
  requireRunIdentity(latest, observed, currentRunId);
  if (
    latest.run_attempt !== observed.run_attempt ||
    latest.status !== observed.status ||
    latest.conclusion !== observed.conclusion
  ) {
    throw new Error(
      `Full Suite ${runUrl(run)} changed during qualification; refusing to reuse stale evidence or start a duplicate run.`,
    );
  }
  return jobs;
}

async function classifyTerminalRun(run, options) {
  if (hardFailure(run?.conclusion)) {
    const detail = run.failedJob
      ? `contains ${run.failedJob.name ?? 'a job'} concluded ${run.failedJob.conclusion}`
      : `concluded ${run.conclusion}`;
    throw new Error(
      `Full Suite ${runUrl(run)} ${detail}; repair the failed surface and release a new SHA.`,
    );
  }

  if (run?.conclusion === 'success' || run?.conclusion === 'cancelled') {
    const jobs = await attemptJobs(run, options);
    const failedJob = jobs.find((job) => hardFailure(job?.conclusion));
    if (failedJob) {
      throw new Error(
        `Full Suite ${runUrl(run)} contains ${failedJob.name ?? 'a job'} concluded ${failedJob.conclusion}; repair the failed surface and release a new SHA.`,
      );
    }
    if (run.status === 'completed' && run.conclusion === 'success') {
      const expectedJob =
        run.evidence_kind === 'release'
          ? `Full Suite / ${FINAL_CONNECTED_JOB}`
          : FINAL_CONNECTED_JOB;
      const gates = jobs.filter((job) => job?.name === expectedJob);
      const gate = gates[0];
      if (
        gates.length === 1 &&
        gate.status === 'completed' &&
        gate.conclusion === 'success' &&
        gate.run_id === run.id &&
        gate.head_sha === run.head_sha &&
        (gate.run_attempt === undefined || gate.run_attempt === run.run_attempt)
      ) {
        return { kind: 'verified', run };
      }
      return {
        kind: 'fallback',
        reason: `Full Suite ${runUrl(run)} lacks one successful exact-SHA Final Connected Acceptance job in its latest attempt.`,
        run,
      };
    }
  }

  return {
    kind: 'fallback',
    reason: `Full Suite ${runUrl(run)} concluded ${run?.conclusion ?? run?.status ?? 'without reusable evidence'}.`,
    run,
  };
}

async function restoreVerdictAttempt(run, options) {
  let verdict = run;
  for (let attempt = run.run_attempt; attempt >= 1; attempt -= 1) {
    if (attempt !== run.run_attempt) {
      const previous = await options.getAttempt(run.id, attempt);
      requireRunIdentity(previous, run, options.currentRunId);
      if (previous.run_attempt !== attempt || previous.status !== 'completed') {
        throw new Error(
          'Full Suite prior attempt identity or status is invalid.',
        );
      }
      verdict = {
        ...previous,
        evidence_kind: run.evidence_kind,
        observedRun: run,
      };
    }
    if (hasVerdict(verdict)) return verdict;
    if (verdict.conclusion === 'cancelled') {
      const jobs = await attemptJobs(verdict, options);
      const failedJob = jobs.find((job) => hardFailure(job?.conclusion));
      if (failedJob) return { ...verdict, conclusion: 'failure', failedJob };
    }
  }
  return run;
}

async function waitForTerminalRun(
  initialRun,
  { getRun, listJobs, pollBudget, pollIntervalMs, sleep, currentRunId },
) {
  let run = initialRun;
  while (pollBudget.remaining > 0) {
    if (!ACTIVE_STATUSES.has(run?.status)) {
      return classifyTerminalRun(run, { getRun, listJobs, currentRunId });
    }

    if (pollBudget.remaining === 1) {
      throw new Error(
        `Timed out waiting for in-flight Full Suite ${runUrl(run)} to finish; refusing to start a duplicate run.`,
      );
    }

    pollBudget.remaining -= 1;
    await sleep(pollIntervalMs);
    try {
      const latest = await getRun(run.id);
      requireRunIdentity(latest, run, currentRunId);
      run = latest;
    } catch (error) {
      throw new Error(
        `Could not continue watching Full Suite ${runUrl(run)}; refusing to start a duplicate run: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error('Full Suite evidence polling exhausted unexpectedly.');
}

export async function resolveFullSuiteEvidence({
  releaseSha,
  currentRunId,
  listRuns,
  getRun,
  getAttempt,
  listJobs,
  sleep,
  discoveryAttempts = DEFAULT_DISCOVERY_ATTEMPTS,
  discoveryIntervalMs = DEFAULT_DISCOVERY_INTERVAL_MS,
  pollAttempts = DEFAULT_POLL_ATTEMPTS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  if (!Number.isInteger(discoveryAttempts) || discoveryAttempts < 1) {
    throw new Error('discoveryAttempts must be a positive integer.');
  }
  if (!Number.isInteger(pollAttempts) || pollAttempts < 1) {
    throw new Error('pollAttempts must be a positive integer.');
  }

  let run = null;
  let candidates = [];
  for (let attempt = 0; attempt < discoveryAttempts; attempt += 1) {
    let runs;
    try {
      runs = await listRuns(releaseSha);
    } catch (error) {
      return {
        kind: 'fallback',
        reason: `Full Suite evidence lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    candidates = [];
    for (const candidate of runs ?? []) {
      if (exactReleaseRun(candidate, releaseSha, currentRunId)) {
        candidates.push(
          await restoreVerdictAttempt(candidate, {
            getRun,
            getAttempt,
            listJobs,
            currentRunId,
          }),
        );
      }
    }
    run = selectFullSuiteRun(candidates, releaseSha, currentRunId);
    if (run) {
      break;
    }
    if (attempt < discoveryAttempts - 1) {
      await sleep(discoveryIntervalMs);
    }
  }

  if (!run) {
    return {
      kind: 'fallback',
      reason: `No master Full Suite run appeared for ${releaseSha} during the discovery window.`,
    };
  }

  const pollBudget = { remaining: pollAttempts };
  let result;
  while (run) {
    result = ACTIVE_STATUSES.has(run.status)
      ? await waitForTerminalRun(run, {
          getRun,
          listJobs,
          pollBudget,
          currentRunId,
          pollIntervalMs,
          sleep,
        })
      : await classifyTerminalRun(run, { getRun, listJobs, currentRunId });
    if (result.kind === 'verified') {
      return result;
    }
    // An ordinary green run without connected evidence cannot conceal a red run.
    candidates = candidates.filter((candidate) => candidate.id !== run.id);
    run = selectFullSuiteRun(candidates, releaseSha, currentRunId);
  }
  return result;
}

function parsePositiveInteger(value, fallback, label) {
  if (value == null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function ghCliJson(path, { spawnSync, token }) {
  const result = spawnSync('gh', ['api', path], {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: token },
  });
  if (result.status !== 0) {
    throw new Error(
      String(result.stderr || result.stdout || 'gh api failed').trim(),
    );
  }
  return JSON.parse(result.stdout || '{}');
}

export function paginatedCollection(api, path, key) {
  const rows = [];
  const ids = new Set();
  let total;
  for (let page = 1; page <= MAX_API_PAGES; page += 1) {
    const response = api(
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    const batch = response?.[key];
    if (
      !Array.isArray(batch) ||
      !Number.isSafeInteger(response.total_count) ||
      response.total_count < 0 ||
      (total !== undefined && response.total_count !== total)
    ) {
      throw new Error(
        'Full Suite API pagination is invalid or changed during collection.',
      );
    }
    total = response.total_count;
    for (const row of batch) {
      if (!Number.isSafeInteger(row?.id) || row.id < 1 || ids.has(row.id)) {
        throw new Error(
          'Full Suite API pagination contains invalid or duplicate identities.',
        );
      }
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length === total) return rows;
    if (rows.length > total || batch.length !== 100) {
      throw new Error('Full Suite API pagination is incomplete.');
    }
  }
  throw new Error('Full Suite API pagination exceeded its bounded page limit.');
}

export async function runCli({
  env = process.env,
  spawnSync,
  appendFileSync,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  log = console.log,
  error = console.error,
} = {}) {
  try {
    const repository = env.GITHUB_REPOSITORY ?? '';
    const releaseSha = env.RELEASE_SHA ?? '';
    const token = env.GH_TOKEN ?? '';
    const currentRunId = Number(env.GITHUB_RUN_ID);
    const api = (path) => ghCliJson(path, { spawnSync, token });
    const result = await resolveFullSuiteEvidence({
      releaseSha,
      currentRunId,
      listRuns: async () => [
        ...paginatedCollection(
          api,
          `repos/${repository}/actions/workflows/full-suite.yml/runs?head_sha=${releaseSha}`,
          'workflow_runs',
        ).map((run) => ({ ...run, evidence_kind: 'full-suite' })),
        ...paginatedCollection(
          api,
          `repos/${repository}/actions/workflows/release.yml/runs?head_sha=${releaseSha}`,
          'workflow_runs',
        ).map((run) => ({ ...run, evidence_kind: 'release' })),
      ],
      getRun: async (id) => api(`repos/${repository}/actions/runs/${id}`),
      getAttempt: async (id, attempt) =>
        api(`repos/${repository}/actions/runs/${id}/attempts/${attempt}`),
      listJobs: async (id, attempt) =>
        paginatedCollection(
          api,
          `repos/${repository}/actions/runs/${id}/attempts/${attempt}/jobs`,
          'jobs',
        ),
      sleep,
      discoveryAttempts: parsePositiveInteger(
        env.FULL_SUITE_DISCOVERY_ATTEMPTS,
        DEFAULT_DISCOVERY_ATTEMPTS,
        'FULL_SUITE_DISCOVERY_ATTEMPTS',
      ),
      discoveryIntervalMs: parsePositiveInteger(
        env.FULL_SUITE_DISCOVERY_INTERVAL_MS,
        DEFAULT_DISCOVERY_INTERVAL_MS,
        'FULL_SUITE_DISCOVERY_INTERVAL_MS',
      ),
      pollAttempts: parsePositiveInteger(
        env.FULL_SUITE_POLL_ATTEMPTS,
        DEFAULT_POLL_ATTEMPTS,
        'FULL_SUITE_POLL_ATTEMPTS',
      ),
      pollIntervalMs: parsePositiveInteger(
        env.FULL_SUITE_POLL_INTERVAL_MS,
        DEFAULT_POLL_INTERVAL_MS,
        'FULL_SUITE_POLL_INTERVAL_MS',
      ),
    });

    const verified = result.kind === 'verified';
    if (env.GITHUB_OUTPUT) {
      appendFileSync(env.GITHUB_OUTPUT, `suite_verified=${verified}\n`);
    }

    const message = verified
      ? `Reusing green Full Suite evidence for ${releaseSha}: ${runUrl(result.run)}`
      : `${result.reason} verify-suite will run.`;
    log(message);
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        verified
          ? `Full Suite evidence reused for \`${releaseSha}\`: ${runUrl(result.run)}\n`
          : `Full Suite fallback for \`${releaseSha}\`: ${result.reason}\n`,
      );
    }
    return result;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    error(`::error::${message}`);
    process.exitCode = 1;
    return null;
  }
}

async function main() {
  const { spawnSync } = await import('node:child_process');
  const { appendFileSync } = await import('node:fs');
  await runCli({ spawnSync, appendFileSync });
  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
