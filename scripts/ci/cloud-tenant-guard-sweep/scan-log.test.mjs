import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { scanFinalLog } from './scan-log.mjs';

test('failed API boot reports a skipped sweep without another failing step', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'cloud-tenant-boot-failed-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, 'api.log'),
    'Error: service URL must be configured\n',
  );
  const result = spawnSync(
    process.execPath,
    [new URL('./scan-log.mjs', import.meta.url).pathname],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: directory,
        CLOUD_SWEEP_API_BOOT_OUTCOME: 'failure',
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sweep skipped: API failed to boot/);
  assert.doesNotMatch(result.stdout, /FAIL/);
  const report = JSON.parse(
    readFileSync(join(directory, 'cloud-tenant-guard-report.json'), 'utf8'),
  );
  assert.equal(report.hasFailed, true);
  assert.equal(report.hasSkipped, true);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.requests, []);
});

test('workflow passes the explicit boot outcome and prints 200 log lines on boot failure', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );
  const job = workflow.split('  cloud-tenant-guard:')[1].split('\n  build:')[0];
  assert.match(job, /name: Start real API in CLOUD mode\n\s+id: cloud-api/);
  assert.match(job, /tail -n 200 "\$RUNNER_TEMP\/api.log"\n\s+exit 1/);
  assert.match(
    job,
    /CLOUD_SWEEP_API_BOOT_OUTCOME: \$\{\{ steps\.cloud-api\.outcome \}\}/,
  );
});

test('a swallowed guard error logged after requests finish still fails the final report', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'cloud-tenant-final-log-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'api.log');
  const report = join(directory, 'report.json');
  writeFileSync(
    report,
    JSON.stringify({
      hasFailed: false,
      failures: [],
      durations: { gets: 100, total: 250 },
      warnings: { timeouts: { count: 1, ratio: 0.01 } },
      requests: [
        {
          actor: 'M:A',
          method: 'GET',
          path: '/v1/voices',
          status: 500,
          hasTenantHit: false,
        },
      ],
    }),
  );
  writeFileSync(
    log,
    'API healthy\nGET /v1/voices 500 — Tenant isolation: findMany on Voice is missing organizationId\n',
  );
  assert.equal(scanFinalLog(log, report).hasFailed, true);
  const saved = JSON.parse(readFileSync(report, 'utf8'));
  assert.equal(saved.tenantHitGroups[0].model, 'Voice');
  assert.ok(saved.finalLogScannedAt);
  assert.equal(saved.apiLogHits.length, 1);
  assert.deepEqual(saved.durations, { gets: 100, total: 250 });
  assert.equal(saved.warnings.timeouts.count, 1);
});

test('missing startup or harness evidence cannot pass the final scan', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'cloud-tenant-missing-log-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const report = scanFinalLog(
    join(directory, 'api.log'),
    join(directory, 'report.json'),
  );
  assert.equal(report.hasFailed, true);
  assert.equal(report.failures.length, 2);
});

test('ordinary provider 5xx stays a warning with a clean API log', (context) => {
  const directory = mkdtempSync(
    join(tmpdir(), 'cloud-tenant-provider-warning-'),
  );
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'api.log');
  const report = join(directory, 'report.json');
  writeFileSync(log, 'GET /v1/voices 500 — Provider unavailable\n');
  writeFileSync(
    report,
    JSON.stringify({
      hasFailed: false,
      failures: [],
      requests: [
        {
          actor: 'M:A',
          method: 'GET',
          path: '/v1/voices',
          status: 500,
          hasTenantHit: false,
        },
      ],
    }),
  );
  assert.equal(scanFinalLog(log, report).hasFailed, false);
});
