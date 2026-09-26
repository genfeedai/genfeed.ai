/**
 * Report assembly. A report is only written after it validates against
 * `contentEvalReportSchema`, partial (spend-aborted) runs included, so a
 * reader can always trust the shape.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  ContentEvalReport,
  ReportAnalyzer,
  ReportInput,
} from './contracts';
import {
  CONTENT_EVAL_REPORT_SCHEMA_VERSION,
  CONTENT_EVAL_THRESHOLDS,
  contentEvalReportSchema,
} from './contracts';

export function buildReport(
  input: ReportInput,
  analyzers: ReportAnalyzer[],
): ContentEvalReport {
  const { config, fixture, revision } = input;
  // Suite-specific sections live at the top level, not inside `outcome`.
  const { benchMatches, media, ...outcome } = input.outcome;
  const fixtureRowsById = new Map(fixture.rows.map((row) => [row.id, row]));
  const sections: Record<string, unknown> = {};
  for (const analyzer of analyzers) {
    sections[analyzer.key] = analyzer.analyze({
      fixtureRowsById,
      pairs: outcome.pairs,
      rows: outcome.rows,
      runId: input.runId,
      thresholds: config.outlierThresholds,
    });
  }

  const isThresholdPassing = outcome.thresholdChecks.every(
    (check) => check.passed,
  );

  return contentEvalReportSchema.parse({
    aborted: input.aborted,
    abortMessage: input.abortMessage,
    ...(benchMatches === undefined ? {} : { benchMatches }),
    calls: input.spend.calls,
    config,
    dispatcher: config.dispatcher,
    evidenceKind:
      config.dispatcher === 'live' ? 'live-dispatcher' : 'stub-dispatcher',
    fixture: {
      digest: fixture.digest,
      path: fixture.path,
      rowCount: fixture.rows.length,
    },
    generatedAt: input.generatedAt,
    ...(media === undefined ? {} : { media }),
    modelQualityAssessed: config.dispatcher === 'live',
    outcome,
    ...sections,
    passed: input.aborted === null && isThresholdPassing,
    rubrics: input.rubrics,
    runId: input.runId,
    schemaVersion: CONTENT_EVAL_REPORT_SCHEMA_VERSION,
    sourceRevision: revision.sourceRevision,
    spend: input.spend.summary,
    suite: config.suite,
    thresholds: CONTENT_EVAL_THRESHOLDS,
    workingTreeDirty: revision.workingTreeDirty,
  });
}

export function writeReport(path: string, report: ContentEvalReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

function formatRate(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

/** Short human summary for stderr; the JSON report is the record. */
export function renderSummary(
  report: ContentEvalReport,
  analyzers: ReportAnalyzer[],
): string {
  const lines = [
    `Content eval · ${report.suite} · ${report.dispatcher} dispatcher · run ${report.runId}`,
    `  revision:  ${report.sourceRevision}${report.workingTreeDirty ? ' (dirty)' : ''}`,
    `  fixture:   ${report.fixture.path} (${report.fixture.rowCount} rows)`,
    `  spend:     ${report.spend.spentCredits.toFixed(4)} / ${report.spend.maxCredits} credits over ${report.spend.callCount} calls`,
  ];

  for (const contestant of report.outcome.contestants) {
    const versus = contestant.vsBaseline
      ? ` · vs baseline win ${formatRate(contestant.vsBaseline.winRate)} tie ${formatRate(contestant.vsBaseline.tieRate)}`
      : ' · baseline';
    lines.push(
      `  ${contestant.contestantId}: mean ${contestant.meanScore?.toFixed(3) ?? 'n/a'} · accepted ${contestant.acceptedCount}/${contestant.rows} · void ${formatRate(contestant.voidRate)}${versus}`,
    );
  }
  for (const judge of report.outcome.judges) {
    lines.push(
      `  judge ${judge.judgeRegistryKey}: band agreement ${formatRate(judge.bandAgreement)} over ${judge.labelledRows} labelled rows`,
    );
  }
  if (report.outcome.positionBiasRate !== null) {
    lines.push(
      `  position bias: ${formatRate(report.outcome.positionBiasRate)}`,
    );
  }
  for (const analyzer of analyzers) {
    lines.push(...(analyzer.summaryLines?.(report) ?? []));
  }
  for (const check of report.outcome.thresholdChecks.filter(
    (entry) => !entry.passed,
  )) {
    lines.push(
      `  FAIL ${check.id} (${check.subject}): ${check.actual ?? 'n/a'} ${check.comparator} ${check.threshold}`,
    );
  }
  lines.push(
    report.aborted
      ? `  ABORTED (${report.aborted}): ${report.abortMessage ?? ''}`
      : `  result: ${report.passed ? 'PASS' : 'FAIL'}`,
  );

  return `${lines.join('\n')}\n`;
}
