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
  'missing-proof',
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
    if (kind === 'missing-proof') delete f.proof.acceptedMail;
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
