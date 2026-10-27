/**
 * Noise report section (#5600): registered in `../analyzers.ts`, written to
 * `report.noise`, and summarised on stderr.
 */

import type { ContentEvalReport, ReportAnalyzer } from '../contracts';
import { analyzeNoise } from './analyze';

function formatScore(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(3);
}

export function renderNoiseSummary(report: ContentEvalReport): string[] {
  const section = report.noise;
  if (!section) {
    return [];
  }

  const lines = section.contestants.map((contestant) => {
    const { ci95, mean } = contestant.score;
    const interval = ci95
      ? `95% CI ${formatScore(ci95.lower)}–${formatScore(ci95.upper)}`
      : 'no interval (fewer than 2 cases)';

    return `  noise ${contestant.contestantId}: ${formatScore(mean)} · ${interval} · ${contestant.caseCount} cases × ${contestant.repeats} repeat(s)`;
  });
  for (const comparison of section.comparisons) {
    lines.push(
      `  noise ${comparison.challengerId} vs ${comparison.baselineId}: ${
        comparison.verdict === 'within-noise'
          ? 'within noise, no winner'
          : comparison.verdict
      } (paired Δ ${formatScore(comparison.difference.mean)})`,
    );
  }
  for (const warning of section.diagnostics.warnings) {
    lines.push(`  WARN ${warning}`);
  }

  return lines;
}

export const noiseReportAnalyzer: ReportAnalyzer = {
  analyze: ({ rows }) => analyzeNoise(rows),
  key: 'noise',
  summaryLines: renderNoiseSummary,
};

export { analyzeNoise } from './analyze';
