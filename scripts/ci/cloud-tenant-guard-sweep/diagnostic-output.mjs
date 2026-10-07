import {
  closeSync,
  constants,
  fstatSync,
  ftruncateSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { collectCausalEvidence } from './causal-evidence.mjs';
import {
  buildDiagnosticSummary,
  DIAGNOSTIC_ACTORS,
  DIAGNOSTIC_PHASES,
} from './core.mjs';
import { readMailStats, validateRunDirectory } from './local-mail-stub.mjs';

const unavailable = 'Final diagnostic evidence unavailable';
const refused = 'Restricted transport recorded rejected requests';
function fail(report, label) {
  report.hasFailed = true;
  report.failures ??= [];
  if (!report.failures.includes(label)) report.failures.push(label);
}
function writeOwned(file, value) {
  const descriptor = openSync(
    file,
    constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const stat = fstatSync(descriptor);
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o600
    )
      throw new Error(unavailable);
    // Truncate only after checking the opened owned file.
    ftruncateSync(descriptor, 0);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
  } finally {
    closeSync(descriptor);
  }
}
export function writeDiagnosticEvidence(
  report,
  fixtureProof,
  runDir,
  reportPath,
) {
  const directory = validateRunDirectory(runDir);
  const summaryPath = join(directory, 'diagnostic-summary.json');
  const ownedReport =
    dirname(resolve(reportPath)) === directory &&
    resolve(reportPath) !== summaryPath &&
    resolve(reportPath) !== join(directory, 'mail-stats.json');
  try {
    if (
      !ownedReport ||
      !report.mailStats ||
      !fixtureProof ||
      [
        'verificationRequired',
        'noUnverifiedSession',
        'acceptedMail',
        'verifiedAuthentication',
      ].some((key) => typeof fixtureProof[key] !== 'boolean')
    )
      throw new Error(unavailable);
    report.mailStats = readMailStats(directory, report.mailStats);
    if (Object.values(report.mailStats.rejected).some((value) => value !== 0))
      fail(report, refused);
    if (Reflect.get(process.env, 'CLOUD_SWEEP_DIAGNOSTICS') === '1') {
      const final = Boolean(report.finalLogScannedAt);
      const snapshot = collectCausalEvidence(report, directory, {
        final,
        actors: DIAGNOSTIC_ACTORS,
        phases: DIAGNOSTIC_PHASES,
      });
      report.causalObservation = snapshot.records;
      report.causalEvidence = snapshot.evidence;
      if (final && snapshot.evidence.quality !== 'complete')
        fail(report, 'Causal diagnostic evidence unavailable');
    }
    const summary = buildDiagnosticSummary(report, fixtureProof);
    writeOwned(reportPath, report);
    writeOwned(summaryPath, summary);
    return summary;
  } catch {
    fail(report, unavailable);
    if (ownedReport) {
      try {
        writeOwned(reportPath, report);
      } catch {
        /* Best-effort private failure evidence. */
      }
    }
    try {
      unlinkSync(summaryPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(unavailable);
    }
    throw new Error(unavailable);
  }
}
