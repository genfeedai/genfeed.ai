import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  classifyHits,
  hitSummary,
  loadBaseline,
  logEvidence,
} from './baseline.mjs';

// Run once more after CI stops the API so deferred logging is also evidence.
// Missing evidence fails closed unless CI already failed the API boot step.
export function scanFinalLog(apiLog, reportPath, apiBootOutcome, baselinePath) {
  if (apiBootOutcome === 'failure') {
    const report = {
      hasFailed: true,
      hasSkipped: true,
      skipReason: 'sweep skipped: API failed to boot',
      failures: [],
      requests: [],
      apiLogHits: [],
      tenantHitGroups: [],
      knownHits: [],
      staleBaselineEntries: [],
      suggestedBaseline: { issue: 'TBD', entries: [] },
    };
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    report = {
      hasFailed: true,
      failures: ['Sweep did not produce a JSON report'],
      requests: [],
    };
  }
  try {
    report.apiLogHits = logEvidence(
      readFileSync(apiLog),
      report.superadminOverrideLogOffset ?? null,
    );
  } catch {
    report.apiLogHits = [];
    report.failures.push('Cannot read final API stdout log');
  }
  let baseline = { issue: 'TBD', entries: [] };
  try {
    baseline = loadBaseline(baselinePath);
  } catch (error) {
    report.failures.push(`Cannot load superadmin override baseline: ${error}`);
  }
  Object.assign(
    report,
    classifyHits(report.requests, report.apiLogHits, baseline),
  );
  report.hasFailed ||=
    report.tenantHitGroups.length > 0 || report.failures.length > 0;
  report.finalLogScannedAt = new Date().toISOString();
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const report = scanFinalLog(
    process.env.CLOUD_SWEEP_API_LOG ?? `${process.env.RUNNER_TEMP}/api.log`,
    process.env.CLOUD_SWEEP_REPORT ??
      `${process.env.RUNNER_TEMP}/cloud-tenant-guard-report.json`,
    process.env.CLOUD_SWEEP_API_BOOT_OUTCOME,
  );
  if (report.hasSkipped) process.stdout.write(`${report.skipReason}\n`);
  if (!report.hasSkipped) process.stdout.write(`${hitSummary(report)}\n`);
  for (const failure of report.failures)
    process.stdout.write(`FAIL ${failure}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\nFinal API log scan: ${report.hasSkipped ? report.skipReason : report.hasFailed ? 'FAILED' : 'PASSED'}; tenant hit groups: ${report.tenantHitGroups.length}; known S:A groups: ${report.knownHits.length}; stale baseline entries: ${report.staleBaselineEntries.length}\n`,
    );
  // The boot step owns its failure; a skipped sweep is never a passing report.
  process.exitCode = report.hasFailed && !report.hasSkipped ? 1 : 0;
}
