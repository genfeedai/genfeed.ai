import assert from 'node:assert/strict';
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
import { join } from 'node:path';
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
  const header = { kind: 'header', protocol: 1, startedAt: at };
  const file = join(f.directory, 'api-observations.ndjson');
  writeFileSync(file, `${JSON.stringify(header)}\n`, { mode: 0o600 });
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
  };
  writeFileSync(file, `${JSON.stringify(header)}\n${JSON.stringify(footer)}\n`);
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
    const header = { kind: 'header', protocol: 1, startedAt: at };
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
    };
    writeFileSync(
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
    process.env.CLOUD_SWEEP_DIAGNOSTICS = '1';
    process.env.CLOUD_SWEEP_CPU_PROFILE = '0';
    context.after(() => {
      for (const [key, value] of previous)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    });
    const f = fixture(context);
    for (const key of Object.keys(f.proof)) delete f.proof[key];
    const at = Date.now();
    const header = { kind: 'header', protocol: 1, startedAt: at };
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
    };
    writeFileSync(
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
