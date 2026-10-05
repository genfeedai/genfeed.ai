import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { groupHits, logHits } from './core.mjs';

// Run once more after CI stops the API so deferred logging is also evidence.
// Missing evidence fails closed, including failures before the harness starts.
export function scanFinalLog(apiLog, reportPath) {
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
    report.apiLogHits = logHits(readFileSync(apiLog, 'utf8'));
  } catch {
    report.apiLogHits = [];
    report.failures.push('Cannot read final API stdout log');
  }
  report.tenantHitGroups = groupHits(report.requests, report.apiLogHits);
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
    `${process.env.RUNNER_TEMP}/api.log`,
    `${process.env.RUNNER_TEMP}/cloud-tenant-guard-report.json`,
  );
  for (const group of report.tenantHitGroups)
    process.stdout.write(
      `TENANT HIT ${group.model}.${group.operation} ${group.route}: ${group.messages.join('\n')}\n`,
    );
  for (const failure of report.failures)
    process.stdout.write(`FAIL ${failure}\n`);
  process.exitCode = report.hasFailed ? 1 : 0;
}
