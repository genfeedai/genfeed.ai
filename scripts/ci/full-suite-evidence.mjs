import { pathToFileURL } from 'node:url';

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

function exactReleaseRun(run, releaseSha) {
  return (
    run?.head_sha === releaseSha &&
    run?.head_branch === 'master' &&
    (run?.event === 'push' || run?.event === 'workflow_dispatch')
  );
}

function newestFirst(left, right) {
  return String(right?.created_at ?? '').localeCompare(
    String(left?.created_at ?? ''),
  );
}

export function selectFullSuiteRun(runs, releaseSha) {
  if (!EXACT_SHA_PATTERN.test(releaseSha ?? '')) {
    throw new Error(
      `Release SHA must be an exact lowercase 40-character commit: ${releaseSha}`,
    );
  }

  const matching = (runs ?? [])
    .filter((run) => exactReleaseRun(run, releaseSha))
    .sort(newestFirst);
  return (
    matching.find((run) => run.conclusion === 'success') ??
    matching.find((run) => ACTIVE_STATUSES.has(run.status)) ??
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

async function classifyTerminalRun(run, { listJobs }) {
  if (run?.conclusion === 'success') {
    return { kind: 'verified', run };
  }

  if (hardFailure(run?.conclusion)) {
    throw new Error(
      `Full Suite ${runUrl(run)} concluded ${run.conclusion}; repair the failed surface and release a new SHA.`,
    );
  }

  if (run?.conclusion === 'cancelled') {
    let jobs;
    try {
      jobs = await listJobs(run.id);
    } catch (error) {
      return {
        kind: 'fallback',
        reason: `Could not inspect cancelled Full Suite ${runUrl(run)}: ${error instanceof Error ? error.message : String(error)}`,
        run,
      };
    }

    const failedJob = (jobs ?? []).find((job) => hardFailure(job?.conclusion));
    if (failedJob) {
      throw new Error(
        `Full Suite ${runUrl(run)} was cancelled after ${failedJob.name ?? 'a job'} concluded ${failedJob.conclusion}; repair the failed surface and release a new SHA.`,
      );
    }
  }

  return {
    kind: 'fallback',
    reason: `Full Suite ${runUrl(run)} concluded ${run?.conclusion ?? run?.status ?? 'without reusable evidence'}.`,
    run,
  };
}

async function waitForTerminalRun(
  initialRun,
  { getRun, listJobs, pollAttempts, pollIntervalMs, sleep },
) {
  let run = initialRun;
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    if (!ACTIVE_STATUSES.has(run?.status)) {
      return classifyTerminalRun(run, { listJobs });
    }

    if (attempt === pollAttempts - 1) {
      throw new Error(
        `Timed out waiting for in-flight Full Suite ${runUrl(run)} to finish; refusing to start a duplicate run.`,
      );
    }

    await sleep(pollIntervalMs);
    try {
      run = await getRun(run.id);
    } catch (error) {
      return {
        kind: 'fallback',
        reason: `Could not continue watching Full Suite ${runUrl(run)}: ${error instanceof Error ? error.message : String(error)}`,
        run,
      };
    }
  }

  throw new Error('Full Suite evidence polling exhausted unexpectedly.');
}

export async function resolveFullSuiteEvidence({
  releaseSha,
  listRuns,
  getRun,
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

    run = selectFullSuiteRun(runs, releaseSha);
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

  if (ACTIVE_STATUSES.has(run.status)) {
    return waitForTerminalRun(run, {
      getRun,
      listJobs,
      pollAttempts,
      pollIntervalMs,
      sleep,
    });
  }

  return classifyTerminalRun(run, { listJobs });
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
    const api = (path) => ghCliJson(path, { spawnSync, token });
    const result = await resolveFullSuiteEvidence({
      releaseSha,
      listRuns: async () =>
        api(
          `repos/${repository}/actions/workflows/full-suite.yml/runs?head_sha=${releaseSha}&per_page=100`,
        ).workflow_runs ?? [],
      getRun: async (id) => api(`repos/${repository}/actions/runs/${id}`),
      listJobs: async (id) =>
        api(`repos/${repository}/actions/runs/${id}/jobs?per_page=100`).jobs ??
        [],
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
