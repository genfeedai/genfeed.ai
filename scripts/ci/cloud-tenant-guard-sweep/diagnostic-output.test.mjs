import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { writeDiagnosticEvidence } from './diagnostic-output.mjs';
import { MAIL_REASONS, zeroMailStats } from './local-mail-stub.mjs';

const refusal = 'Restricted transport recorded rejected requests';
const unavailable = 'Final diagnostic evidence unavailable';
function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'tenant-output-'));
  chmodSync(directory, 0o700);
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const reportPath = join(directory, 'report.json');
  const summaryPath = join(directory, 'diagnostic-summary.json');
  const mailPath = join(directory, 'mail-stats.json');
  const proof = {
    verificationRequired: true,
    noUnverifiedSession: true,
    acceptedMail: true,
    verifiedAuthentication: true,
  };
  const report = {
    sourceSha: 'a'.repeat(40),
    hasFailed: false,
    failures: [],
    fixtureProof: proof,
    mailStats: zeroMailStats(),
    inventoryTemplates: ['/v1/voices'],
    inventory: {
      memberAGets: {
        'M:A': { discovered: 1, enqueued: 1, started: 1, completed: 1 },
      },
    },
    requests: [],
    apiLogHits: [],
    unrelatedPrivateField: 'preserved',
  };
  const latest = zeroMailStats();
  latest.statusRequests = 3;
  for (const actor of Object.keys(latest.accepted)) latest.accepted[actor] = 2;
  const save = () =>
    writeFileSync(mailPath, JSON.stringify(latest), { mode: 0o600 });
  save();
  return {
    directory,
    reportPath,
    summaryPath,
    mailPath,
    proof,
    report,
    latest,
    save,
    write: () => writeDiagnosticEvidence(report, proof, directory, reportPath),
    saved: () => JSON.parse(readFileSync(reportPath, 'utf8')),
    summary: () => JSON.parse(readFileSync(summaryPath, 'utf8')),
  };
}
for (const reason of MAIL_REASONS) {
  test(`final ${reason} refusal fails otherwise clean evidence exactly once`, (context) => {
    const f = fixture(context);
    f.latest.rejected[reason] = 1;
    f.latest.rejectedRequests = [
      {
        method: 'POST',
        route: 'emailDeliveries',
        authorization: 'matched',
        reason,
        count: 1,
      },
    ];
    f.save();
    f.write();
    f.write();
    assert.equal(f.saved().hasFailed, true);
    assert.deepEqual(f.saved().failures, [refusal]);
    assert.deepEqual(f.saved().mailStats, f.latest);
    assert.deepEqual(f.summary().mail, f.latest);
    assert.deepEqual(f.summary().fixtureProof, f.proof);
    assert.equal(f.saved().unrelatedPrivateField, 'preserved');
    assert.equal(f.summary().phases.memberAGets.coverage['M:A'].completed, 1);
  });
}
test('success remains clean and later finalization persists increasing counters in both files', (context) => {
  const f = fixture(context);
  f.write();
  assert.equal(f.saved().hasFailed, false);
  f.latest.statusRequests = 9;
  f.latest.rejected.path = 1;
  f.latest.rejectedRequests = [
    {
      method: 'GET',
      route: 'systemNotifications',
      authorization: 'matched',
      reason: 'path',
      count: 1,
    },
  ];
  f.report.hasFailed = true;
  f.report.failures.push('Existing failure');
  f.report.apiLogHits.push({ message: 'private evidence' });
  f.save();
  f.write();
  assert.deepEqual(f.saved().mailStats, f.summary().mail);
  assert.deepEqual(f.saved().failures, ['Existing failure', refusal]);
  assert.equal(f.summary().tenantHits.finalLog, 1);
  assert.equal(
    readFileSync(f.summaryPath, 'utf8').includes('private evidence'),
    false,
  );
});
for (const kind of [
  'absent',
  'corrupt',
  'regressed',
  'symlink',
  'wrong-mode',
  'unsafe-proof',
  'unsafe-summary',
]) {
  test(`${kind} evidence fails closed and removes stale summary`, (context) => {
    const f = fixture(context);
    f.write();
    if (kind === 'absent') rmSync(f.mailPath);
    if (kind === 'corrupt') writeFileSync(f.mailPath, '{');
    if (kind === 'regressed') {
      f.latest.statusRequests = 0;
      f.save();
    }
    if (kind === 'symlink') {
      rmSync(f.mailPath);
      symlinkSync(f.reportPath, f.mailPath);
    }
    if (kind === 'wrong-mode') chmodSync(f.mailPath, 0o644);
    if (kind === 'unsafe-proof') f.proof.acceptedMail = 'not-a-boolean';
    if (kind === 'unsafe-summary') {
      rmSync(f.summaryPath);
      symlinkSync(f.mailPath, f.summaryPath);
    }
    assert.throws(f.write, { message: unavailable });
    assert.equal(f.saved().hasFailed, true);
    assert.equal(
      f.saved().failures.filter((value) => value === unavailable).length,
      1,
    );
    assert.equal(existsSync(f.summaryPath), false);
  });
}
test('summary schema failure preserves failed private evidence without stale success', (context) => {
  const f = fixture(context);
  f.write();
  f.report.sourceSha = 'invalid';
  assert.throws(f.write, { message: unavailable });
  assert.equal(f.saved().hasFailed, true);
  assert.equal(existsSync(f.summaryPath), false);
});
test('unowned directory remains untouched', (context) => {
  const f = fixture(context);
  f.write();
  const prior = readFileSync(f.summaryPath, 'utf8');
  chmodSync(f.directory, 0o755);
  assert.throws(f.write);
  assert.equal(readFileSync(f.summaryPath, 'utf8'), prior);
});

test('historical final mail statistics keep attribution unavailable without exempting refusals', (context) => {
  const f = fixture(context);
  delete f.report.mailStats.rejectedRequests;
  delete f.report.mailStats.probeRequests;
  delete f.latest.rejectedRequests;
  delete f.latest.probeRequests;
  f.latest.rejected.path = 1;
  f.save();
  f.write();
  assert.equal(f.summary().mailAttributionAvailable, false);
  assert.equal(f.saved().hasFailed, true);
  assert.deepEqual(f.saved().failures, [refusal]);
});
for (const kind of [
  'lost-attribution',
  'invalid-attribution',
  'regressed-attribution',
]) {
  test(`${kind} finalization fails closed and removes stale success`, (context) => {
    const f = fixture(context);
    f.latest.rejected.path = 1;
    f.latest.rejectedRequests = [
      {
        method: 'GET',
        route: 'health',
        authorization: 'matched',
        reason: 'path',
        count: 1,
      },
    ];
    f.save();
    f.write();
    if (kind === 'lost-attribution') delete f.latest.rejectedRequests;
    if (kind === 'invalid-attribution')
      f.latest.rejectedRequests[0].route = 'private-path';
    if (kind === 'regressed-attribution')
      f.latest.rejectedRequests[0].route = 'other';
    f.save();
    assert.throws(f.write, { message: unavailable });
    assert.equal(existsSync(f.summaryPath), false);
  });
}

test('latest valid probes survive both files and genuine refusal remains fatal', (context) => {
  const f = fixture(context);
  f.latest.probeRequests = { health: 3, systemNotificationsUnavailable: 1 };
  f.save();
  f.write();
  assert.equal(f.saved().hasFailed, false);
  assert.deepEqual(
    f.saved().mailStats.probeRequests,
    f.summary().mail.probeRequests,
  );
  f.latest.probeRequests = { health: 4, systemNotificationsUnavailable: 2 };
  f.latest.rejected.path = 1;
  f.latest.rejectedRequests = [
    {
      method: 'GET',
      route: 'other',
      authorization: 'matched',
      reason: 'path',
      count: 1,
    },
  ];
  f.save();
  f.write();
  assert.equal(f.saved().hasFailed, true);
  assert.deepEqual(f.saved().failures, [refusal]);
  assert.deepEqual(f.summary().mail.probeRequests, {
    health: 4,
    systemNotificationsUnavailable: 2,
  });
  assert.deepEqual(f.saved().mailStats, f.summary().mail);
});
for (const kind of ['missing', 'malformed', 'regressed']) {
  test(`${kind} final probe evidence fails closed and removes stale summary`, (context) => {
    const f = fixture(context);
    f.latest.probeRequests = { health: 3, systemNotificationsUnavailable: 1 };
    f.save();
    f.write();
    if (kind === 'missing') delete f.latest.probeRequests;
    if (kind === 'malformed') f.latest.probeRequests.private = 'private-token';
    if (kind === 'regressed') f.latest.probeRequests.health = 2;
    f.save();
    assert.throws(f.write, { message: unavailable });
    assert.equal(existsSync(f.summaryPath), false);
    assert.equal(f.saved().hasFailed, true);
  });
}

test('required final observer failure retains safe incomplete reasons and sticky acceptance failure', (context) => {
  const previous = Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
  Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', '1');
  context.after(() => {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
    else Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', previous);
  });
  const f = fixture(context);
  f.write();
  assert.equal(f.summary().causalEvidence.quality, 'incomplete');
  f.report.finalLogScannedAt = new Date().toISOString();
  f.write();
  assert.equal(f.saved().hasFailed, true);
  assert.ok(
    f.saved().failures.includes('Causal diagnostic evidence unavailable'),
  );
  assert.equal(f.summary().causalEvidence.reasons.invalidSchema, 1);
  assert.equal(
    JSON.stringify(f.summary()).includes('causalObservation'),
    false,
  );
});

test('finalization refreshes partial owned observations into complete stopped evidence', (context) => {
  const previous = Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
  Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', '1');
  context.after(() => {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
    else Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', previous);
  });
  const f = fixture(context);
  const at = Date.now();
  const header = {
    kind: 'header',
    protocol: 1,
    startedAt: at,
    tenantFailuresVersion: 1,
  };
  const file = join(f.directory, 'api-observations.ndjson');
  writeIsolatedFixture(file, `${JSON.stringify(header)}\n`, { mode: 0o600 });
  f.write();
  assert.equal(f.summary().causalEvidence.quality, 'partial');
  assert.equal(f.saved().hasFailed, false);
  const footer = {
    kind: 'footer',
    endedAt: at + 1,
    unavailable: false,
    records: 1,
    ingress: 0,
    pipelineEntries: 0,
    finishes: 0,
    closes: 0,
    invalidSequences: 0,
    duplicateSequences: 0,
    runtimeSamples: 0,
    databaseSamples: 0,
    databaseIncomplete: 0,
    tenantFailures: 0,
  };
  writeIsolatedFixture(
    file,
    `${JSON.stringify(header)}\n${JSON.stringify(footer)}\n`,
  );
  writeFileSync(join(f.directory, 'api-stopped'), 'stopped\n', { mode: 0o600 });
  f.report.finalLogScannedAt = new Date().toISOString();
  f.write();
  assert.equal(f.summary().causalEvidence.quality, 'complete');
  assert.deepEqual(f.saved().causalEvidence, f.summary().causalEvidence);
  assert.equal(f.saved().hasFailed, false);
  assert.equal(Object.hasOwn(f.summary(), 'causalObservation'), false);
});

for (const scenario of [
  'complete',
  'missing lifecycle',
  'mail refusal',
  'existing failure',
]) {
  test(`CPU off retains ${scenario} acceptance semantics without capture files`, (context) => {
    const previous = new Map(
      ['CLOUD_SWEEP_DIAGNOSTICS', 'CLOUD_SWEEP_CPU_PROFILE'].map((key) => [
        key,
        Reflect.get(process.env, key),
      ]),
    );
    Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', '1');
    Reflect.set(process.env, 'CLOUD_SWEEP_CPU_PROFILE', '0');
    context.after(() => {
      for (const [key, value] of previous) {
        if (value === undefined) Reflect.deleteProperty(process.env, key);
        else Reflect.set(process.env, key, value);
      }
    });
    const f = fixture(context);
    const at = Date.now();
    const header = {
      kind: 'header',
      protocol: 1,
      startedAt: at,
      tenantFailuresVersion: 1,
    };
    const footer = {
      kind: 'footer',
      endedAt: at + 1,
      unavailable: false,
      records: 1,
      ingress: 0,
      pipelineEntries: 0,
      finishes: 0,
      closes: 0,
      invalidSequences: 0,
      duplicateSequences: 0,
      runtimeSamples: 0,
      databaseSamples: 0,
      databaseIncomplete: 0,
      tenantFailures: 0,
    };
    writeIsolatedFixture(
      join(f.directory, 'api-observations.ndjson'),
      `${JSON.stringify(header)}\n${scenario === 'missing lifecycle' ? '' : `${JSON.stringify(footer)}\n`}`,
      { mode: 0o600 },
    );
    if (scenario !== 'missing lifecycle')
      writeFileSync(join(f.directory, 'api-stopped'), 'stopped\n', {
        mode: 0o600,
      });
    if (scenario === 'mail refusal') {
      f.latest.rejected.path = 1;
      f.latest.rejectedRequests = [
        {
          method: 'POST',
          route: 'emailDeliveries',
          authorization: 'matched',
          reason: 'path',
          count: 1,
        },
      ];
      f.save();
    }
    if (scenario === 'existing failure') {
      f.report.hasFailed = true;
      f.report.failures.push('Existing failure');
    }
    f.report.finalLogScannedAt = new Date().toISOString();
    f.write();
    f.write();
    assert.equal(Object.hasOwn(f.summary(), 'cpuProfileEvidence'), false);
    assert.equal(Object.hasOwn(f.saved(), 'cpuProfileEvidence'), false);
    assert.equal(
      f.saved().failures.some((failure) => /CPU/.test(failure)),
      false,
    );
    assert.equal(f.saved().hasFailed, scenario !== 'complete');
    assert.equal(
      f.summary().causalEvidence.quality,
      scenario === 'missing lifecycle' ? 'incomplete' : 'complete',
    );
    if (scenario === 'missing lifecycle')
      assert.ok(
        f.saved().failures.includes('Causal diagnostic evidence unavailable'),
      );
    if (scenario === 'mail refusal')
      assert.deepEqual(f.saved().failures, [refusal]);
    if (scenario === 'existing failure')
      assert.deepEqual(f.saved().failures, ['Existing failure']);
    for (const filename of [
      'cpu-profile-trigger.json',
      'cpu-profile.raw.json',
      'cpu-profile-seal.json',
    ])
      assert.equal(existsSync(join(f.directory, filename)), false);
  });
}

test('final unavailable CPU capture turns initially clean acceptance red without deleting the safe summary', async (context) => {
  const f = fixture(context);
  const previous = Reflect.get(process.env, 'CLOUD_SWEEP_CPU_PROFILE');
  Reflect.set(process.env, 'CLOUD_SWEEP_CPU_PROFILE', '1');
  context.after(() => {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, 'CLOUD_SWEEP_CPU_PROFILE');
    else Reflect.set(process.env, 'CLOUD_SWEEP_CPU_PROFILE', previous);
  });
  assert.equal(f.report.hasFailed, false);
  assert.equal(f.write().cpuProfileEvidence.quality, 'partial');
  assert.equal(f.report.hasFailed, false);
  f.report.finalLogScannedAt = 1;
  const summary = f.write();
  assert.equal(summary.cpuProfileEvidence.quality, 'incomplete');
  assert.equal(summary.cpuProfileEvidence.reasons.triggerMissing, 1);
  assert.equal(f.report.hasFailed, true);
  assert.ok(
    f.report.failures.includes('CPU profile diagnostic evidence unavailable'),
  );
  assert.ok(existsSync(f.summaryPath));
});

test('early sealed CPU profile survives missing API footer and stopped marker while acceptance stays false', async (context) => {
  const f = fixture(context);
  const { atomicCpuFile, digestCpu, writeCpuTrigger } = await import(
    './cpu-profile-core.mjs'
  );
  const previousCpu = Reflect.get(process.env, 'CLOUD_SWEEP_CPU_PROFILE'),
    previousCausal = Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
  Reflect.set(process.env, 'CLOUD_SWEEP_CPU_PROFILE', '1');
  Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', '1');
  context.after(() => {
    for (const [key, value] of [
      ['CLOUD_SWEEP_CPU_PROFILE', previousCpu],
      ['CLOUD_SWEEP_DIAGNOSTICS', previousCausal],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  writeCpuTrigger(f.directory, 1);
  const profile = {
    nodes: [
      {
        id: 1,
        callFrame: {
          functionName: 'SECRET_FUNCTION',
          scriptId: 'BUSINESS_ID',
          url: '',
          lineNumber: -1,
          columnNumber: -1,
        },
      },
    ],
    startTime: 0,
    endTime: 100,
    samples: [1],
    timeDeltas: [90],
  };
  const raw = Buffer.from(JSON.stringify(profile));
  atomicCpuFile(f.directory, 'cpu-profile.raw.json', raw);
  atomicCpuFile(
    f.directory,
    'cpu-profile-seal.json',
    Buffer.from(
      JSON.stringify({
        version: 1,
        state: 'complete',
        reason: null,
        triggerAt: 1,
        startedAt: 1,
        stoppedAt: 2,
        sealedAt: 3,
        plannedDurationMs: 90000,
        samplingIntervalUs: 2000,
        actualDurationUs: 100,
        sampleCount: 1,
        nodeCount: 1,
        rawBytes: raw.length,
        rawSha256: digestCpu(raw),
      }),
    ),
  );
  f.report.finalLogScannedAt = 1;
  const summary = f.write();
  assert.equal(summary.cpuProfileEvidence.quality, 'complete');
  assert.equal(summary.causalEvidence.quality, 'incomplete');
  assert.equal(f.report.hasFailed, true);
  assert.ok(
    f.report.failures.includes('Causal diagnostic evidence unavailable'),
  );
  assert.ok(
    !f.report.failures.includes('CPU profile diagnostic evidence unavailable'),
  );
  for (const sentinel of [
    'SECRET_FUNCTION',
    'BUSINESS_ID',
    'cpu-profile.raw.json',
    'startTime',
  ])
    assert.ok(!JSON.stringify(summary).includes(sentinel));
});

test('safe partial fixture proof retains failed diagnostic artifact on repeated finalization', (context) => {
  const f = fixture(context);
  for (const key of Object.keys(f.proof)) delete f.proof[key];
  f.proof.verificationRequired = true;
  f.write();
  f.write();
  assert.equal(f.saved().hasFailed, true);
  assert.deepEqual(f.saved().fixtureProof, { verificationRequired: true });
  assert.equal(f.summary().fixtureProofAvailable, false);
  assert.deepEqual(Object.values(f.summary().fixtureProof), [
    false,
    false,
    false,
    false,
  ]);
  assert.equal(
    f.saved().failures.filter((x) => x === 'Fixture setup proof unavailable')
      .length,
    1,
  );
});

for (const proof of [
  undefined,
  null,
  {},
  { acceptedMail: true },
  {
    verificationRequired: true,
    noUnverifiedSession: true,
    acceptedMail: false,
    verifiedAuthentication: true,
  },
])
  test(`fixture proof availability retains safe failure ${JSON.stringify(proof)}`, (context) => {
    const f = fixture(context);
    f.report.fixtureProof = proof;
    f.report.failures.push('Existing failure');
    const write = () =>
      writeDiagnosticEvidence(f.report, proof, f.directory, f.reportPath);
    write();
    write();
    const available =
      proof !== null && proof !== undefined && Object.keys(proof).length === 4;
    assert.equal(f.summary().fixtureProofAvailable, available);
    assert.equal(f.saved().hasFailed, true);
    assert.deepEqual(f.saved().fixtureProof, proof);
    assert.ok(f.saved().failures.includes('Existing failure'));
    assert.equal(
      f
        .saved()
        .failures.filter(
          (x) =>
            x ===
            (available
              ? 'Fixture setup proof incomplete'
              : 'Fixture setup proof unavailable'),
        ).length,
      1,
    );
    if (!available)
      assert.deepEqual(Object.values(f.summary().fixtureProof), [
        false,
        false,
        false,
        false,
      ]);
  });
for (const missing of ['none', 'footer', 'stopped', 'mail refusal'])
  test(`partial setup retains fatal final lifecycle artifact ${missing}`, (context) => {
    const previous = new Map(
      ['CLOUD_SWEEP_DIAGNOSTICS', 'CLOUD_SWEEP_CPU_PROFILE'].map((key) => [
        key,
        process.env[key],
      ]),
    );
    Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', '1');
    process.env.CLOUD_SWEEP_CPU_PROFILE = '0';
    context.after(() => {
      for (const [key, value] of previous)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    });
    const f = fixture(context);
    for (const key of Object.keys(f.proof)) delete f.proof[key];
    const at = Date.now();
    const header = {
      kind: 'header',
      protocol: 1,
      startedAt: at,
      tenantFailuresVersion: 1,
    };
    const footer = {
      kind: 'footer',
      endedAt: at + 1,
      unavailable: false,
      records: 1,
      ingress: 0,
      pipelineEntries: 0,
      finishes: 0,
      closes: 0,
      invalidSequences: 0,
      duplicateSequences: 0,
      runtimeSamples: 0,
      databaseSamples: 0,
      databaseIncomplete: 0,
      tenantFailures: 0,
    };
    writeIsolatedFixture(
      join(f.directory, 'api-observations.ndjson'),
      `${JSON.stringify(header)}\n${missing === 'footer' ? '' : `${JSON.stringify(footer)}\n`}`,
      { mode: 0o600 },
    );
    if (missing !== 'stopped')
      writeFileSync(join(f.directory, 'api-stopped'), 'stopped\n', {
        mode: 0o600,
      });
    if (missing === 'mail refusal') {
      f.latest.rejected.path = 1;
      f.latest.rejectedRequests = [
        {
          method: 'POST',
          route: 'emailDeliveries',
          authorization: 'matched',
          reason: 'path',
          count: 1,
        },
      ];
      f.save();
    }
    f.report.finalLogScannedAt = new Date().toISOString();
    f.write();
    f.write();
    assert.equal(f.saved().hasFailed, true);
    assert.equal(f.summary().fixtureProofAvailable, false);
    assert.equal(
      f.summary().causalEvidence.quality,
      ['footer', 'stopped'].includes(missing) ? 'incomplete' : 'complete',
    );
    assert.equal(
      f.saved().failures.includes('Causal diagnostic evidence unavailable'),
      ['footer', 'stopped'].includes(missing),
    );
    if (missing === 'mail refusal')
      assert.ok(f.saved().failures.includes(refusal));
    assert.equal(Object.hasOwn(f.summary(), 'cpuProfileEvidence'), false);
  });

test('finalizer retains safe tenant and failure tuples without excusing hits', (context) => {
  const f = fixture(context);
  const canary = 'SECRET-cookie-email-token-SQL';
  f.report.hasFailed = true;
  f.report.failures = [
    'Harness required proof or execution failed',
    `Expand/request ${canary}`,
  ];
  f.report.requests = [
    {
      actor: 'S:A',
      phase: 'get',
      sweepPhase: 'superadminOverrideGets',
      method: 'GET',
      route: '/v1/voices',
      status: 500,
      hasTenantHit: true,
      message: `Tenant isolation: findMany on Post used organizationId ${canary} but the request tenant is ${canary}`,
    },
  ];
  f.report.apiLogHits = [
    {
      phase: 'strict',
      message: `Tenant isolation: findMany on Post is missing organizationId in CLOUD mode. ${canary}`,
    },
  ];
  f.report.tenantHitGroups = [{}];
  f.write();
  const summary = f.summary();
  assert.equal(f.saved().hasFailed, true);
  assert.equal(summary.tenantEvidence.responseHits, 1);
  assert.equal(summary.tenantEvidence.logHits, 1);
  assert.equal(summary.tenantEvidence.responseGroups[0].actor, 'S:A');
  assert.equal(summary.tenantEvidence.responseGroups[0].route, '/v1/voices');
  assert.equal(summary.tenantEvidence.logGroups[0].actor, 'unknown');
  assert.equal(summary.failureEvidence.total, 2);
  assert.deepEqual(summary.failureEvidence.groups.map((x) => x.label).sort(), [
    'harness-required-proof-or-execution',
    'route-request',
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /SECRET|cookie|email-token|SQL/);
});

test('finalizer retains mandatory machine failures and historical unavailable projection without leaking private fields', (context) => {
  const f = fixture(context);
  f.report.machineCoverageRequired = true;
  f.report.getInventoryTemplates = ['/v1/voices'];
  f.report.machinePrivate = {
    token: 'private-token-canary',
    cipher: 'private-cipher-canary',
    key: 'private-key-canary',
    organizationId: 'private-id-canary',
    sql: 'private-sql-canary',
  };
  f.write();
  assert.equal(f.saved().hasFailed, true);
  assert.ok(f.saved().failures.includes('machine-route-inventory'));
  assert.ok(f.saved().failures.includes('machine-authorization-denial'));
  assert.ok(f.saved().failures.includes('machine-data-coverage'));
  const summary = f.summary();
  assert.equal(summary.machineCoverage.available, true);
  assert.equal(summary.failureEvidence.total, 3);
  assert.doesNotMatch(JSON.stringify(summary), /private-|machinePrivate/);
  delete f.report.machineCoverageRequired;
  f.write();
  assert.equal(f.summary().machineCoverage.available, false);
});

test('finalization durably retains failed-sample offsets and keeps sampler failure fatal', (context) => {
  const previous = Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
  Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', '1');
  context.after(() => {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
    else Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', previous);
  });
  const f = fixture(context);
  f.report.requests = [
    {
      sequence: 1,
      sentAtEpochMs: 2000,
      endedAtEpochMs: 2200,
      headerAtEpochMs: null,
      actor: 'M:A',
      phase: 'memberAGets',
      method: 'GET',
      route: '/v1/voices',
      status: 200,
    },
  ];
  const records = [
    { kind: 'header', protocol: 1, startedAt: 100, tenantFailuresVersion: 1 },
    {
      kind: 'database',
      start: 500,
      end: 1329,
      outcome: 'error',
      groups: [],
      diagnostic: {
        category: 'query-read-timeout',
        name: 'Error',
        code: 'NONE',
      },
      connectionStateAtStart: 'retained',
      connectionGenerationBefore: 1,
      connectionGenerationAfter: 1,
    },
    {
      kind: 'footer',
      endedAt: 2300,
      unavailable: false,
      records: 2,
      ingress: 0,
      pipelineEntries: 0,
      finishes: 0,
      closes: 0,
      invalidSequences: 0,
      duplicateSequences: 0,
      runtimeSamples: 0,
      databaseSamples: 1,
      databaseIncomplete: 0,
      tenantFailures: 0,
    },
  ];
  writeIsolatedFixture(
    join(f.directory, 'api-observations.ndjson'),
    `${records.map((r) => JSON.stringify(r)).join('\n')}\n`,
    { mode: 0o600 },
  );
  writeFileSync(join(f.directory, 'api-stopped'), 'stopped\n', { mode: 0o600 });
  f.report.finalLogScannedAt = new Date().toISOString();
  f.write();
  f.write();
  const p = f.summary().causalEvidence.database.failureWindows;
  assert.equal(p.available, true);
  assert.equal(p.windows[0].relation, 'before-first-instrumented-attempt');
  assert.equal(p.windows[0].durationMs, 829);
  assert.deepEqual(f.saved().causalEvidence.database.failureWindows, p);
  assert.equal(f.saved().hasFailed, true);
  assert.equal(f.summary().causalEvidence.reasons.samplerFailure, 1);
  assert.doesNotMatch(
    JSON.stringify(p),
    /Epoch|SQL|sequence|token|actor|route/,
  );
});

for (const mode of ['positive', 'legacy', 'zero'])
  test(`finalization conserves guard provenance and sticky failure (${mode})`, (context) => {
    const previous = Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
    Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', '1');
    context.after(() => {
      if (previous === undefined)
        Reflect.deleteProperty(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
      else Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', previous);
    });
    const f = fixture(context);
    const records = [
      {
        kind: 'header',
        protocol: 1,
        startedAt: 100,
        ...(mode === 'legacy' ? {} : { tenantFailuresVersion: 1 }),
      },
    ];
    if (mode === 'positive')
      records.push({
        kind: 'tenantFailure',
        ordinal: 1,
        sequence: null,
        at: 101,
        model: 'Credential',
        operation: 'findFirst',
        reason: 'organization-id-mismatch',
      });
    records.push({
      kind: 'footer',
      endedAt: 102,
      unavailable: false,
      records: records.length,
      ingress: 0,
      pipelineEntries: 0,
      finishes: 0,
      closes: 0,
      invalidSequences: 0,
      duplicateSequences: 0,
      runtimeSamples: 0,
      databaseSamples: 0,
      databaseIncomplete: 0,
      ...(mode === 'legacy'
        ? {}
        : { tenantFailures: mode === 'positive' ? 1 : 0 }),
    });
    writeIsolatedFixture(
      join(f.directory, 'api-observations.ndjson'),
      `${records.map((r) => JSON.stringify(r)).join('\n')}\n`,
      { mode: 0o600 },
    );
    writeFileSync(join(f.directory, 'api-stopped'), 'stopped\n', {
      mode: 0o600,
    });
    f.report.finalLogScannedAt = new Date().toISOString();
    f.write();
    f.write();
    assert.equal(f.saved().hasFailed, mode !== 'zero');
    assert.deepEqual(
      f.saved().failures,
      mode === 'zero'
        ? []
        : [
            mode === 'legacy'
              ? 'Tenant guard provenance unavailable'
              : 'Tenant guard failures observed',
          ],
    );
    const projection = f.summary().causalEvidence.tenantFailures;
    assert.equal(projection.available, mode !== 'legacy');
    assert.equal(
      projection.total,
      mode === 'legacy' ? null : mode === 'positive' ? 1 : 0,
    );
    assert.deepEqual(f.saved().causalEvidence.tenantFailures, projection);
    assert.equal(f.summary().tenantEvidence.logHits, 0);
    assert.equal(f.summary().tenantEvidence.responseHits, 0);
  });

function writeIsolatedFixture(file, text, options = { mode: 0o600 }) {
  const records = text
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line)),
    directory = dirname(file),
    binding = {
      version: 1,
      producer: 'api',
      runNonce: 'b'.repeat(32),
      sourceSha: 'a'.repeat(40),
    };
  const header = { ...records[0], databaseSampler: binding },
    footer = records.at(-1)?.kind === 'footer' ? records.at(-1) : null;
  if (!footer) {
    writeFileSync(
      file,
      `${JSON.stringify(header)}\n${records
        .slice(1)
        .map((r) => `${JSON.stringify(r)}\n`)
        .join('')}`,
      options,
    );
    return;
  }
  const dbRecords = records
      .filter((r) => r.kind === 'database')
      .map((r) => (r.outcome === 'success' ? { diagnostic: null, ...r } : r)),
    apiRecords = records.slice(1, -1).filter((r) => r.kind !== 'database');
  const apiFooter = {
    ...footer,
    records: footer.records - dbRecords.length,
    databaseSamples: footer.databaseSamples - dbRecords.length,
    databaseIncomplete: 0,
    databaseWorker: {
      readyObservedAt: header.startedAt,
      stopRequestedAt: footer.endedAt,
      stopCompletedAt: footer.endedAt,
      state: 'complete',
    },
  };
  const dbHeader = {
    kind: 'header',
    protocol: 1,
    startedAt: header.startedAt,
    tenantFailuresVersion: 1,
    databaseSampler: { ...binding, producer: 'database' },
  };
  const dbFooter = {
    ...footer,
    records: dbRecords.length + 1,
    ingress: 0,
    pipelineEntries: 0,
    finishes: 0,
    closes: 0,
    invalidSequences: 0,
    duplicateSequences: 0,
    runtimeSamples: 0,
    databaseSamples: dbRecords.length,
    tenantFailures: 0,
  };
  delete dbFooter.databaseWorker;
  const dbText = `${[dbHeader, ...dbRecords, dbFooter]
    .map((r) => JSON.stringify(r))
    .join('\n')}\n`;
  writeFileSync(join(directory, 'database-observations.ndjson'), dbText, {
    mode: 0o600,
  });
  const seal = {
    version: 1,
    runNonce: binding.runNonce,
    sourceSha: binding.sourceSha,
    state: 'complete',
    readyAt: header.startedAt,
    stopReceivedAt: footer.endedAt,
    sealedAt: footer.endedAt,
    bytes: Buffer.byteLength(dbText),
    records: dbRecords.length + 2,
    sha256: createHash('sha256').update(dbText).digest('hex'),
  };
  writeFileSync(
    join(directory, 'database-observations.seal.json'),
    `${JSON.stringify(seal)}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    file,
    `${[header, ...apiRecords, apiFooter]
      .map((r) => JSON.stringify(r))
      .join('\n')}\n`,
    options,
  );
}

test('current finalization requires independent sealed worker and preserves unavailable failure twice', (context) => {
  const previous = Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
  Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', '1');
  context.after(() => {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, 'CLOUD_SWEEP_DIAGNOSTICS');
    else Reflect.set(process.env, 'CLOUD_SWEEP_DIAGNOSTICS', previous);
  });
  const f = fixture(context),
    at = 100;
  const records = [
    { kind: 'header', protocol: 1, startedAt: at, tenantFailuresVersion: 1 },
    {
      kind: 'footer',
      endedAt: 200,
      unavailable: false,
      records: 1,
      ingress: 0,
      pipelineEntries: 0,
      finishes: 0,
      closes: 0,
      invalidSequences: 0,
      duplicateSequences: 0,
      runtimeSamples: 0,
      databaseSamples: 0,
      databaseIncomplete: 0,
      tenantFailures: 0,
    },
  ];
  writeIsolatedFixture(
    join(f.directory, 'api-observations.ndjson'),
    `${records.map((r) => JSON.stringify(r)).join('\n')}\n`,
  );
  writeFileSync(join(f.directory, 'api-stopped'), 'stopped\n', { mode: 0o600 });
  f.report.finalLogScannedAt = new Date().toISOString();
  f.write();
  assert.equal(f.saved().hasFailed, false);
  rmSync(join(f.directory, 'database-observations.seal.json'));
  for (let repeat = 0; repeat < 2; repeat++) {
    f.write();
    assert.equal(f.saved().hasFailed, true);
    assert.equal(f.summary().causalEvidence.quality, 'incomplete');
    assert.equal(f.summary().causalEvidence.reasons.invalidSchema, 1);
    assert.equal(f.summary().causalEvidence.tenantFailures.available, false);
  }
});
