import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ContentEvalReport } from '../contracts';
import type { CalibrationSummary } from './contracts';
import {
  CALIBRATION_SCHEMA_VERSION,
  calibrationSectionSchema,
  calibrationSummarySchema,
} from './contracts';

export function buildCalibrationSummary(
  report: ContentEvalReport,
): CalibrationSummary {
  if (report.calibration === undefined) {
    throw new Error('report has no calibration section');
  }
  const calibration = calibrationSectionSchema
    .omit({ scores: true })
    .parse(report.calibration);
  return calibrationSummarySchema.parse({
    calibration,
    evidenceKind: report.evidenceKind,
    fixture: report.fixture,
    generatedAt: report.generatedAt,
    kind: 'content-eval-calibration-summary',
    passed: report.passed,
    runId: report.runId,
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    scoringSurface: calibration.scoringSurface,
    sourceRevision: report.sourceRevision,
    spend: {
      callCount: report.spend.callCount,
      spentCredits: report.spend.spentCredits,
      spentUsd: report.spend.spentUsd,
    },
    thresholdChecks: report.outcome.thresholdChecks,
    thresholdsVersion: report.thresholds.version,
    workingTreeDirty: report.workingTreeDirty,
  });
}

export function writeCalibrationSummary(
  path: string,
  summary: CalibrationSummary,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`);
}
