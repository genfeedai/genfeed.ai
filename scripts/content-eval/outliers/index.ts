/**
 * Outlier report section (#5234): registered in `../analyzers.ts`, written to
 * `report.outliers`, and summarised in one line per class on stderr.
 */

import type { ContentEvalReport, ReportAnalyzer } from '../contracts';
import { analyzeRunOutliers } from './analyze';

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function renderOutlierSummary(report: ContentEvalReport): string[] {
  const section = report.outliers;
  if (!section) {
    return [];
  }
  if (section.status === 'failed') {
    return [
      `  outliers: analysis failed (${section.error ?? 'unknown error'})`,
    ];
  }

  const totals = section.totals
    .map((total) =>
      total.reported === total.total
        ? `${total.class} ${total.total}`
        : `${total.class} ${total.total} (${total.reported} shown)`,
    )
    .join(' · ');

  return [
    `  outliers (${section.thresholds.version}): ${totals}`,
    ...section.byContestant
      .filter((rate) => rate.outlierCaseCount > 0)
      .map(
        (rate) =>
          `  outliers ${rate.key}: ${rate.outlierCaseCount}/${rate.caseCount} cases (${formatRate(rate.outlierRate)})`,
      ),
  ];
}

export const outlierReportAnalyzer: ReportAnalyzer = {
  analyze: ({ fixtureRowsById, pairs, rows, thresholds }) =>
    analyzeRunOutliers({ fixtureRowsById, pairs, rows, thresholds }),
  key: 'outliers',
  summaryLines: renderOutlierSummary,
};

export {
  analyzeOutliers,
  analyzeRunOutliers,
  isSplitPair,
  quantile,
  rowScore,
} from './analyze';
export {
  DEFAULT_OUTLIER_THRESHOLDS,
  OUTLIER_CLASSES,
  type OutlierClass,
  type OutlierRecord,
  type OutlierSection,
  type OutlierThresholds,
  outlierRecordSchema,
  outlierSectionSchema,
  outlierThresholdsSchema,
} from './contracts';
