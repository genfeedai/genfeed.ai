#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  formatFlakySection,
  isPlaywrightJsonReport,
  mergePlaywrightJsonReports,
} from '../playwright-e2e-tiers.mjs';

/**
 * Lists tests that passed only on a retry in the GitHub run summary (#6231).
 * Reads one merged Playwright JSON report. Reporting only: never fails a run.
 *
 * Usage: node scripts/ci/playwright-flaky-summary.mjs <merged-results.json>
 *
 * @param {string} reportPath
 * @returns {string[]} the markdown lines written
 */
export function buildFlakyRunSummary(reportPath) {
  if (!existsSync(reportPath)) {
    return [
      '### E2E flaky tests',
      '',
      `No merged JSON report at \`${reportPath}\`.`,
      '',
    ];
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (!isPlaywrightJsonReport(report)) {
    return [
      '### E2E flaky tests',
      '',
      `\`${reportPath}\` is not a Playwright JSON report.`,
      '',
    ];
  }
  const { flaky, flakyTests } = mergePlaywrightJsonReports([report]);
  if (flaky === 0) {
    return ['### E2E flaky tests', '', 'None: no test needed a retry.', ''];
  }
  return ['### E2E flaky tests', '', ...formatFlakySection(flakyTests)];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error('Usage: playwright-flaky-summary.mjs <merged-results.json>');
    process.exit(2);
  }
  const lines = buildFlakyRunSummary(reportPath).join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines}\n`);
  }
  console.log(lines);
}
