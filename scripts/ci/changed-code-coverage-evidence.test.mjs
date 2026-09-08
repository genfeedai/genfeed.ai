import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assessObservations,
  collectReports,
  validateObservation,
} from './changed-code-coverage-evidence.mjs';

const baseline = JSON.parse(
  readFileSync(
    new URL('./changed-code-coverage.baseline.json', import.meta.url),
  ),
);
const repository = 'genfeedai/genfeed.ai';
const options = { repository, complete: true };
function entry(pr = 1, changes = {}) {
  return {
    artifact: {
      id: pr,
      name: `changed-code-coverage-${pr}-1`,
      expired: false,
      created_at: '2026-09-08T10:00:00Z',
      workflow_run: { id: pr + 100 },
    },
    report: {
      version: 2,
      normalized: {
        baseSha: 'a'.repeat(40),
        headSha: 'b'.repeat(40),
        mode: 'observation',
        disposition: 'observation-only',
        changedFileCount: 1,
        surfaces: [
          { name: 'app', result: 'success', status: 'reported' },
          { name: 'api', result: 'skipped', status: 'not-applicable' },
        ],
        totals: {
          lines: {
            measured: 10,
            covered: 8,
            uncovered: 2,
            unmeasured: 0,
            percent: 80,
            strictPercent: 80,
          },
          branches: { measured: 10, covered: 8, uncovered: 2, percent: 80 },
        },
        ...changes,
      },
      telemetry: {
        repository,
        pullRequest: pr,
        runId: String(pr + 100),
        runAttempt: '1',
        latencySeconds: 120,
      },
    },
  };
}
const twenty = () => Array.from({ length: 20 }, (_, i) => entry(i + 1));
test('twenty representative measured PRs produce conservative candidates, never promotion', () => {
  const r = assessObservations(twenty(), baseline, options);
  assert.equal(r.evidenceEligible, true);
  assert.equal(r.representativePullRequests, 20);
  assert.deepEqual(r.candidates, { lines: 79.5, branches: 79.5 });
  assert.match(r.promotion, /never enables enforcement/);
});
test('reruns and duplicate artifact listings cannot manufacture twenty PRs', () => {
  const runs = twenty().map((e) => {
    e.report.telemetry.pullRequest = 1;
    e.artifact.name = 'changed-code-coverage-1-1';
    return e;
  });
  const r = assessObservations([...runs, ...runs], baseline, options);
  assert.equal(r.fetchedReports, 20);
  assert.equal(r.representativePullRequests, 1);
  assert.equal(r.evidenceEligible, false);
});
test('latest failed PR head cannot borrow an older successful observation', () => {
  const rows = twenty();
  const failed = entry(1, { disposition: 'infrastructure-failed' });
  failed.artifact.id = 99;
  failed.artifact.created_at = '2026-09-08T11:00:00Z';
  rows.push(failed);
  assert.equal(
    assessObservations(rows, baseline, options).representativePullRequests,
    19,
  );
});
test('unmeasured and missing reports do not inflate the usable rate', () => {
  const rows = twenty();
  const empty = entry(21, { disposition: 'unmeasured' });
  empty.report.normalized.totals.lines = {
    measured: 0,
    covered: 0,
    uncovered: 0,
    unmeasured: 10,
    percent: null,
    strictPercent: 0,
  };
  rows.push(empty, { run: { id: 999 }, error: 'missing report' });
  const r = assessObservations(rows, baseline, options);
  assert.equal(r.measuredRuns, 20);
  assert.equal(r.applicableRuns, 21);
  assert.equal(r.errors.length, 1);
  assert.equal(r.evidenceEligible, false);
});
test('rejects identity mismatch, malformed percentages, empty observations and old report versions', () => {
  for (const corrupt of [
    (e) => (e.report.telemetry.repository = 'other/repo'),
    (e) => (e.report.telemetry.runId = '999'),
    (e) => (e.report.normalized.totals.lines.percent = 100),
    (e) => (e.report.normalized.headSha = 'master'),
    (e) => (e.report.version = 1),
    (e) => (e.artifact.expired = true),
  ]) {
    const e = entry();
    corrupt(e);
    assert.ok(validateObservation(e, repository, 2));
  }
});
test('missing timing and epoch timing cannot establish p95 eligibility', () => {
  for (const latency of [null, -1, 1788299408]) {
    const rows = twenty();
    rows[0].report.telemetry.latencySeconds = latency;
    assert.equal(
      assessObservations(rows, baseline, options).evidenceEligible,
      false,
    );
  }
});
test('uses nearest-rank p95 and strict line coverage, not measured-only percentages', () => {
  const rows = twenty();
  rows[19].report.telemetry.latencySeconds = 2000;
  rows[0].report.normalized.totals.lines.unmeasured = 10;
  rows[0].report.normalized.totals.lines.strictPercent = 40;
  const r = assessObservations(rows, baseline, options);
  assert.equal(r.latencyP95Seconds, 120);
  assert.equal(r.candidates.lines, 39.5);
});
test('an incomplete or empty collection never qualifies', () => {
  assert.equal(
    assessObservations(twenty(), baseline, { ...options, complete: false })
      .evidenceEligible,
    false,
  );
  assert.equal(
    assessObservations([], baseline, options).evidenceEligible,
    false,
  );
});
test('collector pages inventory and records runs whose artifact never arrived', async () => {
  let artifactPages = 0;
  const e = entry();
  const r = await collectReports({
    repository,
    since: '2026-09-01',
    maxPages: 3,
    readApi: async (endpoint) => {
      if (endpoint.includes('/artifacts?')) {
        artifactPages++;
        return {
          artifacts:
            artifactPages === 1
              ? Array.from({ length: 100 }, (_, i) => ({
                  id: i + 1000,
                  name: 'blob',
                  created_at: '2026-09-08',
                }))
              : [e.artifact],
        };
      }
      return {
        workflow_runs: [
          { id: 101, status: 'completed' },
          { id: 999, status: 'completed' },
          { id: 998, status: 'in_progress' },
        ],
      };
    },
    readReport: async () => e.report,
  });
  assert.equal(artifactPages, 2);
  assert.equal(r.complete, true);
  assert.equal(r.entries.length, 2);
  assert.equal(r.entries[1].run.id, 999);
});
test('collector page limit and expired/unreadable reports remain visible', async () => {
  const e = entry();
  const r = await collectReports({
    repository,
    since: '2026-09-01',
    maxPages: 1,
    readApi: async (endpoint) =>
      endpoint.includes('/artifacts?')
        ? { artifacts: Array(100).fill(e.artifact) }
        : { workflow_runs: [] },
    readReport: async () => {
      throw new Error('expired');
    },
  });
  assert.equal(r.complete, false);
  assert.equal(r.entries[0].error, 'expired');
});

test('healthy unmeasured runs are evidence gaps, not infrastructure failures', () => {
  const empty = entry(21, { disposition: 'unmeasured' });
  empty.report.normalized.totals.lines = {
    measured: 0,
    covered: 0,
    uncovered: 0,
    unmeasured: 10,
    percent: null,
    strictPercent: 0,
  };
  const r = assessObservations([...twenty(), empty], baseline, options);
  assert.equal(r.infrastructureSuccessRate, 1);
  assert.equal(r.usableReportRate, 20 / 21);
});
