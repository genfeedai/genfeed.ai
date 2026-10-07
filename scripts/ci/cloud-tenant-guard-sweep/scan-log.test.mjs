import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { writeDiagnosticEvidence } from './diagnostic-output.mjs';
import { zeroMailStats } from './local-mail-stub.mjs';

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
  assert.match(
    result.stdout,
    /Final log scan: failed=true; tenant hit groups=0/,
  );
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
  assert.doesNotMatch(job, /tail -n/);
  assert.match(job, /diagnostic-summary.json/);
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

test('final scan retains S:A known warnings and stale entries without failing', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'cloud-tenant-known-final-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'api.log');
  const reportPath = join(directory, 'report.json');
  const baselinePath = join(directory, 'baseline.json');
  const route = '/v1/agent/threads/{threadId}';
  const entry = { method: 'GET', route, models: ['AgentThread.findFirst'] };
  const stale = {
    method: 'GET',
    route: '/v1/agent/memories/{memoryId}',
    models: ['AgentMemory.findMany'],
  };
  const message =
    'Tenant isolation: findFirst on AgentThread is missing organizationId';
  const strictLog = 'API healthy ✓\n';
  writeFileSync(
    baselinePath,
    JSON.stringify({ issue: 'TBD', entries: [entry, stale] }),
  );
  writeFileSync(log, `${strictLog}${message}\n`);
  writeFileSync(
    reportPath,
    JSON.stringify({
      hasFailed: false,
      failures: [],
      superadminOverrideLogOffset: Buffer.byteLength(strictLog),
      durations: { superadminOverrideGets: 100 },
      phases: { superadminOverrideGets: { requests: 1, timeouts: 0 } },
      requests: [
        {
          actor: 'S:A',
          method: 'GET',
          route,
          path: '/v1/agent/threads/id',
          sweepPhase: 'superadminOverrideGets',
          hasTenantHit: true,
          message,
        },
      ],
    }),
  );
  const report = scanFinalLog(log, reportPath, 'success', baselinePath);
  assert.equal(report.hasFailed, false);
  assert.equal(report.tenantHitGroups.length, 0);
  assert.equal(report.knownHits.length, 2);
  assert.deepEqual(report.staleBaselineEntries, [stale]);
  assert.deepEqual(report.suggestedBaseline, {
    issue: 'TBD',
    entries: [entry],
  });
  assert.deepEqual(report.phases, {
    superadminOverrideGets: { requests: 1, timeouts: 0 },
  });
});

test('final scan fails on strict hits despite baseline and on unknown deferred S:A models', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'cloud-tenant-unknown-final-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'api.log');
  const reportPath = join(directory, 'report.json');
  const baselinePath = join(directory, 'baseline.json');
  const known =
    'Tenant isolation: findFirst on AgentThread is missing organizationId\n';
  writeFileSync(
    baselinePath,
    JSON.stringify({
      issue: 'TBD',
      entries: [
        {
          method: 'GET',
          route: '/v1/agent/threads/{threadId}',
          models: ['AgentThread.findFirst'],
        },
      ],
    }),
  );
  for (const [text, offset] of [
    [`${known}S:A begins\n`, Buffer.byteLength(known)],
    ['Tenant isolation: findMany on AgentMemory\n', 0],
    [known, null],
  ]) {
    writeFileSync(log, text);
    writeFileSync(
      reportPath,
      JSON.stringify({
        hasFailed: false,
        failures: [],
        requests: [],
        superadminOverrideLogOffset: offset,
      }),
    );
    const report = scanFinalLog(log, reportPath, 'success', baselinePath);
    assert.equal(report.hasFailed, true);
    assert.equal(report.tenantHitGroups.length, 1);
    assert.equal(report.knownHits.length, 0);
  }
});

test('final scan fails closed on a missing baseline or a truncated boundary', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'cloud-tenant-boundary-final-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'api.log');
  const reportPath = join(directory, 'report.json');
  writeFileSync(log, 'healthy\n');
  writeFileSync(
    reportPath,
    JSON.stringify({
      hasFailed: false,
      failures: [],
      requests: [],
      superadminOverrideLogOffset: 200,
    }),
  );
  const report = scanFinalLog(
    log,
    reportPath,
    'success',
    join(directory, 'missing-baseline.json'),
  );
  assert.equal(report.hasFailed, true);
  assert.equal(report.failures.length, 2);
});

for (const rejection of [false, true, 'missing']) {
  test(`final CLI verdict follows latest mail evidence (${rejection})`, (context) => {
    const directory = mkdtempSync(join(tmpdir(), 'tenant-final-cli-'));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const reportPath = join(directory, 'report.json');
    const stats = {
      version: 1,
      statusRequests: 3,
      accepted: { A: 2, B: 2, M: 2, M2: 2, S: 2 },
      rejected: {
        authorization: 0,
        path: 0,
        method: 0,
        contentType: 0,
        size: 0,
        json: 0,
        payload: 0,
      },
    };
    const report = {
      sourceSha: 'a'.repeat(40),
      hasFailed: false,
      failures: [],
      requests: [],
      mailStats: stats,
      fixtureProof: {
        verificationRequired: true,
        noUnverifiedSession: true,
        acceptedMail: true,
        verifiedAuthentication: true,
      },
    };
    writeFileSync(reportPath, JSON.stringify(report), { mode: 0o600 });
    const latest = structuredClone(stats);
    latest.statusRequests = 9;
    if (rejection === true) latest.rejected.path = 1;
    if (rejection !== 'missing')
      writeFileSync(
        join(directory, 'mail-stats.json'),
        JSON.stringify(latest),
        { mode: 0o600 },
      );
    writeFileSync(join(directory, 'api.log'), 'API healthy\n');
    const result = spawnSync(
      process.execPath,
      [new URL('./scan-log.mjs', import.meta.url).pathname],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CLOUD_SWEEP_RUN_DIR: directory,
          CLOUD_SWEEP_REPORT: reportPath,
          CLOUD_SWEEP_API_LOG: join(directory, 'api.log'),
          CLOUD_SWEEP_API_BOOT_OUTCOME: 'success',
        },
      },
    );
    assert.equal(result.status, rejection === false ? 0 : 1);
    assert.match(
      result.stdout,
      rejection === false ? /failed=false/ : /failed=true/,
    );
    const saved = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(saved.hasFailed, rejection !== false);
    if (rejection !== 'missing') {
      assert.deepEqual(saved.mailStats, latest);
      assert.deepEqual(
        JSON.parse(
          readFileSync(join(directory, 'diagnostic-summary.json'), 'utf8'),
        ).mail,
        latest,
      );
    } else
      assert.deepEqual(saved.failures, [
        'Final diagnostic evidence unavailable',
      ]);
  });
}

function setupScanner(context, proof) {
  const directory = mkdtempSync(join(tmpdir(), 'tenant-partial-scan-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const reportPath = join(directory, 'report.json');
  const log = join(directory, 'api.log');
  const summaryPath = join(directory, 'diagnostic-summary.json');
  const stats = zeroMailStats();
  writeFileSync(join(directory, 'mail-stats.json'), JSON.stringify(stats), {
    mode: 0o600,
  });
  writeFileSync(log, 'API ready\n', { mode: 0o600 });
  const report = {
    sourceSha: 'a'.repeat(40),
    hasFailed: true,
    failures: ['Existing failure'],
    fixtureProof: proof,
    mailStats: stats,
    inventoryTemplates: [],
    requests: [],
    apiLogHits: [],
  };
  const save = () =>
    writeFileSync(reportPath, JSON.stringify(report), { mode: 0o600 });
  save();
  const scan = () =>
    spawnSync(
      process.execPath,
      [new URL('./scan-log.mjs', import.meta.url).pathname],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CLOUD_SWEEP_API_LOG: log,
          CLOUD_SWEEP_REPORT: reportPath,
          CLOUD_SWEEP_RUN_DIR: directory,
          CLOUD_SWEEP_DIAGNOSTICS: '0',
          CLOUD_SWEEP_CPU_PROFILE: '0',
          CLOUD_SWEEP_API_BOOT_OUTCOME: 'success',
        },
      },
    );
  return { directory, reportPath, summaryPath, report, save, scan };
}
for (const proof of [undefined, null, {}, { acceptedMail: true }])
  test(`real scanner twice preserves unavailable private proof ${JSON.stringify(proof)}`, (context) => {
    const f = setupScanner(context, proof);
    writeDiagnosticEvidence(f.report, proof, f.directory, f.reportPath);
    for (let i = 0; i < 2; i++) {
      const result = f.scan();
      assert.equal(result.status, 1, result.stderr);
      const summary = JSON.parse(readFileSync(f.summaryPath, 'utf8'));
      const saved = JSON.parse(readFileSync(f.reportPath, 'utf8'));
      assert.equal(summary.fixtureProofAvailable, false);
      assert.deepEqual(Object.values(summary.fixtureProof), [
        false,
        false,
        false,
        false,
      ]);
      assert.deepEqual(saved.fixtureProof, proof);
      assert.equal(
        saved.failures.filter((x) => x === 'Fixture setup proof unavailable')
          .length,
        1,
      );
      assert.equal(
        saved.failures.includes('Fixture setup proof incomplete'),
        false,
      );
      assert.ok(saved.failures.includes('Existing failure'));
    }
  });
for (const availability of [undefined, true, false, null, 'true', 0])
  test(`real scanner historical availability ${String(availability)}`, (context) => {
    const f = setupScanner(context, null);
    const old = {
      fixtureProof: {
        verificationRequired: true,
        noUnverifiedSession: true,
        acceptedMail: true,
        verifiedAuthentication: true,
      },
    };
    if (availability !== undefined) old.fixtureProofAvailable = availability;
    writeFileSync(f.summaryPath, JSON.stringify(old), { mode: 0o600 });
    const result = f.scan();
    assert.equal(result.status, 1);
    const summary = JSON.parse(readFileSync(f.summaryPath, 'utf8'));
    const recovered = availability === undefined || availability === true;
    assert.equal(summary.fixtureProofAvailable, recovered);
    const report = JSON.parse(readFileSync(f.reportPath, 'utf8'));
    assert.equal(
      report.failures.includes('Fixture setup proof unavailable'),
      !recovered,
    );
    assert.ok(report.failures.includes('Existing failure'));
  });
for (const proof of [false, 0, '', [], { acceptedMail: 'true' }])
  test(`real scanner cannot recover malformed private proof ${JSON.stringify(proof)}`, (context) => {
    const f = setupScanner(context, proof);
    writeFileSync(
      f.summaryPath,
      JSON.stringify({
        fixtureProof: {
          verificationRequired: true,
          noUnverifiedSession: true,
          acceptedMail: true,
          verifiedAuthentication: true,
        },
      }),
      { mode: 0o600 },
    );
    assert.equal(f.scan().status, 1);
    assert.throws(() => readFileSync(f.summaryPath));
    assert.deepEqual(
      JSON.parse(readFileSync(f.reportPath, 'utf8')).fixtureProof,
      proof,
    );
  });
test('real scanner rejects malformed recovered historical proof', (context) => {
  const f = setupScanner(context, null);
  writeFileSync(
    f.summaryPath,
    JSON.stringify({ fixtureProof: { acceptedMail: 'true' } }),
    { mode: 0o600 },
  );
  assert.equal(f.scan().status, 1);
  assert.throws(() => readFileSync(f.summaryPath));
});

test('actual final scanner conserves canonical response and uncorrelated duplicated log hits', (context) => {
  const proof = {
    verificationRequired: true,
    noUnverifiedSession: true,
    acceptedMail: true,
    verifiedAuthentication: true,
  };
  const f = setupScanner(context, proof);
  const canary = 'SECRET-cookie-token-SQL';
  f.report.inventoryTemplates = ['/v1/posts'];
  f.report.requests = [
    {
      actor: 'S:A',
      phase: 'get',
      sweepPhase: 'superadminOverrideGets',
      method: 'GET',
      route: '/v1/posts',
      status: 500,
      hasTenantHit: true,
      message: `Tenant isolation: findMany on Post used organizationId ${canary} but the request tenant is ${canary}`,
    },
  ];
  const line = `Tenant isolation: findMany on Post is missing organizationId in CLOUD mode. ${canary}\n`;
  writeFileSync(join(f.directory, 'api.log'), line + line, { mode: 0o600 });
  f.save();
  const result = f.scan();
  assert.equal(result.status, 1, result.stderr);
  const summary = JSON.parse(readFileSync(f.summaryPath, 'utf8'));
  assert.equal(summary.fixtureProofAvailable, true);
  assert.equal(summary.tenantEvidence.responseHits, 1);
  assert.equal(summary.tenantEvidence.logHits, 2);
  assert.equal(summary.tenantEvidence.responseGroups[0].route, '/v1/posts');
  assert.equal(summary.tenantEvidence.responseGroups[0].actor, 'S:A');
  assert.equal(summary.tenantEvidence.logGroups[0].count, 2);
  assert.equal(summary.tenantEvidence.logGroups[0].route, 'unknown');
  assert.ok(summary.failureEvidence.groups.some((x) => x.label === 'unknown'));
  assert.doesNotMatch(JSON.stringify(summary), /SECRET|cookie|token-SQL/);
  assert.doesNotMatch(result.stdout, /SECRET|organizationId|findMany/);
});
test('actual final scanner keeps complete proof and healthy no-hit report passing', (context) => {
  const f = setupScanner(context, {
    verificationRequired: true,
    noUnverifiedSession: true,
    acceptedMail: true,
    verifiedAuthentication: true,
  });
  f.report.hasFailed = false;
  f.report.failures = [];
  f.save();
  const result = f.scan();
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(readFileSync(f.summaryPath, 'utf8'));
  assert.equal(summary.fixtureProofAvailable, true);
  assert.equal(summary.tenantEvidence.responseHits, 0);
  assert.equal(summary.tenantEvidence.logHits, 0);
  assert.equal(summary.failureEvidence.total, 0);
});
