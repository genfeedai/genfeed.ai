#!/usr/bin/env node
// Hands the Plan job's decisions to the jobs that start beside it.
//
// The test jobs used to declare `needs: plan`, so none of them started before
// Plan finished (a median 2.1 minutes, #10272). They now start with the run,
// repeat the trust gate, check out and install while Plan works, and only then
// read what Plan decided from a run artifact:
//
//   publish    Plan, last step: writes its job outputs to a JSON file
//   preflight  every early job, before install: can this job have work at all?
//   await      every early job, after install: read the plan, pick this job's
//              slice of it
//   verify     Validation Verdict: every job the plan called for did its work
//
// `preflight` only ever answers "no" when the planner is certain to give the
// job nothing, using the planner's own classification functions, so an idle
// job skips its install. `verify` is the fail-closed half: a job that exited
// as idle although the plan called for it fails the verdict.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import {
  classifyChangedFiles,
  createPlanOutputs,
  isChangeRunEvent,
  readChangedFiles,
} from './pr-test-plan.mjs';

export const PLAN_ARTIFACT_PREFIX = 'test-plan-outputs';
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const API_ROOT = 'https://api.github.com';

// The Plan job's outputs, by name. The Plan job declares the same names under
// `outputs:`; the workflow test compares the two lists, so a new Plan output
// cannot reach the verdict without also reaching the jobs that start early.
export const PLAN_OUTPUT_NAMES = [
  'base',
  'setup_benchmark',
  'heavy-tier',
  'app',
  'api',
  'app_tests',
  'api_tests',
  'mcp_auth_runtime',
  'app_matrix',
  'api_matrix',
  'force_full',
  'workspace_tests',
  'workspace_matrix',
  'spec_run',
  'spec_workspaces',
  'spec_build_filters',
];

// Outputs that carry per-leg lists. They can be hundreds of kilobytes, so they
// never travel in the flat outputs a step hands to a shell.
const LEG_MATRIX_OUTPUTS = new Set([
  'app_matrix',
  'api_matrix',
  'workspace_matrix',
]);

// What each kind of early job is, its job-name label in the run, and the step
// that does its work. `verify` reads the step conclusion.
export const LEG_KINDS = {
  app: { step: 'Run app tests' },
  api: { step: 'Run API tests' },
  workspaces: { step: 'Run workspace tests' },
};

// The jobs that are one job each: planned when the plan output says so, and
// the step that does the work.
const SINGLE_JOBS = [
  {
    job: 'Spec Typecheck',
    step: 'Spec Typecheck',
    isPlanned: (outputs) => isTrue(outputs.spec_run),
  },
  { job: 'Build', step: 'Run build', isPlanned: () => true },
  {
    job: 'Cloud Tenant Guard Sweep',
    step: 'Sweep handlers with tenant enforcement enabled',
    isPlanned: (outputs) => isTrue(outputs.api_tests),
  },
  {
    job: 'MCP Auth Runtime',
    step: 'Execute isolated real auth and brand policy journey',
    isPlanned: (outputs) => isTrue(outputs.mcp_auth_runtime),
  },
];

export function planArtifactName(attempt) {
  return `${PLAN_ARTIFACT_PREFIX}-${attempt}`;
}

/**
 * The Plan job's outputs: the planner's own, from its manifest, plus what the
 * workflow's other Plan steps resolved.
 *
 * @param {object} input
 * @param {object} input.plan the planner's manifest
 * @param {string} input.base
 * @param {string} input.heavy
 * @param {string} input.specRun
 * @param {string} input.specWorkspaces
 * @param {string} input.specBuildFilters
 * @returns {Record<string, string>}
 */
export function buildPlanOutputs({
  plan,
  base,
  heavy,
  specRun,
  specWorkspaces,
  specBuildFilters,
}) {
  const planner = createPlanOutputs(plan, '');
  const values = {
    ...Object.fromEntries(
      Object.entries(planner).map(([name, value]) => [name, String(value)]),
    ),
    base,
    'heavy-tier': heavy,
    spec_run: specRun,
    spec_workspaces: specWorkspaces,
    spec_build_filters: specBuildFilters,
  };
  return Object.fromEntries(
    PLAN_OUTPUT_NAMES.map((name) => [name, values[name] ?? '']),
  );
}

function parseMatrix(raw, name) {
  if (raw === '' || raw === undefined) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed?.include)) {
    throw new TypeError(`${name} must hold an include list`);
  }
  return parsed.include;
}

function isTrue(value) {
  return value === 'true';
}

/**
 * Which entry of the plan's matrix an early job runs.
 *
 * `app` and `api` jobs are numbered by shard. Workspace jobs are the pool slots
 * `1` to `4` plus `server`: pool N takes the Nth balanced leg, the server slot
 * takes the server leg, whatever its position in the plan.
 *
 * @returns {{ run: boolean, leg: object | null }}
 */
export function resolveLeg({ kind, slot, outputs }) {
  if (kind === 'app' || kind === 'api') {
    const planned = isTrue(outputs[`${kind}_tests`]);
    const entries = parseMatrix(outputs[`${kind}_matrix`], `${kind}_matrix`);
    const entry = entries[Number(slot) - 1];
    return planned && entry
      ? { run: true, leg: entry }
      : { run: false, leg: null };
  }
  if (kind === 'workspaces') {
    const planned = isTrue(outputs.workspace_tests);
    const entries = parseMatrix(outputs.workspace_matrix, 'workspace_matrix');
    const entry =
      slot === 'server'
        ? entries.find((candidate) => candidate.group === 'server')
        : entries.filter((candidate) => candidate.group !== 'server')[
            Number(slot) - 1
          ];
    return planned && entry
      ? { run: true, leg: entry }
      : { run: false, leg: null };
  }
  throw new Error(`Unknown leg kind: ${kind}`);
}

/**
 * Every early job the plan calls for, by the job name the workflow gives it.
 *
 * @returns {{ job: string, step: string }[]}
 */
export function plannedLegs(outputs) {
  const legs = [];
  const add = (kind, slot, job) => {
    if (resolveLeg({ kind, slot, outputs }).run) {
      legs.push({ job, step: LEG_KINDS[kind].step });
    }
  };
  for (let shard = 1; shard <= 4; shard += 1) {
    add('app', String(shard), `Test App (shard ${shard}/4)`);
  }
  for (let shard = 1; shard <= 8; shard += 1) {
    add('api', String(shard), `Test API (shard ${shard}/8)`);
  }
  for (let pool = 1; pool <= 4; pool += 1) {
    add('workspaces', String(pool), `Test Workspaces (workspaces-${pool}/4)`);
  }
  add('workspaces', 'server', 'Test Workspaces (server)');
  for (const { job, step, isPlanned } of SINGLE_JOBS) {
    if (isPlanned(outputs)) legs.push({ job, step });
  }
  return legs;
}

const NARROW_PREFIXES = [
  'apps/',
  '.agents/',
  '.claude/',
  '.codex/',
  '.github/',
];

/**
 * Whether the planner can give an early job any work, judged from the changed
 * files alone. Answers `true` whenever unsure: a wrong `false` would skip work
 * the plan asks for, and `verify` would then fail the verdict.
 *
 * @param {{
 *   kind: string,
 *   slot: string,
 *   changedFiles: readonly string[],
 *   isChangeRun: boolean,
 *   isHeavy: boolean,
 * }} input
 */
export function mayHaveWork({
  kind,
  slot,
  changedFiles,
  isChangeRun,
  isHeavy,
}) {
  const forceAllSurfaces = !isChangeRun;
  const classification = classifyChangedFiles(changedFiles);
  const forceFull = isHeavy || classification.forceFull;
  const everything = forceAllSurfaces || forceFull;

  if (kind === 'app') return everything || classification.app;
  if (kind === 'api') {
    if (!(everything || classification.api)) return false;
    // The affected tier never plans more than four API shards.
    return Number(slot) <= 4 || forceFull;
  }
  if (kind === 'workspaces') {
    if (slot === 'server' || slot === '1') return true;
    // A second pool needs more than the web and extension groups (700 weight
    // against a 1000 target), so it needs a package, a root file or a full run.
    const isNarrow = changedFiles.every((file) =>
      NARROW_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );
    return everything || !isNarrow;
  }
  throw new Error(`Unknown leg kind: ${kind}`);
}

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

/** The diff base, resolved exactly as the Plan job resolves it. */
export function resolveDiffBase(env, git = runGit) {
  if (env.EVENT_NAME === 'pull_request') return git(['rev-parse', 'HEAD^1']);
  if (env.EVENT_NAME === 'merge_group') {
    const base = env.MERGE_GROUP_BASE_SHA ?? '';
    if (!SHA_PATTERN.test(base))
      throw new Error('Invalid merge group base SHA');
    git(['merge-base', '--is-ancestor', base, 'HEAD']);
    return base;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Reading the plan from the run

function authHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Conditional GET: a 304 does not count against the token's rate limit, so
 * polling a not-yet-changed list is free.
 */
function createConditionalClient({ fetchImpl, token }) {
  const cache = new Map();
  return async function getJson(url) {
    const known = cache.get(url);
    const response = await fetchImpl(url, {
      headers: {
        ...authHeaders(token),
        ...(known ? { 'If-None-Match': known.etag } : {}),
      },
    });
    if (response.status === 304 && known) return known.body;
    if (!response.ok) {
      throw new Error(`GET ${url} failed with HTTP ${response.status}`);
    }
    const body = await response.json();
    const etag = response.headers.get('etag');
    if (etag) cache.set(url, { body, etag });
    return body;
  };
}

/**
 * The newest plan artifact an attempt up to this one published.
 *
 * A job re-run on its own (re-run failed jobs) is a later attempt than the one
 * that planned, and finds that attempt's artifact. A plan from an earlier
 * attempt of the same run describes the same commit, so it stays valid.
 */
export function pickPlanArtifact(artifacts, attempt) {
  const candidates = artifacts
    .filter((entry) => !entry.expired)
    .map((entry) => ({
      entry,
      planAttempt: parsePlanAttempt(entry.name),
    }))
    .filter(
      (candidate) =>
        candidate.planAttempt !== null && candidate.planAttempt <= attempt,
    )
    .sort((a, b) => b.planAttempt - a.planAttempt);
  return candidates[0]?.entry ?? null;
}

function parsePlanAttempt(name) {
  const prefix = `${PLAN_ARTIFACT_PREFIX}-`;
  if (!name.startsWith(prefix)) return null;
  const attempt = Number(name.slice(prefix.length));
  return Number.isSafeInteger(attempt) && attempt > 0 ? attempt : null;
}

/**
 * Waits for the Plan job to publish and returns its outputs.
 *
 * The Plan job publishes on every outcome it can report: its outputs when it
 * succeeds, a failure marker when it fails, so a failed Plan fails the waiting
 * jobs at once instead of leaving them to time out. A cancelled run cancels
 * them as well.
 */
export async function awaitPlanOutputs({
  repository,
  runId,
  attempt,
  token,
  fetchImpl = fetch,
  download = downloadArtifactJson,
  wait = sleep,
  now = Date.now,
  intervalMs = 4_000,
  timeoutMs = 15 * 60_000,
}) {
  const getJson = createConditionalClient({ fetchImpl, token });
  const listUrl = `${API_ROOT}/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`;
  const deadline = now() + timeoutMs;
  let isNotePrinted = false;

  while (now() < deadline) {
    const { artifacts } = await getJson(listUrl);
    const artifact = pickPlanArtifact(artifacts, attempt);
    if (artifact) {
      const plan = await download({ artifact, token, fetchImpl });
      if (plan?.ok !== true) {
        throw new Error('The Plan job failed; there is no plan to read');
      }
      return plan.outputs;
    }
    if (!isNotePrinted) {
      process.stderr.write('Waiting for the Plan job to publish its outputs\n');
      isNotePrinted = true;
    }
    await wait(intervalMs);
  }
  throw new Error('Timed out waiting for the Plan job to publish its outputs');
}

export async function downloadArtifactJson({
  artifact,
  token,
  fetchImpl = fetch,
}) {
  // The archive URL answers with a redirect to blob storage. The token is for
  // the API only, so follow the redirect without it.
  const first = await fetchImpl(artifact.archive_download_url, {
    headers: authHeaders(token),
    redirect: 'manual',
  });
  const location = first.headers.get('location');
  const response =
    first.status >= 300 && first.status < 400 && location
      ? await fetchImpl(location)
      : first;
  if (!response.ok) {
    throw new Error(
      `Downloading ${artifact.name} failed with HTTP ${response.status}`,
    );
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'test-plan-'));
  const archive = path.join(directory, 'plan.zip');
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  const unzipped = spawnSync('unzip', ['-p', archive], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (unzipped.status !== 0) {
    throw new Error(
      `Reading ${artifact.name} failed: ${unzipped.stderr.trim()}`,
    );
  }
  return JSON.parse(unzipped.stdout);
}

// ---------------------------------------------------------------------------
// Verifying that the planned jobs did their work

/**
 * A planned job that ended idle: its work step never ran, or did not run to a
 * conclusion. A work step that failed or was cancelled is not reported here;
 * the verdict already fails on that job's own result.
 *
 * @param {{ name: string, steps?: { name: string, conclusion: string | null }[] }[]} jobs
 * @param {{ job: string, step: string }[]} legs
 * @returns {string[]} one message per planned job that did not do its work
 */
export function findIdleLegs(jobs, legs) {
  const problems = [];
  for (const { job, step } of legs) {
    // The job is a Core Validation job whichever workflow called it.
    const matches = jobs.filter(
      (candidate) =>
        candidate.name === `Core Validation / ${job}` ||
        candidate.name.endsWith(` / Core Validation / ${job}`),
    );
    if (matches.length !== 1) {
      problems.push(
        `${job}: expected one job in this run, found ${matches.length}`,
      );
      continue;
    }
    const worked = matches[0].steps?.find((entry) => entry.name === step);
    if (
      !worked ||
      worked.conclusion === 'skipped' ||
      worked.conclusion === null
    ) {
      problems.push(
        `${job}: the plan called for it but "${step}" ${worked?.conclusion ?? 'is missing'}`,
      );
    }
  }
  return problems;
}

async function listRunJobs({ repository, runId, token, fetchImpl = fetch }) {
  // Pages stay small: a run with many jobs does not build a 100 job page.
  const jobs = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetchImpl(
      `${API_ROOT}/repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=30&page=${page}`,
      { headers: authHeaders(token) },
    );
    if (!response.ok) {
      throw new Error(`Listing run jobs failed with HTTP ${response.status}`);
    }
    const body = await response.json();
    jobs.push(...body.jobs);
    if (jobs.length >= body.total_count || body.jobs.length === 0) break;
  }
  return jobs;
}

// ---------------------------------------------------------------------------
// CLI

function writeOutputs(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }
  process.stdout.write(
    `${lines.map((line) => line.slice(0, 200)).join('\n')}\n`,
  );
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function commandPublish() {
  const file = requireEnv('PLAN_OUTPUTS_FILE');
  const env = process.env;
  const plan = {
    ok: true,
    outputs: buildPlanOutputs({
      plan: JSON.parse(readFileSync(requireEnv('PLAN_MANIFEST'), 'utf8')),
      base: env.PLAN_BASE ?? '',
      heavy: env.PLAN_HEAVY ?? '',
      specRun: env.PLAN_SPEC_RUN ?? '',
      specWorkspaces: env.PLAN_SPEC_WORKSPACES ?? '',
      specBuildFilters: env.PLAN_SPEC_BUILD_FILTERS ?? '',
    }),
  };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(plan)}\n`);
  writeOutputs({ file });
}

// Only these jobs check out the full history the diff needs.
const HISTORY_KINDS = new Set(['app', 'api', 'workspaces']);

async function commandPreflight() {
  const kind = requireEnv('LEG_KIND');
  const slot = process.env.LEG_SLOT ?? '';
  const isChangeRun = isChangeRunEvent(process.env.EVENT_NAME ?? '');
  let mayRun = true;
  if (HISTORY_KINDS.has(kind)) {
    try {
      const base = isChangeRun ? resolveDiffBase(process.env) : '';
      mayRun = mayHaveWork({
        kind,
        slot,
        changedFiles: isChangeRun ? await readChangedFiles(base) : [],
        isChangeRun,
        isHeavy: process.env.HEAVY_HINT === 'true',
      });
    } catch (error) {
      // No answer is not a "no": the job installs and reads the plan.
      process.stderr.write(
        `::warning::Could not rule this job out from the diff: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  if (!mayRun) {
    process.stdout.write(
      `No work is possible for ${kind} ${slot}; skipping install\n`,
    );
  }
  writeOutputs({ may_run: mayRun, run: mayRun ? '' : 'false' });
}

async function commandAwait() {
  const kind = requireEnv('LEG_KIND');
  const slot = process.env.LEG_SLOT ?? '';
  const outputs = await awaitPlanOutputs({
    repository: requireEnv('GITHUB_REPOSITORY'),
    runId: requireEnv('GITHUB_RUN_ID'),
    attempt: Number(requireEnv('GITHUB_RUN_ATTEMPT')),
    token: requireEnv('GH_TOKEN'),
  });
  const scalars = Object.fromEntries(
    Object.entries(outputs).filter(([name]) => !LEG_MATRIX_OUTPUTS.has(name)),
  );
  const { run, leg } =
    kind === 'app' || kind === 'api' || kind === 'workspaces'
      ? resolveLeg({ kind, slot, outputs })
      : { run: true, leg: null };
  const planned =
    kind === 'cloud-tenant-guard'
      ? isTrue(outputs.api_tests)
      : kind === 'mcp-auth-runtime'
        ? isTrue(outputs.mcp_auth_runtime)
        : kind === 'spec-typecheck'
          ? isTrue(outputs.spec_run)
          : run;
  writeOutputs({
    run: planned,
    leg: JSON.stringify(leg ?? {}),
    plan: JSON.stringify(scalars),
  });
}

async function commandVerify() {
  const repository = requireEnv('GITHUB_REPOSITORY');
  const runId = requireEnv('GITHUB_RUN_ID');
  const token = requireEnv('GH_TOKEN');
  // The Plan job has finished by now, so its artifact is already there.
  const outputs = await awaitPlanOutputs({
    repository,
    runId,
    attempt: Number(requireEnv('GITHUB_RUN_ATTEMPT')),
    token,
    timeoutMs: 2 * 60_000,
  });
  const legs = plannedLegs(outputs);
  const jobs = await listRunJobs({ repository, runId, token });
  const problems = findIdleLegs(jobs, legs);
  process.stdout.write(
    `Checked ${legs.length} planned test jobs: ${problems.length} did not do their work\n`,
  );
  if (problems.length > 0) {
    for (const problem of problems)
      process.stderr.write(`::error::${problem}\n`);
    process.exitCode = 1;
  }
}

const COMMANDS = {
  await: commandAwait,
  preflight: commandPreflight,
  publish: commandPublish,
  verify: commandVerify,
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const command = COMMANDS[process.argv[2] ?? ''];
  if (!command) {
    process.stderr.write(
      `Usage: test-plan-handoff.mjs <${Object.keys(COMMANDS).join('|')}>\n`,
    );
    process.exitCode = 2;
  } else {
    command().catch((error) => {
      process.stderr.write(
        `::error::${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
  }
}
