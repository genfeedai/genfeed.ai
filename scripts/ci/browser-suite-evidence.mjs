import { pathToFileURL } from 'node:url';

// Release gate: the browser-level suites that Full Suite does not run must
// already be green on the exact release SHA. They are dispatched (or run by
// their nightly) on master, take 30-60 minutes, and regressions in them have
// shipped to production while PR CI and Full Suite were green (2026-10-19).
export const REQUIRED_BROWSER_SUITES = [
  { label: 'Playwright Full', workflow: 'playwright-full-nightly.yml' },
  { label: 'Learning Runtime', workflow: 'learning-runtime.yml' },
];

const EXACT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ACTIVE_STATUSES = new Set([
  'in_progress',
  'pending',
  'queued',
  'requested',
  'waiting',
]);

function newestFirst(left, right) {
  return String(right?.run_started_at ?? right?.created_at ?? '').localeCompare(
    String(left?.run_started_at ?? left?.created_at ?? ''),
  );
}

function matchesRelease(run, releaseSha) {
  return (
    run?.head_sha === releaseSha &&
    run.head_branch === 'master' &&
    (run.event === 'workflow_dispatch' || run.event === 'schedule')
  );
}

/**
 * Classify the evidence for one suite. A newer verdict supersedes an older
 * one for the same SHA (a re-run that goes green clears an earlier red); a
 * cancelled run is never a verdict.
 */
export function classifySuiteEvidence(suite, runs, releaseSha) {
  if (!EXACT_SHA_PATTERN.test(releaseSha ?? '')) {
    throw new Error(
      `Release SHA must be an exact lowercase 40-character commit: ${releaseSha}`,
    );
  }
  const matching = (runs ?? [])
    .filter((run) => matchesRelease(run, releaseSha))
    .sort(newestFirst);
  const verdict = matching.find(
    (run) => run.status === 'completed' && run.conclusion !== 'cancelled',
  );
  const active = matching.find((run) => ACTIVE_STATUSES.has(run.status));

  if (verdict?.conclusion === 'success') {
    return { ok: true, suite, run: verdict };
  }
  if (verdict) {
    return {
      ok: false,
      suite,
      reason: `${suite.label} concluded ${verdict.conclusion} on ${releaseSha}: ${verdict.html_url}. Fix it on master, then release the new SHA.`,
    };
  }
  if (active) {
    return {
      ok: false,
      suite,
      reason: `${suite.label} is still ${active.status} on ${releaseSha}: ${active.html_url}. Re-run Release when it finishes green.`,
    };
  }
  return {
    ok: false,
    suite,
    reason: `${suite.label} has no completed run on ${releaseSha}. Dispatch ${suite.workflow} on master, wait for it to pass, then re-run Release.`,
  };
}

export function evaluateBrowserSuites(runsBySuite, releaseSha) {
  return REQUIRED_BROWSER_SUITES.map((suite) =>
    classifySuiteEvidence(suite, runsBySuite[suite.workflow], releaseSha),
  );
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

export function runCli({
  env = process.env,
  spawnSync,
  appendFileSync,
  log = console.log,
  error = console.error,
}) {
  const releaseSha = env.RELEASE_SHA ?? '';
  const repository = env.GITHUB_REPOSITORY ?? '';
  try {
    if (!repository) throw new Error('GITHUB_REPOSITORY is required.');
    const runsBySuite = {};
    for (const suite of REQUIRED_BROWSER_SUITES) {
      const response = ghCliJson(
        `repos/${repository}/actions/workflows/${suite.workflow}/runs?head_sha=${releaseSha}&branch=master&per_page=30`,
        { spawnSync, token: env.GH_TOKEN },
      );
      if (!Array.isArray(response?.workflow_runs)) {
        throw new Error(`Unexpected runs response for ${suite.workflow}.`);
      }
      runsBySuite[suite.workflow] = response.workflow_runs;
    }

    const results = evaluateBrowserSuites(runsBySuite, releaseSha);
    const lines = results.map((result) =>
      result.ok
        ? `${result.suite.label}: green on ${releaseSha} (${result.run.html_url})`
        : result.reason,
    );
    for (const line of lines) log(line);
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        `## Browser suite evidence\n\n${lines.map((line) => `- ${line}`).join('\n')}\n`,
      );
    }
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) {
      for (const result of failed) error(`::error::${result.reason}`);
      process.exitCode = 1;
    }
    return results;
  } catch (caught) {
    error(`::error::${caught instanceof Error ? caught.message : caught}`);
    process.exitCode = 1;
    return null;
  }
}

async function main() {
  const { spawnSync } = await import('node:child_process');
  const { appendFileSync } = await import('node:fs');
  runCli({ spawnSync, appendFileSync });
  if (process.exitCode) process.exit(process.exitCode);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
