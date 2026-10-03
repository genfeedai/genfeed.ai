import type { ScoringSurface } from '../content-eval/calibration/contracts';

export const CALIBRATION_REPORT_LINK_PATTERN =
  /^Calibration-Report:\s*(scripts\/content-eval\/calibration\/reports\/[A-Za-z0-9._-]+\.json)\s*$/m;
export const CALIBRATION_GATE_CODES = [
  'lock-missing',
  'lock-stale',
  'no-base',
  'bootstrap',
  'unchanged',
  'vision-unenforced',
  'merge-group',
  'pr-body-unavailable',
  'link-missing',
  'report-missing',
  'report-invalid',
  'report-stub',
  'report-stale',
  'linked',
] as const;
export type CalibrationGateCode = (typeof CALIBRATION_GATE_CODES)[number];
export type SummaryReadResult =
  | { isPresent: false }
  | { isPresent: true; value: unknown };

export interface CalibrationGateInput {
  baseLock: ScoringSurface | null | 'unavailable';
  event: string;
  headLock: ScoringSurface | null;
  headSurface: ScoringSurface;
  prBody: string | null;
  readSummary: (repoPath: string) => SummaryReadResult;
}

export interface CalibrationGateResult {
  code: CalibrationGateCode;
  isPassing: boolean;
  reason: string;
  warning: string | null;
}

export function evaluateCalibrationGate(
  _input: CalibrationGateInput,
): CalibrationGateResult {
  return { code: 'unchanged', isPassing: true, reason: 'stub', warning: null };
}

export async function main(): Promise<number> {
  return 0;
}

if (import.meta.main) {
  main().then((code) => {
    process.exitCode = code;
  });
}
