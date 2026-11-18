import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildFlakyRunSummary } from './playwright-flaky-summary.mjs';

function writeReport(report) {
  const directory = mkdtempSync(path.join(tmpdir(), 'flaky-summary-'));
  const reportPath = path.join(directory, 'merged-results.json');
  writeFileSync(reportPath, JSON.stringify(report));
  return { directory, reportPath };
}

function reportWith(tests) {
  return {
    suites: [
      {
        file: 'tests/smoke/example.spec.ts',
        specs: tests.map((spec) => ({
          file: 'tests/smoke/example.spec.ts',
          tests: [spec.test],
          title: spec.title,
        })),
      },
    ],
  };
}

test('names a test that passed only on its retry', () => {
  const { directory, reportPath } = writeReport(
    reportWith([
      {
        test: {
          expectedStatus: 'passed',
          projectName: 'app-core',
          results: [{ status: 'failed' }, { status: 'passed' }],
          status: 'flaky',
        },
        title: 'opens the calendar',
      },
      {
        test: {
          expectedStatus: 'passed',
          projectName: 'app-core',
          results: [{ status: 'passed' }],
          status: 'expected',
        },
        title: 'steady test',
      },
    ]),
  );
  try {
    const summary = buildFlakyRunSummary(reportPath).join('\n');
    assert.match(summary, /Flaky tests \(passed on retry\)/u);
    assert.match(
      summary,
      /`tests\/smoke\/example\.spec\.ts` \[app-core\] — opens the calendar \(1 retry\)/u,
    );
    assert.doesNotMatch(summary, /steady test/u);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('says so when no test needed a retry', () => {
  const { directory, reportPath } = writeReport(
    reportWith([
      {
        test: {
          expectedStatus: 'passed',
          results: [{ status: 'passed' }],
          status: 'expected',
        },
        title: 'steady test',
      },
    ]),
  );
  try {
    assert.match(
      buildFlakyRunSummary(reportPath).join('\n'),
      /None: no test needed a retry/u,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
