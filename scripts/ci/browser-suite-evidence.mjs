import { pathToFileURL } from 'node:url';

// Release gate: the browser-level suites that Full Suite does not run must
// be green for the release SHA. They are dispatched (or run by their nightly)
// on master, take 30-60 minutes, and regressions in them have shipped to
// production while PR CI and Full Suite were green (2026-10-19).
//
// A green run on an earlier master commit still counts when every file changed
// since then is one the suite never builds or runs (`neutralPaths`). Anything
// else needs a fresh run on the release SHA. Paths are listed as neutral, not
// as relevant, so a new directory needs a fresh run until it is listed here.
const SHARED_NEUTRAL_PATHS = [
  /^[^/]+\.md$/u,
  /^docs\//u,
  /^\.agents\//u,
  /^\.claude\//u,
  /^\.github\/ISSUE_TEMPLATE\//u,
  /^\.github\/[^/]+\.md$/u,
  // Unit tests of the CI scripts run in PR CI, never inside either suite.
  /^scripts\/ci\/[^/]+\.test\.mjs$/u,
];

// A workflow file only runs itself. Neither suite calls a reusable workflow,
// so another workflow's change cannot reach it; its own file and the local
// actions it uses stay relevant.
function otherWorkflows(workflow) {
  return (path) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path) &&
    path !== `.github/workflows/${workflow}`;
}

export const REQUIRED_BROWSER_SUITES = [
  {
    label: 'Playwright Full',
    workflow: 'playwright-full-nightly.yml',
    // Builds @genfeedai/web (packages only) against a mocked API.
    neutralPaths: [
      ...SHARED_NEUTRAL_PATHS,
      otherWorkflows('playwright-full-nightly.yml'),
      /^apps\/(?:server|mobile)\//u,
      /^scripts\/ci\/runtime-acceptance\.mjs$/u,
    ],
  },
  {
    label: 'Learning Runtime',
    workflow: 'learning-runtime.yml',
    // Builds packages and runs the API learning specs; no frontend or browser.
    neutralPaths: [
      ...SHARED_NEUTRAL_PATHS,
      otherWorkflows('learning-runtime.yml'),
      /^apps\/(?:web|marketing|mobile|desktop|extension|docs)\//u,
      /^playwright\//u,
    ],
  },
];

// Carried evidence must also be recent, so a stale green cannot stand in for
// a suite that has not run for days.
export const MAX_CARRIED_EVIDENCE_HOURS = 48;
const MAX_LISTED_RELEVANT_PATHS = 5;

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

function isMasterEvidence(run) {
  return (
    EXACT_SHA_PATTERN.test(run?.head_sha ?? '') &&
    run.head_branch === 'master' &&
    (run.event === 'workflow_dispatch' || run.event === 'schedule')
  );
}

function isVerdict(run) {
  return run.status === 'completed' && run.conclusion !== 'cancelled';
}

export function isNeutralPath(suite, path) {
  return suite.neutralPaths.some((rule) =>
    typeof rule === 'function' ? rule(path) : rule.test(path),
  );
}

function exactShaEvidence(suite, matching, releaseSha) {
  const verdict = matching.find(isVerdict);
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
  const active = matching.find((run) => ACTIVE_STATUSES.has(run.status));
  if (active) {
    return {
      ok: false,
      suite,
      reason: `${suite.label} is still ${active.status} on ${releaseSha}: ${active.html_url}. Re-run Release when it finishes green.`,
    };
  }
  return null;
}

function nearestAncestorVerdict(runs, releaseSha, { git, now }) {
  const oldest = now - MAX_CARRIED_EVIDENCE_HOURS * 3_600_000;
  const recent = runs.filter(
    (run) =>
      run.head_sha !== releaseSha &&
      isVerdict(run) &&
      Date.parse(run.run_started_at ?? run.created_at ?? '') >= oldest,
  );
  let nearest = null;
  for (const sha of new Set(recent.map((run) => run.head_sha))) {
    if (!git.isAncestor(sha, releaseSha)) continue;
    const distance = git.commitsBetween(sha, releaseSha);
    if (!nearest || distance < nearest.distance) {
      nearest = { sha, distance };
    }
  }
  if (!nearest) return null;
  return {
    ...nearest,
    run: recent.filter((run) => run.head_sha === nearest.sha)[0],
  };
}

/**
 * Classify the evidence for one suite. An exact-SHA verdict decides: a newer
 * verdict supersedes an older one for the same SHA (a re-run that goes green
 * clears an earlier red), and an in-flight exact-SHA run is waited for.
 * Without one, the newest verdict on the nearest recent master ancestor
 * decides, and a green one counts only when every change since is neutral for
 * this suite. A cancelled run is never a verdict.
 */
export function classifySuiteEvidence(
  suite,
  runs,
  releaseSha,
  { git, now = Date.now() } = {},
) {
  if (!EXACT_SHA_PATTERN.test(releaseSha ?? '')) {
    throw new Error(
      `Release SHA must be an exact lowercase 40-character commit: ${releaseSha}`,
    );
  }
  const master = (runs ?? []).filter(isMasterEvidence).sort(newestFirst);
  const exact = exactShaEvidence(
    suite,
    master.filter((run) => run.head_sha === releaseSha),
    releaseSha,
  );
  if (exact) return exact;

  const dispatch = `Dispatch ${suite.workflow} on master, wait for it to pass, then re-run Release.`;
  const ancestor = git
    ? nearestAncestorVerdict(master, releaseSha, { git, now })
    : null;
  if (!ancestor) {
    return {
      ok: false,
      suite,
      reason: `${suite.label} has no completed run on ${releaseSha} or on a master commit before it in the last ${MAX_CARRIED_EVIDENCE_HOURS}h. ${dispatch}`,
    };
  }
  const relevant = git
    .changedFiles(ancestor.sha, releaseSha)
    .filter((path) => !isNeutralPath(suite, path));
  const listed = `${relevant.slice(0, MAX_LISTED_RELEVANT_PATHS).join(', ')}${
    relevant.length > MAX_LISTED_RELEVANT_PATHS
      ? ` and ${relevant.length - MAX_LISTED_RELEVANT_PATHS} more`
      : ''
  }`;
  const verdict = `${suite.label} concluded ${ancestor.run.conclusion} on ${ancestor.sha}, the nearest earlier master commit with a verdict (${ancestor.run.html_url})`;
  if (ancestor.run.conclusion !== 'success') {
    return {
      ok: false,
      suite,
      reason:
        relevant.length > 0
          ? `${verdict}, and ${relevant.length} file(s) it covers changed since: ${listed}. ${dispatch}`
          : `${verdict}, and nothing it covers changed since. Fix it on master, then release the new SHA.`,
    };
  }
  if (relevant.length > 0) {
    return {
      ok: false,
      suite,
      reason: `${verdict}, but ${relevant.length} file(s) it covers changed since: ${listed}. ${dispatch}`,
    };
  }
  return { ok: true, suite, run: ancestor.run, carriedFrom: ancestor.sha };
}

export function evaluateBrowserSuites(runsBySuite, releaseSha, options) {
  return REQUIRED_BROWSER_SUITES.map((suite) =>
    classifySuiteEvidence(
      suite,
      runsBySuite[suite.workflow],
      releaseSha,
      options,
    ),
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

// Reads the release checkout, which validate-release fetches with full history.
export function gitHistory(spawnSync) {
  const git = (args) =>
    spawnSync('git', args, { encoding: 'utf8', env: process.env });
  const output = (args) => {
    const result = git(args);
    if (result.status !== 0) {
      throw new Error(
        String(result.stderr || `git ${args.join(' ')} failed`).trim(),
      );
    }
    return result.stdout;
  };
  return {
    isAncestor(sha, releaseSha) {
      const result = git(['merge-base', '--is-ancestor', sha, releaseSha]);
      if (result.status === 0) return true;
      if (result.status === 1) return false;
      throw new Error(
        String(result.stderr || `git merge-base failed for ${sha}`).trim(),
      );
    },
    commitsBetween(sha, releaseSha) {
      return Number(output(['rev-list', '--count', `${sha}..${releaseSha}`]));
    },
    changedFiles(sha, releaseSha) {
      return output(['diff', '--name-only', '--no-renames', sha, releaseSha])
        .split('\n')
        .filter(Boolean);
    },
  };
}

function suiteRuns(repository, suite, releaseSha, api) {
  const base = `repos/${repository}/actions/workflows/${suite.workflow}/runs?branch=master&per_page=50`;
  const runs = new Map();
  for (const path of [`${base}&head_sha=${releaseSha}`, base]) {
    const response = api(path);
    if (!Array.isArray(response?.workflow_runs)) {
      throw new Error(`Unexpected runs response for ${suite.workflow}.`);
    }
    for (const run of response.workflow_runs) runs.set(run.id, run);
  }
  return [...runs.values()];
}

function summaryLine(result, releaseSha) {
  if (!result.ok) return result.reason;
  if (result.carriedFrom) {
    return `${result.suite.label}: green on ${result.carriedFrom} (${result.run.html_url}); nothing it covers changed before ${releaseSha}`;
  }
  return `${result.suite.label}: green on ${releaseSha} (${result.run.html_url})`;
}

export function runCli({
  env = process.env,
  spawnSync,
  appendFileSync,
  now = Date.now(),
  log = console.log,
  error = console.error,
}) {
  const releaseSha = env.RELEASE_SHA ?? '';
  const repository = env.GITHUB_REPOSITORY ?? '';
  try {
    if (!repository) throw new Error('GITHUB_REPOSITORY is required.');
    const api = (path) => ghCliJson(path, { spawnSync, token: env.GH_TOKEN });
    const runsBySuite = {};
    for (const suite of REQUIRED_BROWSER_SUITES) {
      runsBySuite[suite.workflow] = suiteRuns(
        repository,
        suite,
        releaseSha,
        api,
      );
    }

    const results = evaluateBrowserSuites(runsBySuite, releaseSha, {
      git: gitHistory(spawnSync),
      now,
    });
    const lines = results.map((result) => summaryLine(result, releaseSha));
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
