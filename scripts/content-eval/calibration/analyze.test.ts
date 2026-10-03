import { describe, expect, it } from 'vitest';
import type { CallProvenance, FixtureRow } from '../contracts';
import { callProvenanceSchema, fixtureRowSchema } from '../contracts';
import {
  buildCalibrationChecks,
  buildCalibrationSection,
  buildCrossFamilyRows,
  buildInjectionSection,
  buildMetricRows,
  buildPositionBiasRows,
  buildRubricAlignment,
  fixtureKinds,
  pooledPositionBiasRate,
  RUBRIC_ALIGNMENT,
  recommendInjection,
} from './analyze';
import type {
  ArmScore,
  ArmSpec,
  InjectionMetric,
  MetricRow,
} from './contracts';
import { calibrationSectionSchema, INJECTION_RULE_TEXT } from './contracts';
import type { CalibrationPlan, PairJudgement } from './types';

const CONTENT_QUALITY: ArmSpec = {
  armId: 'content-quality@google/gemini-2.5-flash-lite',
  family: 'google',
  isPrimary: true,
  model: 'google/gemini-2.5-flash-lite',
  profileId: 'content-quality',
  promptSource: 'production-code',
};
const EVALUATIONS: ArmSpec = {
  armId: 'evaluations@anthropic/claude-sonnet-5',
  family: 'anthropic',
  isPrimary: true,
  model: 'anthropic/claude-sonnet-5',
  profileId: 'evaluations',
  promptSource: 'stub-stand-in',
};
const CRITERIA: ArmSpec = {
  ...CONTENT_QUALITY,
  armId: 'content-quality+criteria@google/gemini-2.5-flash-lite',
  isPrimary: false,
  profileId: 'content-quality+criteria',
};
const CROSS: ArmSpec = {
  ...CONTENT_QUALITY,
  armId: 'content-quality@openai/gpt-5.6-luna',
  family: 'openai',
  isPrimary: false,
  model: 'openai/gpt-5.6-luna',
};
const ARMS = [CONTENT_QUALITY, EVALUATIONS];
const JUDGE = 'openai/gpt-5.6-luna';
const DIGEST = `sha256:${'0'.repeat(64)}`;

function plan(): CalibrationPlan {
  return {
    brandContext: {
      brands: {
        'synthetic-brand': {
          avoidExamples: [],
          evaluationCriteria: [],
          goodExamples: [],
        },
      },
      schemaVersion: 1,
    },
    crossFamilyModels: [],
    productionProfiles: ['content-quality', 'evaluations'],
    scoringSurface: {
      text: {
        digest: DIGEST,
        files: [],
        values: {
          contentQualityModel: CONTENT_QUALITY.model,
          evaluationTemplates: {
            article: 'article',
            post: 'post',
            system: 'system',
          },
          evaluationsModel: EVALUATIONS.model,
          scoringSchema: 'content_quality_scoring',
        },
      },
      version: 'scoring-surface-v1',
      vision: {
        digest: DIGEST,
        files: [],
        values: {
          mediaRubricVersion: 'synthetic-vision',
          scorerVisionModel: JUDGE,
          visionTemplates: { image: 'image', video: 'video' },
        },
      },
    },
  };
}

function rows(count = 32): FixtureRow[] {
  return Array.from({ length: count }, (_, index) => {
    const band = index % 4;
    return fixtureRowSchema.parse({
      brandFixtureId: 'synthetic-brand',
      contentKind: 'social-post',
      expected: {
        decision: band < 2 ? 'reject' : 'approve',
        scoreBand: { max: (band + 1) / 4, min: band / 4 },
      },
      id: `row-${index}`,
      input: {
        output: `Synthetic output ${index}.`,
        prompt: 'Synthetic prompt.',
      },
      rubricVersion: 'content-quality-v1',
      source: { reference: 'synthetic:brand', visibility: 'synthetic' },
    });
  });
}

function scoresFor(arm: ArmSpec, fixtures: FixtureRow[]): ArmScore[] {
  return fixtures.map((row, index) => {
    const band = index % 4;
    const normalizedScore = (band + 0.5) / 4;
    return {
      armId: arm.armId,
      band,
      brandScore: null,
      callId: `${arm.armId}:${row.id}`,
      contentKind: row.contentKind,
      decision: band < 2 ? 'reject' : 'approve',
      failure: null,
      fixtureId: row.id,
      nativeScore:
        arm.profileId === 'evaluations'
          ? normalizedScore * 100
          : 1 + normalizedScore * 9,
      normalizedScore,
    };
  });
}

function metric(arm: ArmSpec, overrides: Partial<MetricRow> = {}): MetricRow {
  return {
    armId: arm.armId,
    bandKappa: 1,
    bandKappaUnweighted: 1,
    bandRows: 32,
    contentKind: '*',
    decisionKappa: 1,
    decisionRows: 32,
    distribution: {
      bandCounts: [8, 8, 8, 8],
      ceilingRate: 0.25,
      dominantBandShare: 0.25,
      floorRate: 0.25,
      isCompressed: false,
      mean: 0.5,
      standardDeviation: 0.2795,
    },
    maeToBandMidpoint: 0,
    rows: 32,
    scoredBandRows: 32,
    scoredDecisionRows: 32,
    scoredRows: 32,
    spearmanRho: 1,
    voidCount: 0,
    voidRate: 0,
    ...overrides,
  };
}

function injection(overrides: Partial<InjectionMetric> = {}): InjectionMetric {
  return {
    bandKappaDelta: 0,
    bandRows: 30,
    baselineBandKappa: 0.6,
    baselineDecisionKappa: 0.6,
    contentKind: '*',
    decisionKappaDelta: 0.05,
    decisionRows: 30,
    injectedBandKappa: 0.6,
    injectedDecisionKappa: 0.65,
    rows: 30,
    ...overrides,
  };
}

describe('calibration metrics and checks', () => {
  it('a: perfect agreement on 32 rows passes every calibration check', () => {
    const fixtures = rows();
    const scores = ARMS.flatMap((arm) => scoresFor(arm, fixtures));
    const { section, thresholdChecks } = buildCalibrationSection({
      arms: ARMS,
      calls: [],
      harnessJudgeKeys: [JUDGE],
      pairJudgements: [
        {
          approveFirstPreferred: true,
          contentKind: 'social-post',
          judgeRegistryKey: JUDGE,
          rejectFirstPreferred: false,
        },
      ],
      plan: plan(),
      rows: fixtures,
      scores,
      skippedCrossFamily: [],
    });
    expect(calibrationSectionSchema.parse(section)).toEqual(section);
    expect(
      section.metrics.map((entry) => [entry.armId, entry.contentKind]),
    ).toEqual([
      [CONTENT_QUALITY.armId, 'social-post'],
      [CONTENT_QUALITY.armId, '*'],
      [EVALUATIONS.armId, 'social-post'],
      [EVALUATIONS.armId, '*'],
    ]);
    for (const entry of section.metrics) {
      expect(entry).toMatchObject({
        bandKappa: 1,
        bandKappaUnweighted: 1,
        decisionKappa: 1,
        maeToBandMidpoint: 0,
        scoredRows: 32,
        spearmanRho: 1,
        voidRate: 0,
      });
      expect(entry.distribution.bandCounts).toEqual([8, 8, 8, 8]);
    }
    expect(thresholdChecks.every((check) => check.passed)).toBe(true);
    expect(thresholdChecks.map((check) => check.id)).toEqual([
      'calibration-sample',
      'calibration-sample',
      'calibration-band-kappa',
      'calibration-decision-kappa',
      'calibration-band-kappa',
      'calibration-decision-kappa',
      'calibration-band-kappa',
      'calibration-decision-kappa',
      'calibration-band-kappa',
      'calibration-decision-kappa',
      'calibration-void-rate',
      'calibration-void-rate',
      'judge-position-bias',
    ]);
  });

  it('b: 29 labelled rows fail the sample check without kappa checks', () => {
    const fixtures = rows(29);
    const metrics = buildMetricRows(
      CONTENT_QUALITY,
      scoresFor(CONTENT_QUALITY, fixtures),
      fixtures,
      fixtureKinds(fixtures),
    );
    const checks = buildCalibrationChecks(
      [CONTENT_QUALITY],
      metrics,
      [],
      fixtures,
      fixtureKinds(fixtures),
    );
    expect(checks.filter((check) => check.id === 'calibration-sample')).toEqual(
      [
        {
          actual: 29,
          comparator: '>=',
          id: 'calibration-sample',
          passed: false,
          subject: 'social-post',
          threshold: 30,
        },
        {
          actual: 29,
          comparator: '>=',
          id: 'calibration-sample',
          passed: false,
          subject: '*',
          threshold: 30,
        },
      ],
    );
    expect(checks.filter((check) => check.id.includes('kappa'))).toEqual([]);
  });

  it('c: two voids among 30 labelled rows fail kappa checks with actual null', () => {
    const fixtures = rows(30);
    const scores = scoresFor(CONTENT_QUALITY, fixtures).map((score, index) =>
      index < 2
        ? {
            ...score,
            band: null,
            decision: null,
            failure: 'Provider failure',
            nativeScore: null,
            normalizedScore: null,
          }
        : score,
    );
    const metrics = buildMetricRows(
      CONTENT_QUALITY,
      scores,
      fixtures,
      fixtureKinds(fixtures),
    );
    const checks = buildCalibrationChecks(
      [CONTENT_QUALITY],
      metrics,
      [],
      fixtures,
      fixtureKinds(fixtures),
    );
    expect(metrics[0]).toMatchObject({
      bandRows: 30,
      decisionRows: 30,
      scoredBandRows: 28,
      scoredDecisionRows: 28,
      voidCount: 2,
      voidRate: 0.0667,
    });
    expect(checks.filter((check) => check.id.includes('kappa'))).toHaveLength(
      4,
    );
    for (const check of checks.filter((entry) => entry.id.includes('kappa'))) {
      expect(check.actual).toBeNull();
      expect(check.passed).toBe(false);
    }
  });

  it('h: empty data gives null metrics and a failed pooled sample check', () => {
    expect(fixtureKinds([])).toEqual([]);
    const metrics = buildMetricRows(CONTENT_QUALITY, [], [], []);
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      bandKappa: null,
      decisionKappa: null,
      rows: 0,
      scoredRows: 0,
      voidRate: null,
    });
    expect(metrics[0]?.distribution).toEqual({
      bandCounts: [0, 0, 0, 0],
      ceilingRate: null,
      dominantBandShare: null,
      floorRate: null,
      isCompressed: false,
      mean: null,
      standardDeviation: null,
    });
    const analysis = buildCalibrationSection({
      arms: [CONTENT_QUALITY],
      calls: [],
      harnessJudgeKeys: [],
      pairJudgements: [],
      plan: plan(),
      rows: [],
      scores: [],
      skippedCrossFamily: [],
    });
    expect(analysis.section.rubricAlignment.crossJudge).toBeNull();
    expect(analysis.section.crossFamily).toEqual([]);
    expect(analysis.thresholdChecks[0]).toMatchObject({
      actual: 0,
      id: 'calibration-sample',
      passed: false,
      subject: '*',
    });
    expect(
      analysis.thresholdChecks.some((check) => check.id.includes('kappa')),
    ).toBe(false);
  });

  it('counts unlabelled rows without inventing human agreement', () => {
    const fixtures = rows(4).map((row) => ({ ...row, expected: {} }));
    const metrics = buildMetricRows(
      CONTENT_QUALITY,
      scoresFor(CONTENT_QUALITY, fixtures),
      fixtures,
      ['social-post'],
    );
    expect(metrics[0]).toMatchObject({
      bandKappa: null,
      bandRows: 0,
      decisionKappa: null,
      decisionRows: 0,
      maeToBandMidpoint: null,
      scoredRows: 4,
      spearmanRho: null,
    });
  });
});

describe('injection recommendation', () => {
  it('d: settles each specified gain, regression, sample and null boundary', () => {
    expect(recommendInjection(injection(), [])).toBe('keep');
    expect(
      recommendInjection(injection({ decisionKappaDelta: 0.0499 }), []),
    ).toBe('drop');
    expect(
      recommendInjection(injection(), [
        injection({ contentKind: 'article', decisionKappaDelta: -0.0501 }),
      ]),
    ).toBe('drop');
    expect(
      recommendInjection(injection(), [
        injection({ contentKind: 'article', decisionKappaDelta: -0.05 }),
      ]),
    ).toBe('keep');
    expect(recommendInjection(injection({ decisionRows: 29 }), [])).toBe(
      'insufficient',
    );
    expect(
      recommendInjection(injection({ decisionKappaDelta: null }), []),
    ).toBe('drop');
    expect(recommendInjection(injection({ bandKappaDelta: null }), [])).toBe(
      'drop',
    );
    expect(
      recommendInjection(injection({ bandKappaDelta: null, bandRows: 29 }), []),
    ).toBe('keep');
    expect(recommendInjection(injection({ bandKappaDelta: -0.0001 }), [])).toBe(
      'drop',
    );
  });

  it('builds paired deltas only for rows with context and scores on both arms', () => {
    const fixtures = rows();
    const scores = [CONTENT_QUALITY, CRITERIA].flatMap((arm) =>
      scoresFor(arm, fixtures),
    );
    const section = buildInjectionSection(
      [CONTENT_QUALITY, CRITERIA],
      scores,
      fixtures,
      plan(),
    );
    expect(section).toMatchObject({
      missingBrandContextRows: 0,
      recommendation: 'drop',
      rule: INJECTION_RULE_TEXT,
      pooled: {
        bandKappaDelta: 0,
        bandRows: 32,
        baselineBandKappa: 1,
        baselineDecisionKappa: 1,
        contentKind: '*',
        decisionKappaDelta: 0,
        decisionRows: 32,
        injectedBandKappa: 1,
        injectedDecisionKappa: 1,
        rows: 32,
      },
    });
    const missing = fixtures.map((row, index) =>
      index === 0 ? { ...row, brandFixtureId: 'missing-brand' } : row,
    );
    const partial = buildInjectionSection(
      [CONTENT_QUALITY, CRITERIA],
      scores.filter((score) => score.fixtureId !== 'row-1'),
      missing,
      plan(),
    );
    expect(partial).toMatchObject({
      missingBrandContextRows: 1,
      pooled: { rows: 30 },
    });
    expect(buildInjectionSection(ARMS, [], [], plan())).toBeNull();
  });
});

describe('rubric alignment and cross-family comparisons', () => {
  it('e: prefers content-quality within 0.02 and selects no judge below the bar', () => {
    const alignment = buildRubricAlignment(
      ARMS,
      [
        metric(CONTENT_QUALITY, { decisionKappa: 0.7 }),
        metric(EVALUATIONS, { decisionKappa: 0.719 }),
      ],
      [],
    );
    expect(alignment).toMatchObject({
      autoReviewJudge: 'content-quality',
      autoReviewReason: 'tie within 0.02; content-quality stays the consumer',
      mapping: RUBRIC_ALIGNMENT,
    });
    expect(
      buildRubricAlignment(
        ARMS,
        [
          metric(CONTENT_QUALITY, { decisionKappa: 0.5999 }),
          metric(EVALUATIONS, { decisionKappa: 0.5 }),
        ],
        [],
      ),
    ).toMatchObject({
      autoReviewJudge: null,
      autoReviewReason: 'no production judge reaches κ ≥ 0.6',
    });
    expect(
      buildRubricAlignment(
        ARMS,
        [
          metric(CONTENT_QUALITY, { decisionKappa: 0.6 }),
          metric(EVALUATIONS, { decisionKappa: 0.8 }),
        ],
        [],
      ),
    ).toMatchObject({
      autoReviewJudge: 'evaluations',
      autoReviewReason: 'evaluations has the higher decision κ',
    });
    expect(
      buildRubricAlignment(
        ARMS,
        [
          metric(CONTENT_QUALITY, { decisionKappa: 0.68 }),
          metric(EVALUATIONS, { decisionKappa: 0.7 }),
        ],
        [],
      ),
    ).toMatchObject({
      autoReviewJudge: 'evaluations',
      autoReviewReason: 'evaluations has the higher decision κ',
    });
    expect(
      buildRubricAlignment([CONTENT_QUALITY], [metric(CONTENT_QUALITY)], []),
    ).toMatchObject({
      autoReviewJudge: 'content-quality',
      autoReviewReason:
        'content-quality is the only production judge with κ ≥ 0.6',
      crossJudge: null,
    });
  });

  it('f: marks the mean signed difference at 0.1 with 30 paired rows as systematic', () => {
    const fixtures = rows(30);
    const first = scoresFor(CONTENT_QUALITY, fixtures);
    const second = scoresFor(EVALUATIONS, fixtures).map((score) => ({
      ...score,
      normalizedScore: (score.normalizedScore ?? 0) - 0.1,
    }));
    expect(
      buildRubricAlignment(ARMS, [], [...first, ...second]).crossJudge,
    ).toMatchObject({
      bandKappa: 1,
      isSystematic: true,
      largeGapRate: 0,
      meanSignedDifference: 0.1,
      rows: 30,
    });
    expect(
      buildRubricAlignment(
        ARMS,
        [],
        [...first, ...scoresFor(EVALUATIONS, fixtures)],
      ).crossJudge?.isSystematic,
    ).toBe(false);
  });

  it('g: compares cross-family decisions and scores over jointly scored rows', () => {
    const fixtures = rows(4);
    const first = scoresFor(CONTENT_QUALITY, fixtures);
    const second = scoresFor(CROSS, fixtures).map((score, index) =>
      index === 0
        ? {
            ...score,
            band: 3,
            decision: 'approve' as const,
            normalizedScore: 0.875,
          }
        : score,
    );
    expect(
      buildCrossFamilyRows(
        [CONTENT_QUALITY, CROSS],
        [...first, ...second],
        fixtures,
      ),
    ).toEqual([
      {
        bandKappa: 0.1,
        crossArmId: CROSS.armId,
        crossModel: CROSS.model,
        decisionDisagreementRate: 0.25,
        meanAbsoluteDifference: 0.1875,
        primaryArmId: CONTENT_QUALITY.armId,
        profileId: 'content-quality',
        rows: 4,
      },
    ]);
    expect(buildCrossFamilyRows([CROSS], second, fixtures)).toEqual([]);
    expect(
      buildCrossFamilyRows([CONTENT_QUALITY, CROSS], [], fixtures)[0],
    ).toMatchObject({
      bandKappa: null,
      decisionDisagreementRate: null,
      meanAbsoluteDifference: null,
      rows: 0,
    });
  });
});

describe('position bias and provenance', () => {
  it('orders position rows by judge then kind and ignores incomplete pairs', () => {
    const pairs: PairJudgement[] = [
      {
        approveFirstPreferred: true,
        contentKind: 'social-post',
        judgeRegistryKey: JUDGE,
        rejectFirstPreferred: false,
      },
      {
        approveFirstPreferred: false,
        contentKind: 'article',
        judgeRegistryKey: JUDGE,
        rejectFirstPreferred: true,
      },
      {
        approveFirstPreferred: true,
        contentKind: 'article',
        judgeRegistryKey: JUDGE,
        rejectFirstPreferred: true,
      },
      {
        approveFirstPreferred: null,
        contentKind: 'article',
        judgeRegistryKey: JUDGE,
        rejectFirstPreferred: false,
      },
    ];
    const result = buildPositionBiasRows(
      pairs,
      [JUDGE, 'anthropic/claude-sonnet-5'],
      ['social-post', 'article'],
    );
    expect(
      result.map((entry) => [entry.judgeRegistryKey, entry.contentKind]),
    ).toEqual([
      [JUDGE, 'social-post'],
      [JUDGE, 'article'],
      [JUDGE, '*'],
      ['anthropic/claude-sonnet-5', 'social-post'],
      ['anthropic/claude-sonnet-5', 'article'],
      ['anthropic/claude-sonnet-5', '*'],
    ]);
    expect(result[2]).toMatchObject({
      biasedPairs: 1,
      humanAgreementRate: 0.5,
      measuredPairs: 3,
      pairs: 4,
      positionBiasRate: 0.3333,
    });
    expect(pooledPositionBiasRate(pairs)).toBe(0.3333);
    expect(pooledPositionBiasRate([])).toBeNull();
  });

  it('fails the position-bias check for a judge with no measured pair', () => {
    const fixtures = rows();
    const kinds = fixtureKinds(fixtures);
    const unmeasured: PairJudgement[] = [
      {
        approveFirstPreferred: null,
        contentKind: 'social-post',
        judgeRegistryKey: JUDGE,
        rejectFirstPreferred: true,
      },
    ];
    for (const pairs of [[], unmeasured]) {
      const checks = buildCalibrationChecks(
        [CONTENT_QUALITY],
        buildMetricRows(
          CONTENT_QUALITY,
          scoresFor(CONTENT_QUALITY, fixtures),
          fixtures,
          kinds,
        ),
        buildPositionBiasRows(pairs, [JUDGE], kinds),
        fixtures,
        kinds,
      );
      expect(
        checks.find((check) => check.id === 'judge-position-bias'),
      ).toEqual({
        actual: null,
        comparator: '<=',
        id: 'judge-position-bias',
        passed: false,
        subject: JUDGE,
        threshold: 0.05,
      });
    }
  });

  it('records sorted unique model versions and providers only for linked calls', () => {
    const fixtures = rows(4);
    const scores = scoresFor(CONTENT_QUALITY, fixtures);
    const calls: CallProvenance[] = scores.map((score, index) =>
      callProvenanceSchema.parse({
        callId: score.callId,
        completionTokens: 1,
        costEvidence: 'reported',
        costUsd: 0,
        credits: 0,
        family: CONTENT_QUALITY.family,
        isFailed: false,
        kind: 'judge',
        latencyMs: 1,
        model: CONTENT_QUALITY.model,
        modelVersion: index % 2 === 0 ? 'version-z' : 'version-a',
        promptDigest: DIGEST,
        promptTokens: 1,
        provider: index % 2 === 0 ? 'provider-z' : 'provider-a',
        rowId: score.fixtureId,
        rubricDigest: DIGEST,
        rubricVersion: 'content-quality-scorer',
        seed: 7,
        settings: { maxTokens: 1024, temperature: 0.3 },
      }),
    );
    const analysis = buildCalibrationSection({
      arms: ARMS,
      calls,
      harnessJudgeKeys: [],
      pairJudgements: [],
      plan: plan(),
      rows: fixtures,
      scores,
      skippedCrossFamily: [],
    });
    expect(analysis.section.arms[0]).toMatchObject({
      modelVersions: ['version-a', 'version-z'],
      providers: ['provider-a', 'provider-z'],
    });
    expect(analysis.section.arms[1]).toMatchObject({
      modelVersions: [],
      providers: [],
    });
  });
});
