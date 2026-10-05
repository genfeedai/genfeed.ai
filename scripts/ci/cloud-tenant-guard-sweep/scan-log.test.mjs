import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { scanFinalLog } from './scan-log.mjs';

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
