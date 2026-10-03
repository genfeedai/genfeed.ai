import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoringSurface } from '../content-eval/calibration/contracts';
import {
  calibrationSummarySchema,
  SCORING_SURFACE_LOCK_PATH,
  scoringSurfaceSchema,
} from '../content-eval/calibration/contracts';
import { readRepoRoot } from '../content-eval/provenance';

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
  input: CalibrationGateInput,
): CalibrationGateResult {
  const { baseLock, event, headLock, headSurface, prBody, readSummary } = input;
  const headText = headSurface.text.digest;
  const headVision = headSurface.vision.digest;
  const lockPath = SCORING_SURFACE_LOCK_PATH;
  if (headLock === null) {
    return {
      code: 'lock-missing',
      isPassing: false,
      reason: `scoring-surface lock ${lockPath} is missing; run bun scripts/content-eval/calibration/scoring-surface.ts --write`,
      warning: null,
    };
  }
  const lockText = headLock.text.digest;
  const lockVision = headLock.vision.digest;
  if (lockText !== headText || lockVision !== headVision) {
    return {
      code: 'lock-stale',
      isPassing: false,
      reason: `scoring-surface lock is stale (lock text ${lockText}, vision ${lockVision}; computed text ${headText}, vision ${headVision}); run bun scripts/content-eval/calibration/scoring-surface.ts --write`,
      warning: null,
    };
  }
  if (baseLock === 'unavailable') {
    return {
      code: 'no-base',
      isPassing: true,
      reason:
        'no base revision to compare; the head lock matches the computed surface',
      warning: null,
    };
  }
  if (baseLock === null) {
    return {
      code: 'bootstrap',
      isPassing: true,
      reason:
        'the base revision has no scoring-surface lock; this change introduces it',
      warning: null,
    };
  }
  const baseText = baseLock.text.digest;
  if (baseText === headText && baseLock.vision.digest === headVision) {
    return {
      code: 'unchanged',
      isPassing: true,
      reason: 'scoring surface unchanged from the base revision',
      warning: null,
    };
  }
  if (baseText === headText) {
    return {
      code: 'vision-unenforced',
      isPassing: true,
      reason:
        'only the vision-judge surface changed; vision calibration is deferred (#4924 D-1)',
      warning:
        'vision-judge surface changed; vision calibration is deferred (#4924 D-1)',
    };
  }
  if (event === 'merge_group') {
    return {
      code: 'merge-group',
      isPassing: true,
      reason:
        'text scoring surface changed; the calibration link was checked on each member pull request',
      warning: null,
    };
  }
  if (event === 'pull_request' && prBody === null) {
    return {
      code: 'pr-body-unavailable',
      isPassing: false,
      reason:
        'text scoring surface changed and the pull request body could not be read; re-run this job',
      warning: null,
    };
  }
  const match = CALIBRATION_REPORT_LINK_PATTERN.exec(prBody ?? '');
  const reportPath = match?.[1];
  if (reportPath === undefined) {
    return {
      code: 'link-missing',
      isPassing: false,
      reason: `text scoring surface changed (${baseText} to ${headText}); add the line Calibration-Report: scripts/content-eval/calibration/reports/{file}.json to the pull request body`,
      warning: null,
    };
  }
  const report = readSummary(reportPath);
  if (report.isPresent === false) {
    return {
      code: 'report-missing',
      isPassing: false,
      reason: `linked calibration report ${reportPath} does not exist at this revision`,
      warning: null,
    };
  }
  const parsed = calibrationSummarySchema.safeParse(report.value);
  if (parsed.success === false) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return {
      code: 'report-invalid',
      isPassing: false,
      reason: `linked calibration report ${reportPath} does not match calibrationSummarySchema: ${issues}`,
      warning: null,
    };
  }
  const summary = parsed.data;
  const evidenceKind = summary.evidenceKind;
  if (evidenceKind !== 'live-dispatcher') {
    return {
      code: 'report-stub',
      isPassing: false,
      reason: `linked calibration report ${reportPath} is ${evidenceKind} evidence; a live-dispatcher run is required`,
      warning: null,
    };
  }
  const reportText = summary.scoringSurface.textDigest;
  if (reportText !== headText) {
    return {
      code: 'report-stale',
      isPassing: false,
      reason: `linked calibration report ${reportPath} measured text digest ${reportText}, but this revision's text digest is ${headText}`,
      warning: null,
    };
  }
  const runId = summary.runId;
  return {
    code: 'linked',
    isPassing: true,
    reason: `linked calibration report ${reportPath} measured this revision (run ${runId})`,
    warning: summary.passed
      ? null
      : 'linked calibration report failed its thresholds',
  };
}

function readBaseLock(
  repoRoot: string,
  sha: string,
): ScoringSurface | null | 'unavailable' {
  if (sha === '') {
    return 'unavailable';
  }
  const result = spawnSync(
    'git',
    ['show', `${sha}:${SCORING_SURFACE_LOCK_PATH}`],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    const stderr = result.stderr ?? '';
    if (
      stderr.includes('does not exist') ||
      stderr.includes('exists on disk, but not in')
    ) {
      return null;
    }
    throw new Error(
      `cannot read base scoring-surface lock at ${sha}: ${stderr.trim()}`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(result.stdout);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `base scoring-surface lock at ${sha} is invalid: ${detail}`,
    );
  }
  const parsed = scoringSurfaceSchema.safeParse(value);
  if (parsed.success === false) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `base scoring-surface lock at ${sha} is invalid: ${detail}`,
    );
  }
  return parsed.data;
}

async function readPrBody(event: string): Promise<string | null> {
  if (event !== 'pull_request') {
    return null;
  }
  const number = process.env.PR_NUMBER ?? '';
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const token = process.env.GITHUB_TOKEN ?? '';
  if (number === '' || repository === '' || token === '') {
    return null;
  }
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/pulls/${number}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (response.ok === false) {
      return null;
    }
    const data: unknown = await response.json();
    return typeof data === 'object' &&
      data !== null &&
      'body' in data &&
      typeof data.body === 'string'
      ? data.body
      : '';
  } catch {
    return null;
  }
}

export async function main(): Promise<number> {
  try {
    const { computeScoringSurface, readScoringSurfaceLock } = await import(
      '../content-eval/calibration/scoring-surface'
    );
    const repoRoot = readRepoRoot();
    const event = process.env.GITHUB_EVENT_NAME ?? '';
    const baseLock = readBaseLock(repoRoot, process.env.CI_BASE_SHA ?? '');
    const headLock = readScoringSurfaceLock();
    const headSurface = computeScoringSurface();
    const prBody = await readPrBody(event);
    const result = evaluateCalibrationGate({
      baseLock,
      event,
      headLock,
      headSurface,
      prBody,
      readSummary: (path): SummaryReadResult => {
        const absolutePath = join(repoRoot, path);
        if (existsSync(absolutePath) === false) {
          return { isPresent: false };
        }
        const text = readFileSync(absolutePath, 'utf8');
        try {
          return { isPresent: true, value: JSON.parse(text) };
        } catch {
          return { isPresent: true, value: null };
        }
      },
    });
    process.stdout.write(
      `calibration-gate: ${result.code}: ${result.reason}\n`,
    );
    if (result.warning !== null) {
      process.stdout.write(`::warning::${result.warning}\n`);
    }
    if (result.isPassing === false) {
      process.stdout.write(`::error::${result.reason}\n`);
    }
    return result.isPassing ? 0 : 1;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`calibration-gate: error: ${message}\n`);
    process.stdout.write(`::error::${message}\n`);
    return 1;
  }
}

if (import.meta.main) {
  main().then((code) => {
    process.exitCode = code;
  });
}
