#!/usr/bin/env node
import { execFile, execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const BASELINE = new URL(
  './changed-code-coverage.baseline.json',
  import.meta.url,
);
const SHA = /^[a-f0-9]{40}$/u;
const REPORT_NAME = /^changed-code-coverage-(\d+)-(\d+)$/u;
const pct = (hits, total) =>
  total > 0 ? Math.round((hits / total) * 10000) / 100 : null;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const count = (n) => Number.isSafeInteger(n) && n >= 0;

export function validateObservation(entry, repository, minimumVersion) {
  const { artifact, report } = entry;
  if (entry.error) return entry.error;
  const name = artifact?.name?.match(REPORT_NAME);
  if (!name || artifact.expired)
    return 'Missing, expired, or unexpected artifact identity';
  if (!Number.isInteger(report?.version) || report.version < minimumVersion)
    return 'Unsupported report version';
  const { normalized: n, telemetry: t } = report;
  if (
    !n ||
    !t ||
    t.repository !== repository ||
    t.pullRequest !== Number(name[1]) ||
    String(t.runAttempt) !== name[2] ||
    String(t.runId) !== String(artifact.workflow_run?.id)
  )
    return 'Report identity does not match its artifact';
  if (!SHA.test(n.baseSha) || !SHA.test(n.headSha))
    return 'Missing exact base/head commit IDs';
  if (
    ![
      'observation-only',
      'unmeasured',
      'not-applicable',
      'infrastructure-failed',
      'reported',
      'below-ratchet',
    ].includes(n.disposition)
  )
    return 'Unknown report disposition';
  if (!count(n.changedFileCount)) return 'Invalid changed-file count';
  if (
    !Array.isArray(n.surfaces) ||
    n.surfaces.length !== 2 ||
    new Set(n.surfaces.map((s) => s.name)).size !== 2 ||
    n.surfaces.some((s) => !['app', 'api'].includes(s.name))
  )
    return 'Incomplete surface inventory';
  for (const key of ['lines', 'branches']) {
    const m = n.totals?.[key];
    if (
      !m ||
      !count(m.measured) ||
      !count(m.covered) ||
      !count(m.uncovered) ||
      m.covered + m.uncovered !== m.measured ||
      m.percent !== pct(m.covered, m.measured)
    )
      return `Invalid ${key} counters`;
  }
  const lines = n.totals.lines;
  if (
    !count(lines.unmeasured) ||
    lines.strictPercent !==
      pct(lines.covered, lines.measured + lines.unmeasured)
  )
    return 'Invalid strict line coverage';
  if (n.disposition === 'not-applicable' && n.changedFileCount !== 0)
    return 'Applicable source changes reported as not-applicable';
  if (
    ['observation-only', 'reported', 'below-ratchet'].includes(n.disposition) &&
    lines.measured === 0
  )
    return 'Observation contains no measured lines';
  return null;
}

export function assessObservations(
  entries,
  baseline,
  { repository, complete = true, since = null, collectedAt = null } = {},
) {
  const errors = [];
  const unique = new Map();
  for (const entry of entries) {
    const key =
      entry.artifact?.id ?? `missing-${entry.run?.id ?? errors.length}`;
    if (unique.has(key)) continue;
    unique.set(key, entry);
  }
  const valid = [];
  for (const entry of unique.values()) {
    const reason = validateObservation(
      entry,
      repository,
      baseline.observation.evidence.minimumReportVersion,
    );
    if (reason)
      errors.push({
        artifactId: entry.artifact?.id ?? null,
        runId: entry.run?.id ?? entry.artifact?.workflow_run?.id ?? null,
        reason,
      });
    else valid.push(entry);
  }
  // A re-run never manufactures a second representative PR observation.
  const latest = new Map();
  for (const entry of valid.sort(
    (a, b) =>
      a.artifact.created_at.localeCompare(b.artifact.created_at) ||
      a.artifact.id - b.artifact.id,
  ))
    latest.set(entry.report.telemetry.pullRequest, entry);
  const applicable = valid.filter(
    (e) => e.report.normalized.disposition !== 'not-applicable',
  );
  const successful = applicable.filter(
    (e) =>
      ['observation-only', 'reported', 'below-ratchet'].includes(
        e.report.normalized.disposition,
      ) &&
      e.report.normalized.surfaces.every(
        (s) =>
          !['failure', 'cancelled'].includes(s.result) &&
          s.status !== 'infrastructure-failed',
      ),
  );
  const measured = [...latest.values()].filter((e) => successful.includes(e));
  const latencies = successful
    .map((e) => e.report.telemetry.latencySeconds)
    .filter((n) => finite(n) && n >= 0 && n < 86400)
    .sort((a, b) => a - b);
  const latencyP95Seconds = latencies.length
    ? latencies[Math.ceil(latencies.length * 0.95) - 1]
    : null;
  const infrastructureSuccesses = applicable.filter(
    (e) =>
      e.report.normalized.disposition !== 'infrastructure-failed' &&
      e.report.normalized.surfaces.every(
        (s) =>
          !['failure', 'cancelled'].includes(s.result) &&
          s.status !== 'infrastructure-failed',
      ),
  ).length;
  const rate = applicable.length
    ? infrastructureSuccesses / applicable.length
    : null;
  const blockers = [];
  if (!complete)
    blockers.push(
      'Collection is incomplete; missing pages cannot establish eligibility.',
    );
  if (errors.length)
    blockers.push(
      `${errors.length} missing or invalid reports require inspection.`,
    );
  if (measured.length < baseline.observation.requiredRuns)
    blockers.push(
      `${measured.length}/${baseline.observation.requiredRuns} distinct representative PR observations.`,
    );
  if (
    rate === null ||
    rate < baseline.observation.minimumInfrastructureSuccessRate
  )
    blockers.push(
      `Infrastructure success rate ${rate === null ? 'unavailable' : `${(rate * 100).toFixed(1)}%`} is below ${baseline.observation.minimumInfrastructureSuccessRate * 100}%.`,
    );
  if (latencies.length !== successful.length)
    blockers.push('Some measured runs lack valid latency telemetry.');
  if (
    latencyP95Seconds === null ||
    latencyP95Seconds > baseline.observation.latencyBudgetMinutesP95 * 60
  )
    blockers.push(
      'Measured shard p95 latency does not satisfy the observation budget.',
    );
  const branchSamples = measured.filter(
    (e) => e.report.normalized.totals.branches.measured > 0,
  );
  if (branchSamples.length < baseline.observation.requiredRuns)
    blockers.push(
      `${branchSamples.length}/${baseline.observation.requiredRuns} representative PRs have branch measurements.`,
    );
  const minimum = (key) => {
    const values = measured
      .map((e) =>
        key === 'lines'
          ? e.report.normalized.totals.lines.strictPercent
          : e.report.normalized.totals.branches.percent,
      )
      .filter(finite);
    return values.length
      ? Math.max(
          0,
          Math.floor(
            (Math.min(...values) - baseline.roundingMarginPercentagePoints) *
              100,
          ) / 100,
        )
      : null;
  };
  const candidates = { lines: minimum('lines'), branches: minimum('branches') };
  if (Object.values(candidates).some((n) => n === null || n <= 0))
    blockers.push(
      'Observed minima do not support a useful positive line and branch threshold.',
    );
  return {
    version: 1,
    repository,
    since,
    collectedAt,
    complete,
    fetchedReports: unique.size,
    validReports: valid.length,
    applicableRuns: applicable.length,
    measuredRuns: successful.length,
    representativePullRequests: measured.length,
    branchPullRequests: branchSamples.length,
    infrastructureSuccessRate: rate,
    usableReportRate: applicable.length
      ? successful.length / applicable.length
      : null,
    latencyP95Seconds,
    // These legacy reports time test shards, not the entire workflow. A human
    // must verify end-to-end latency and uncovered-line correctness before promotion.
    latencyScope: 'instrumented test shards',
    evidenceEligible: blockers.length === 0,
    blockers,
    candidates,
    errors,
    dispositions: Object.fromEntries(
      [...new Set(valid.map((e) => e.report.normalized.disposition))]
        .sort()
        .map((d) => [
          d,
          valid.filter((e) => e.report.normalized.disposition === d).length,
        ]),
    ),
    observations: measured.map((e) => ({
      pullRequest: e.report.telemetry.pullRequest,
      artifactId: e.artifact.id,
      runId: e.artifact.workflow_run.id,
      baseSha: e.report.normalized.baseSha,
      headSha: e.report.normalized.headSha,
      lines: e.report.normalized.totals.lines.strictPercent,
      branches: e.report.normalized.totals.branches.percent,
      url: `https://github.com/${repository}/actions/runs/${e.artifact.workflow_run.id}`,
    })),
    promotion:
      'Review representative uncovered locations and end-to-end latency, then propose baseline and ruleset changes separately. This report never enables enforcement.',
  };
}

export function formatEvidence(r) {
  return (
    `# Changed-code coverage readiness\n\n${r.evidenceEligible ? 'Numerical evidence eligible for review.' : 'Not eligible for promotion.'}\n\n` +
    `| Metric | Observed |\n| --- | --- |\n| Distinct measured PRs | ${r.representativePullRequests} |\n| PRs measuring branches | ${r.branchPullRequests} |\n| Usable applicable reports | ${r.measuredRuns}/${r.applicableRuns} |\n| Shard p95 latency | ${r.latencyP95Seconds ?? 'unavailable'} seconds |\n| Invalid/missing reports | ${r.errors.length} |\n\n` +
    r.blockers.map((s) => `- ${s}`).join('\n') +
    `\n\n${r.promotion}\n`
  );
}

function command(executable, args, options = {}) {
  return execFileSync(executable, args, {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60000,
    ...options,
  });
}
const execAsync = promisify(execFile);
async function github(endpoint, binary = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { stdout } = await execAsync('gh', ['api', endpoint], {
        encoding: binary ? 'buffer' : 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        timeout: 30000,
      });
      return binary ? stdout : JSON.parse(stdout);
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }
}
const api = (endpoint) => github(endpoint);

export async function collectReports({
  repository,
  since,
  cacheDirectory,
  maxPages = 100,
  readApi = api,
  readReport,
}) {
  const artifacts = [];
  let complete = false;
  for (let page = 1; page <= maxPages; page++) {
    const batch = (
      await readApi(
        `repos/${repository}/actions/artifacts?per_page=100&page=${page}`,
      )
    ).artifacts;
    if (!Array.isArray(batch))
      throw new Error('GitHub artifact inventory is unavailable');
    artifacts.push(
      ...batch.filter((a) => REPORT_NAME.test(a.name) && a.created_at >= since),
    );
    if (batch.length < 100 || batch.at(-1).created_at < since) {
      complete = true;
      break;
    }
  }
  const load =
    readReport ??
    (async (a) => {
      mkdirSync(cacheDirectory, { recursive: true });
      const file = path.join(cacheDirectory, `${a.id}.json`);
      if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
      const zip = path.join(cacheDirectory, `${a.id}.zip`);
      writeFileSync(
        zip,
        await github(`repos/${repository}/actions/artifacts/${a.id}/zip`, true),
      );
      const report = JSON.parse(
        command('unzip', ['-p', zip, 'changed-code-coverage.json'], {
          encoding: 'utf8',
        }),
      );
      writeFileSync(file, JSON.stringify(report));
      return report;
    });
  const entries = new Array(artifacts.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, artifacts.length) }, async () => {
      while (next < artifacts.length) {
        const index = next++;
        const artifact = artifacts[index];
        try {
          entries[index] = { artifact, report: await load(artifact) };
        } catch (error) {
          entries[index] = { artifact, error: String(error.message) };
        }
      }
    }),
  );
  // Artifact-only scans omit runs cancelled before upload. Keep those absences
  // visible instead of inflating the success rate using surviving artifacts.
  const ids = new Set(artifacts.map((a) => String(a.workflow_run?.id)));
  if (new Set(artifacts.map((a) => a.id)).size !== artifacts.length)
    complete = false;
  const seenRuns = new Set();
  for (let page = 1; page <= maxPages; page++) {
    const response = await readApi(
      `repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&created=${encodeURIComponent(`>=${since}`)}&per_page=100&page=${page}`,
    );
    if (!Array.isArray(response.workflow_runs))
      throw new Error('GitHub run inventory is unavailable');
    for (const run of response.workflow_runs) {
      if (seenRuns.has(run.id)) complete = false;
      seenRuns.add(run.id);
      if (run.status === 'completed' && !ids.has(String(run.id)))
        entries.push({
          run,
          error:
            'Completed PR CI run has no normalized coverage report (cancelled, failed, or untrusted; inspect before promotion).',
        });
    }
    if (response.workflow_runs.length < 100) break;
    if (page === maxPages || page === 10) {
      complete = false;
      break;
    }
  }
  return { entries, complete };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (key, fallback) =>
    args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  const repository = get(
    '--repo',
    process.env.GITHUB_REPOSITORY ?? 'genfeedai/genfeed.ai',
  );
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository))
    throw new Error('Invalid repository');
  const since = get(
    '--since',
    new Date(Date.now() - 14 * 86400000).toISOString(),
  );
  if (!Number.isFinite(Date.parse(since)))
    throw new Error('Invalid observation start');
  const input = get('--input');
  const collection = input
    ? JSON.parse(readFileSync(input, 'utf8'))
    : await collectReports({
        repository,
        since,
        cacheDirectory: get('--cache-dir', '.tmp/changed-coverage-evidence'),
      });
  const entries = Array.isArray(collection) ? collection : collection.entries;
  const result = assessObservations(
    entries,
    JSON.parse(readFileSync(BASELINE, 'utf8')),
    {
      repository,
      since,
      complete: !Array.isArray(collection) && collection.complete === true,
      collectedAt: new Date().toISOString(),
    },
  );
  const output = get('--out', 'changed-code-coverage-evidence.json');
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  const summary = formatEvidence(result);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
