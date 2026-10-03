import { describe, expect, it } from 'vitest';
import type {
  ArmRecord,
  CalibrationSummary,
  MetricRow,
  ScoringSurface,
} from '../content-eval/calibration/contracts';
import {
  CALIBRATION_SCHEMA_VERSION,
  calibrationSummarySchema,
  SCORING_SURFACE_VERSION,
} from '../content-eval/calibration/contracts';
import type { CalibrationGateInput } from './calibration-gate';
import { evaluateCalibrationGate } from './calibration-gate';

const REPORT_PATH =
  'scripts/content-eval/calibration/reports/2026-10-03-test.json';
const PR_BODY = `Refs #4924\n\nCalibration-Report: ${REPORT_PATH}\n`;

function surface(text = 'a', vision = 'b'): ScoringSurface {
  return {
    text: {
      digest: `sha256:${text.repeat(64)}`,
      files: [],
      values: {
        contentQualityModel: 'google/gemini-2.5-flash-lite',
        evaluationTemplates: {
          article: 'article',
          post: 'post',
          system: 'system',
        },
        evaluationsModel: 'anthropic/claude-sonnet-5',
        scoringSchema: 'content_quality_scoring',
      },
    },
    version: SCORING_SURFACE_VERSION,
    vision: {
      digest: `sha256:${vision.repeat(64)}`,
      files: [],
      values: {
        mediaRubricVersion: 'media-rubric-test',
        scorerVisionModel: 'openai/gpt-5.6-luna',
        visionTemplates: { image: 'image', video: 'video' },
      },
    },
  };
}

const BASE = surface();
const HEAD = surface('c');

function input(
  overrides: Partial<CalibrationGateInput> = {},
): CalibrationGateInput {
  return {
    baseLock: BASE,
    event: 'pull_request',
    headLock: HEAD,
    headSurface: HEAD,
    prBody: '',
    readSummary: () => ({ isPresent: false }),
    ...overrides,
  };
}

function arm(profileId: ArmRecord['profileId']): ArmRecord {
  return {
    armId: `${profileId}@test-model`,
    family: 'test',
    isPrimary: true,
    model: 'test-model',
    modelVersions: ['test-model'],
    profileId,
    promptSource: 'production-code',
    providers: ['test'],
  };
}

function pooledMetric(
  armId: string,
  scoredRows = 32,
  labelledRows = scoredRows,
): MetricRow {
  return {
    armId,
    bandKappa: 0.8,
    bandKappaUnweighted: 0.7,
    bandRows: 32,
    contentKind: '*',
    decisionKappa: 0.8,
    decisionRows: 32,
    distribution: {
      bandCounts: [8, 8, 8, 8],
      ceilingRate: 0.25,
      dominantBandShare: 0.25,
      floorRate: 0.25,
      isCompressed: false,
      mean: 0.5,
      standardDeviation: 0.3,
    },
    maeToBandMidpoint: 0.1,
    rows: 32,
    scoredBandRows: labelledRows,
    scoredDecisionRows: labelledRows,
    scoredRows,
    spearmanRho: 0.8,
    voidCount: 0,
    voidRate: 0,
  };
}

const ARMS = [arm('content-quality'), arm('evaluations')];

function summary(
  overrides: Partial<CalibrationSummary> = {},
): CalibrationSummary {
  const scoringSurface = {
    textDigest: HEAD.text.digest,
    visionDigest: HEAD.vision.digest,
  };
  return {
    calibration: {
      arms: ARMS,
      crossFamily: [],
      injection: null,
      metrics: ARMS.map((entry) => pooledMetric(entry.armId)),
      pointwisePositionBias: 'not-applicable-pointwise',
      positionBias: [],
      rubricAlignment: {
        autoReviewJudge: null,
        autoReviewReason: 'synthetic gate fixture',
        crossJudge: null,
        mapping: [],
      },
      schemaVersion: CALIBRATION_SCHEMA_VERSION,
      scoringSurface,
      skippedCrossFamily: [],
      vision: null,
    },
    evidenceKind: 'live-dispatcher',
    fixture: {
      digest: `sha256:${'0'.repeat(64)}`,
      path: 'synthetic:gate',
      rowCount: 32,
    },
    generatedAt: '2026-10-03T12:00:00.000Z',
    kind: 'content-eval-calibration-summary',
    passed: true,
    runId: 'calibration-gate-test',
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    scoringSurface,
    sourceRevision: '0'.repeat(40),
    spend: { callCount: 64, spentCredits: 90, spentUsd: 0.9 },
    thresholdChecks: [],
    thresholdsVersion: 'thresholds-v2',
    workingTreeDirty: false,
    ...overrides,
  };
}

describe('judge calibration gate', () => {
  it('G1 rejects a missing head lock before considering an unavailable base', () => {
    expect(
      evaluateCalibrationGate(
        input({ baseLock: 'unavailable', headLock: null }),
      ),
    ).toMatchObject({ code: 'lock-missing', isPassing: false });
  });

  it('G2 rejects a stale text or vision head lock', () => {
    expect(evaluateCalibrationGate(input({ headLock: BASE }))).toMatchObject({
      code: 'lock-stale',
      isPassing: false,
    });
    expect(
      evaluateCalibrationGate(input({ headLock: surface('c', 'd') })),
    ).toMatchObject({ code: 'lock-stale', isPassing: false });
  });

  it('G3 bootstraps when the base has no lock', () => {
    expect(evaluateCalibrationGate(input({ baseLock: null }))).toMatchObject({
      code: 'bootstrap',
      isPassing: true,
    });
  });

  it('G4 passes when both surface digests match the base', () => {
    expect(
      evaluateCalibrationGate(input({ headLock: BASE, headSurface: BASE })),
    ).toMatchObject({ code: 'unchanged', isPassing: true, warning: null });
  });

  it('G5 rejects a text digest bump on a pull request without a report link', () => {
    expect(evaluateCalibrationGate(input())).toMatchObject({
      code: 'link-missing',
      isPassing: false,
    });
  });

  it('G6 rejects a linked report that is absent', () => {
    expect(evaluateCalibrationGate(input({ prBody: PR_BODY }))).toMatchObject({
      code: 'report-missing',
      isPassing: false,
    });
  });

  it('G7 rejects a linked report that fails the summary schema', () => {
    expect(
      evaluateCalibrationGate(
        input({
          prBody: PR_BODY,
          readSummary: () => ({ isPresent: true, value: { kind: 'invalid' } }),
        }),
      ),
    ).toMatchObject({ code: 'report-invalid', isPassing: false });
  });

  it('G8 rejects stub evidence even when its digest matches the head', () => {
    expect(
      evaluateCalibrationGate(
        input({
          prBody: PR_BODY,
          readSummary: () => ({
            isPresent: true,
            value: summary({ evidenceKind: 'stub-dispatcher' }),
          }),
        }),
      ),
    ).toMatchObject({ code: 'report-stub', isPassing: false });
  });

  it('G9 rejects live evidence for a stale text digest', () => {
    expect(
      evaluateCalibrationGate(
        input({
          prBody: PR_BODY,
          readSummary: () => ({
            isPresent: true,
            value: summary({
              scoringSurface: {
                textDigest: BASE.text.digest,
                visionDigest: HEAD.vision.digest,
              },
            }),
          }),
        }),
      ),
    ).toMatchObject({ code: 'report-stale', isPassing: false });
  });

  it('G10 passes a linked live summary and warns when its thresholds failed', () => {
    const live = summary();
    expect(calibrationSummarySchema.safeParse(live).success).toBe(true);
    expect(
      evaluateCalibrationGate(
        input({
          prBody: PR_BODY,
          readSummary: (path) =>
            path === REPORT_PATH
              ? { isPresent: true, value: live }
              : { isPresent: false },
        }),
      ),
    ).toMatchObject({ code: 'linked', isPassing: true, warning: null });
    expect(
      evaluateCalibrationGate(
        input({
          prBody: PR_BODY,
          readSummary: () => ({
            isPresent: true,
            value: summary({ passed: false }),
          }),
        }),
      ),
    ).toMatchObject({
      code: 'linked',
      isPassing: true,
      warning: 'linked calibration report failed its thresholds',
    });
  });

  it('G15 rejects a live summary that lacks complete calibration evidence', () => {
    const live = summary();
    const gate = (value: CalibrationSummary) =>
      evaluateCalibrationGate(
        input({
          prBody: PR_BODY,
          readSummary: () => ({ isPresent: true, value }),
        }),
      );
    const incomplete: Array<[CalibrationSummary, string]> = [
      [
        summary({ spend: { callCount: 0, spentCredits: 0, spentUsd: 0 } }),
        'it records no judge calls',
      ],
      [
        summary({ fixture: { ...live.fixture, rowCount: 29 } }),
        'its fixture has 29 rows, below 30',
      ],
      [
        summary({ thresholdsVersion: 'thresholds-v1' }),
        'it used thresholds-v1, not thresholds-v2',
      ],
      [summary({ workingTreeDirty: true }), 'it ran from a dirty working tree'],
      [
        summary({
          calibration: {
            ...live.calibration,
            metrics: [pooledMetric(ARMS[0]?.armId ?? '')],
          },
        }),
        'it has 0 labelled scored rows for evaluations, below 30',
      ],
      [
        summary({
          calibration: {
            ...live.calibration,
            metrics: ARMS.map((entry) => pooledMetric(entry.armId, 32, 0)),
          },
        }),
        'it has 0 labelled scored rows for content-quality, below 30; it has 0 labelled scored rows for evaluations, below 30',
      ],
      [
        summary({
          calibration: {
            ...live.calibration,
            metrics: [
              pooledMetric(ARMS[0]?.armId ?? '', 32, 29),
              { ...pooledMetric(ARMS[1]?.armId ?? ''), scoredBandRows: 0 },
            ],
          },
        }),
        'it has 29 labelled scored rows for content-quality, below 30',
      ],
      [
        summary({
          calibration: {
            ...live.calibration,
            metrics: ARMS.map((entry) => pooledMetric(entry.armId, 0)),
          },
        }),
        'it has 0 labelled scored rows for content-quality, below 30; it has 0 labelled scored rows for evaluations, below 30',
      ],
    ];
    for (const [value, gap] of incomplete) {
      expect(calibrationSummarySchema.safeParse(value).success).toBe(true);
      expect(gate(value)).toEqual({
        code: 'report-incomplete',
        isPassing: false,
        reason: `linked calibration report ${REPORT_PATH} is not complete live evidence: ${gap}`,
        warning: null,
      });
    }
  });

  it('G11 passes a text change in a merge group without a PR body', () => {
    expect(
      evaluateCalibrationGate(input({ event: 'merge_group', prBody: null })),
    ).toMatchObject({ code: 'merge-group', isPassing: true });
  });

  it('G12 passes a vision-only change with the deferred-calibration warning', () => {
    const visionChange = surface('a', 'd');
    expect(
      evaluateCalibrationGate(
        input({ headLock: visionChange, headSurface: visionChange }),
      ),
    ).toMatchObject({
      code: 'vision-unenforced',
      isPassing: true,
      warning:
        'vision-judge surface changed; vision calibration is deferred (#4924 D-1)',
    });
  });

  it('G13 passes when the base revision is unavailable', () => {
    expect(
      evaluateCalibrationGate(input({ baseLock: 'unavailable' })),
    ).toMatchObject({ code: 'no-base', isPassing: true });
  });

  it('G14 rejects a text change when the pull request body is unavailable', () => {
    expect(evaluateCalibrationGate(input({ prBody: null }))).toMatchObject({
      code: 'pr-body-unavailable',
      isPassing: false,
    });
  });
});
