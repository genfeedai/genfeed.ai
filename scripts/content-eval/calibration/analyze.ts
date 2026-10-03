/** Pure calibration analysis over the scores and provenance already collected. */

import type { FixtureRow, ThresholdCheck } from '../contracts';
import { CONTENT_EVAL_THRESHOLDS } from '../contracts';
import { orderedChoice } from '../scorers/pairwise';
import { atLeast, atMost, mean, rate } from '../suites/shared';
import type {
  ArmScore,
  ArmSpec,
  CrossFamilyRow,
  InjectionMetric,
  InjectionRecommendation,
  InjectionSection,
  MetricRow,
  PositionBiasRow,
  RubricAlignment,
  RubricAlignmentRow,
} from './contracts';
import {
  CALIBRATION_SCHEMA_VERSION,
  INJECTION_MAX_KIND_REGRESSION,
  INJECTION_MIN_KAPPA_GAIN,
  INJECTION_RULE_TEXT,
  POOLED_KIND,
  PRODUCTION_PROFILE_IDS,
} from './contracts';
import {
  bandMidpoint,
  cohensKappa,
  humanBand,
  meanAbsoluteError,
  roundMetric,
  scoreDistribution,
  spearmanRho,
} from './statistics';
import type {
  Band,
  CalibrationAnalysis,
  CalibrationAnalysisInput,
  CalibrationPlan,
  PairJudgement,
} from './types';

export const RUBRIC_ALIGNMENT: readonly RubricAlignmentRow[] = [
  { evaluationsDimension: 'engagement', scorerCriterion: 'Hook strength' },
  {
    evaluationsDimension: 'technical',
    scorerCriterion: 'Clarity & conciseness',
  },
  { evaluationsDimension: 'persuasion', scorerCriterion: 'CTA presence' },
  {
    evaluationsDimension: 'engagement',
    scorerCriterion: 'Engagement potential',
  },
  { evaluationsDimension: 'technical', scorerCriterion: 'Readability' },
  {
    evaluationsDimension: 'persuasion',
    scorerCriterion: 'Emotional resonance',
  },
  { evaluationsDimension: 'brand', scorerCriterion: null },
];

type ScoredArmScore = ArmScore & {
  band: Band;
  decision: 'approve' | 'reject';
  nativeScore: number;
  normalizedScore: number;
};
type PairedScores = {
  first: ScoredArmScore;
  row: FixtureRow;
  second: ScoredArmScore;
};

function scoreKey(armId: string, fixtureId: string): string {
  return `${armId}\\^@${fixtureId}`;
}

function scoresByKey(scores: ArmScore[]): Map<string, ArmScore> {
  return new Map(
    scores.map((score) => [scoreKey(score.armId, score.fixtureId), score]),
  );
}

function isScored(score: ArmScore | undefined): score is ScoredArmScore {
  return (
    score !== undefined &&
    score.nativeScore !== null &&
    score.band !== null &&
    score.decision !== null &&
    score.normalizedScore !== null
  );
}

function rounded(value: number | null): number | null {
  return value === null ? null : roundMetric(value);
}

function roundedRate(count: number, total: number): number | null {
  return rounded(rate(count, total));
}

function rowsForKind(rows: FixtureRow[], kind: string): FixtureRow[] {
  return kind === POOLED_KIND
    ? rows
    : rows.filter((row) => row.contentKind === kind);
}

export function fixtureKinds(rows: FixtureRow[]): string[] {
  return [...new Set(rows.map((row) => row.contentKind))].filter(
    (kind) => kind !== POOLED_KIND,
  );
}

function metricForRows(
  arm: ArmSpec,
  scores: Map<string, ArmScore>,
  rows: FixtureRow[],
  contentKind: string,
): MetricRow {
  const bandPairs: Array<readonly [number, number]> = [];
  const decisionPairs: Array<readonly [number, number]> = [];
  const predicted: number[] = [];
  const humanPoints: number[] = [];
  const scored: ScoredArmScore[] = [];
  let bandRows = 0;
  let decisionRows = 0;
  for (const row of rows) {
    const score = scores.get(scoreKey(arm.armId, row.id));
    const band = row.expected.scoreBand;
    const decision = row.expected.decision;
    if (band !== undefined) bandRows += 1;
    if (decision !== undefined) decisionRows += 1;
    if (!isScored(score)) continue;
    scored.push(score);
    if (band !== undefined) {
      bandPairs.push([score.band, humanBand(band)]);
      predicted.push(score.normalizedScore);
      humanPoints.push(bandMidpoint(band));
    }
    if (decision !== undefined) {
      decisionPairs.push([
        score.decision === 'approve' ? 1 : 0,
        decision === 'approve' ? 1 : 0,
      ]);
    }
  }
  const voidCount = rows.length - scored.length;
  return {
    armId: arm.armId,
    bandKappa: cohensKappa(bandPairs, 4, 'quadratic'),
    bandKappaUnweighted: cohensKappa(bandPairs, 4, 'unweighted'),
    bandRows,
    contentKind,
    decisionKappa: cohensKappa(decisionPairs, 2, 'unweighted'),
    decisionRows,
    distribution: scoreDistribution(scored),
    maeToBandMidpoint: meanAbsoluteError(predicted, humanPoints),
    rows: rows.length,
    scoredBandRows: bandPairs.length,
    scoredDecisionRows: decisionPairs.length,
    scoredRows: scored.length,
    spearmanRho: spearmanRho(predicted, humanPoints),
    voidCount,
    voidRate: roundedRate(voidCount, rows.length),
  };
}

export function buildMetricRows(
  arm: ArmSpec,
  scores: ArmScore[],
  rows: FixtureRow[],
  kinds: string[],
): MetricRow[] {
  const indexed = scoresByKey(scores);
  return [...kinds, POOLED_KIND].map((kind) =>
    metricForRows(arm, indexed, rowsForKind(rows, kind), kind),
  );
}

export function pooledPositionBiasRate(
  judgements: PairJudgement[],
): number | null {
  const choices = judgements.map((pair) =>
    orderedChoice(pair.approveFirstPreferred, pair.rejectFirstPreferred),
  );
  return roundedRate(
    choices.filter((choice) => choice.isPositionBiased === true).length,
    choices.filter((choice) => choice.isPositionBiased !== null).length,
  );
}

export function buildPositionBiasRows(
  judgements: PairJudgement[],
  judgeKeys: string[],
  kinds: string[],
): PositionBiasRow[] {
  return judgeKeys.flatMap((judgeRegistryKey) =>
    [...kinds, POOLED_KIND].map((contentKind) => {
      const pairs = judgements.filter(
        (pair) =>
          pair.judgeRegistryKey === judgeRegistryKey &&
          (contentKind === POOLED_KIND || pair.contentKind === contentKind),
      );
      const choices = pairs.map((pair) =>
        orderedChoice(pair.approveFirstPreferred, pair.rejectFirstPreferred),
      );
      const unbiased = choices.filter(
        (choice) => choice.isPositionBiased === false,
      );
      return {
        biasedPairs: choices.filter(
          (choice) => choice.isPositionBiased === true,
        ).length,
        contentKind,
        humanAgreementRate: roundedRate(
          unbiased.filter((choice) => choice.choice === 'a').length,
          unbiased.length,
        ),
        judgeRegistryKey,
        measuredPairs: choices.filter(
          (choice) => choice.isPositionBiased !== null,
        ).length,
        pairs: pairs.length,
        positionBiasRate: pooledPositionBiasRate(pairs),
      };
    }),
  );
}

function pairedScores(
  first: ArmSpec,
  second: ArmSpec,
  scores: ArmScore[],
  rows: FixtureRow[],
): PairedScores[] {
  const indexed = scoresByKey(scores);
  return rows.flatMap((row) => {
    const firstScore = indexed.get(scoreKey(first.armId, row.id));
    const secondScore = indexed.get(scoreKey(second.armId, row.id));
    return isScored(firstScore) && isScored(secondScore)
      ? [{ first: firstScore, row, second: secondScore }]
      : [];
  });
}

function bandPairsOf(pairs: PairedScores[]): Array<readonly [number, number]> {
  return pairs.map(({ first, second }) => [first.band, second.band]);
}

export function buildCrossFamilyRows(
  arms: ArmSpec[],
  scores: ArmScore[],
  rows: FixtureRow[],
): CrossFamilyRow[] {
  const byId = new Map(arms.map((arm) => [arm.armId, arm]));
  return PRODUCTION_PROFILE_IDS.flatMap((profileId) => {
    const primary = arms.find(
      (arm) => arm.isPrimary && arm.profileId === profileId,
    );
    if (primary === undefined) return [];
    return arms
      .filter((arm) => !arm.isPrimary && arm.profileId === profileId)
      .flatMap((arm) => {
        const cross = byId.get(arm.armId);
        if (cross === undefined) return [];
        const pairs = pairedScores(primary, cross, scores, rows);
        return [
          {
            bandKappa: cohensKappa(bandPairsOf(pairs), 4, 'quadratic'),
            crossArmId: cross.armId,
            crossModel: cross.model,
            decisionDisagreementRate: roundedRate(
              pairs.filter(
                ({ first, second }) => first.decision !== second.decision,
              ).length,
              pairs.length,
            ),
            meanAbsoluteDifference: meanAbsoluteError(
              pairs.map(({ first }) => first.normalizedScore),
              pairs.map(({ second }) => second.normalizedScore),
            ),
            primaryArmId: primary.armId,
            profileId,
            rows: pairs.length,
          },
        ];
      });
  });
}

function delta(
  injected: number | null,
  baseline: number | null,
): number | null {
  return injected === null || baseline === null
    ? null
    : roundMetric(injected - baseline);
}

function injectionMetric(
  contentKind: string,
  pairs: PairedScores[],
): InjectionMetric {
  const baselineBands: Array<readonly [number, number]> = [];
  const injectedBands: Array<readonly [number, number]> = [];
  const baselineDecisions: Array<readonly [number, number]> = [];
  const injectedDecisions: Array<readonly [number, number]> = [];
  for (const { first, row, second } of pairs) {
    if (row.expected.scoreBand !== undefined) {
      const band = humanBand(row.expected.scoreBand);
      baselineBands.push([first.band, band]);
      injectedBands.push([second.band, band]);
    }
    if (row.expected.decision !== undefined) {
      const decision = row.expected.decision === 'approve' ? 1 : 0;
      baselineDecisions.push([first.decision === 'approve' ? 1 : 0, decision]);
      injectedDecisions.push([second.decision === 'approve' ? 1 : 0, decision]);
    }
  }
  const baselineBandKappa = cohensKappa(baselineBands, 4, 'quadratic');
  const injectedBandKappa = cohensKappa(injectedBands, 4, 'quadratic');
  const baselineDecisionKappa = cohensKappa(baselineDecisions, 2, 'unweighted');
  const injectedDecisionKappa = cohensKappa(injectedDecisions, 2, 'unweighted');
  return {
    bandKappaDelta: delta(injectedBandKappa, baselineBandKappa),
    bandRows: baselineBands.length,
    baselineBandKappa,
    baselineDecisionKappa,
    contentKind,
    decisionKappaDelta: delta(injectedDecisionKappa, baselineDecisionKappa),
    decisionRows: baselineDecisions.length,
    injectedBandKappa,
    injectedDecisionKappa,
    rows: pairs.length,
  };
}

export function recommendInjection(
  pooled: InjectionMetric,
  perKind: InjectionMetric[],
): InjectionRecommendation {
  const minimum = CONTENT_EVAL_THRESHOLDS.calibrationMinRows;
  if (pooled.decisionRows < minimum) return 'insufficient';
  const hasDecisionGain =
    pooled.decisionKappaDelta !== null &&
    pooled.decisionKappaDelta >= INJECTION_MIN_KAPPA_GAIN;
  const hasBandGain =
    pooled.bandRows < minimum ||
    (pooled.bandKappaDelta !== null && pooled.bandKappaDelta >= 0);
  const hasNoKindRegression = perKind.every(
    (metric) =>
      metric.decisionRows < minimum ||
      (metric.decisionKappaDelta !== null &&
        metric.decisionKappaDelta >= -INJECTION_MAX_KIND_REGRESSION),
  );
  return hasDecisionGain && hasBandGain && hasNoKindRegression
    ? 'keep'
    : 'drop';
}

export function buildInjectionSection(
  arms: ArmSpec[],
  scores: ArmScore[],
  rows: FixtureRow[],
  plan: CalibrationPlan,
): InjectionSection | null {
  const criteria = arms.find(
    (arm) => arm.profileId === 'content-quality+criteria',
  );
  if (criteria === undefined) return null;
  const primary = arms.find(
    (arm) => arm.isPrimary && arm.profileId === 'content-quality',
  );
  const brands = new Map(Object.entries(plan.brandContext?.brands ?? {}));
  const withContext = rows.filter(
    (row) => brands.get(row.brandFixtureId) !== undefined,
  );
  const pairs =
    primary === undefined
      ? []
      : pairedScores(primary, criteria, scores, withContext);
  const perKind = fixtureKinds(rows).map((kind) =>
    injectionMetric(
      kind,
      pairs.filter(({ row }) => row.contentKind === kind),
    ),
  );
  const pooled = injectionMetric(POOLED_KIND, pairs);
  return {
    missingBrandContextRows: rows.length - withContext.length,
    perKind,
    pooled,
    recommendation: recommendInjection(pooled, perKind),
    rule: INJECTION_RULE_TEXT,
  };
}

export function buildRubricAlignment(
  arms: ArmSpec[],
  metrics: MetricRow[],
  scores: ArmScore[],
): RubricAlignment {
  const primary = arms.filter((arm) => arm.isPrimary);
  const candidates = primary.flatMap((arm) => {
    if (
      arm.profileId !== 'content-quality' &&
      arm.profileId !== 'evaluations'
    ) {
      return [];
    }
    const metric = metrics.find(
      (entry) => entry.armId === arm.armId && entry.contentKind === POOLED_KIND,
    );
    return metric !== undefined &&
      metric.scoredDecisionRows >= CONTENT_EVAL_THRESHOLDS.calibrationMinRows &&
      metric.decisionKappa !== null &&
      metric.decisionKappa >= CONTENT_EVAL_THRESHOLDS.judgeMinKappa
      ? [{ kappa: metric.decisionKappa, profileId: arm.profileId }]
      : [];
  });
  const contentQuality = candidates.find(
    (candidate) => candidate.profileId === 'content-quality',
  );
  const evaluations = candidates.find(
    (candidate) => candidate.profileId === 'evaluations',
  );
  const alignment: RubricAlignment = {
    autoReviewJudge: null,
    autoReviewReason: 'no production judge reaches κ ≥ 0.6',
    crossJudge: null,
    mapping: [...RUBRIC_ALIGNMENT],
  };
  if (contentQuality !== undefined && evaluations !== undefined) {
    if (
      Math.abs(roundMetric(contentQuality.kappa - evaluations.kappa)) < 0.02
    ) {
      alignment.autoReviewJudge = 'content-quality';
      alignment.autoReviewReason =
        'tie within 0.02; content-quality stays the consumer';
    } else {
      const winner =
        contentQuality.kappa > evaluations.kappa ? contentQuality : evaluations;
      alignment.autoReviewJudge = winner.profileId;
      alignment.autoReviewReason = `${winner.profileId} has the higher decision κ`;
    }
  } else {
    const only = contentQuality ?? evaluations;
    if (only !== undefined) {
      alignment.autoReviewJudge = only.profileId;
      alignment.autoReviewReason = `${only.profileId} is the only production judge with κ ≥ 0.6`;
    }
  }
  const first = primary.find((arm) => arm.profileId === 'content-quality');
  const second = primary.find((arm) => arm.profileId === 'evaluations');
  if (first !== undefined && second !== undefined) {
    const indexed = new Map(scores.map((score) => [score.fixtureId, score]));
    const byKey = scoresByKey(scores);
    const pairs = [...indexed.keys()].flatMap((fixtureId) => {
      const firstScore = byKey.get(scoreKey(first.armId, fixtureId));
      const secondScore = byKey.get(scoreKey(second.armId, fixtureId));
      return isScored(firstScore) && isScored(secondScore)
        ? [{ first: firstScore, second: secondScore }]
        : [];
    });
    const bandPairs: Array<readonly [number, number]> = pairs.map(
      ({ first: a, second: b }) => [a.band, b.band],
    );
    const bandKappa = cohensKappa(bandPairs, 4, 'quadratic');
    const meanSignedDifference = rounded(
      mean(
        pairs.map(
          ({ first: a, second: b }) => a.normalizedScore - b.normalizedScore,
        ),
      ),
    );
    alignment.crossJudge = {
      bandKappa,
      isSystematic:
        pairs.length >= CONTENT_EVAL_THRESHOLDS.calibrationMinRows &&
        ((meanSignedDifference !== null &&
          Math.abs(meanSignedDifference) >= 0.1) ||
          (bandKappa !== null && bandKappa < 0.4)),
      largeGapRate: roundedRate(
        pairs.filter(
          ({ first: a, second: b }) => Math.abs(a.band - b.band) >= 2,
        ).length,
        pairs.length,
      ),
      meanSignedDifference,
      rows: pairs.length,
    };
  }
  return alignment;
}

export function buildCalibrationChecks(
  arms: ArmSpec[],
  metrics: MetricRow[],
  positionBias: PositionBiasRow[],
  rows: FixtureRow[],
  kinds: string[],
): ThresholdCheck[] {
  const checks: ThresholdCheck[] = [];
  const thresholds = CONTENT_EVAL_THRESHOLDS;
  for (const kind of [...kinds, POOLED_KIND]) {
    const subset = rowsForKind(rows, kind);
    checks.push(
      atLeast(
        'calibration-sample',
        kind,
        Math.max(
          subset.filter((row) => row.expected.scoreBand !== undefined).length,
          subset.filter((row) => row.expected.decision !== undefined).length,
        ),
        thresholds.calibrationMinRows,
      ),
    );
  }
  const primary = arms.filter((arm) => arm.isPrimary);
  for (const arm of primary) {
    for (const kind of [...kinds, POOLED_KIND]) {
      const metric = metrics.find(
        (entry) => entry.armId === arm.armId && entry.contentKind === kind,
      );
      if (metric === undefined) continue;
      if (metric.bandRows >= thresholds.calibrationMinRows) {
        checks.push(
          atLeast(
            'calibration-band-kappa',
            `${arm.armId}:${kind}`,
            metric.scoredBandRows >= thresholds.calibrationMinRows
              ? metric.bandKappa
              : null,
            thresholds.judgeMinKappa,
          ),
        );
      }
      if (metric.decisionRows >= thresholds.calibrationMinRows) {
        checks.push(
          atLeast(
            'calibration-decision-kappa',
            `${arm.armId}:${kind}`,
            metric.scoredDecisionRows >= thresholds.calibrationMinRows
              ? metric.decisionKappa
              : null,
            thresholds.judgeMinKappa,
          ),
        );
      }
    }
  }
  for (const arm of primary) {
    const metric = metrics.find(
      (entry) => entry.armId === arm.armId && entry.contentKind === POOLED_KIND,
    );
    checks.push(
      atMost(
        'calibration-void-rate',
        arm.armId,
        metric?.voidRate ?? null,
        thresholds.maxVoidRate,
      ),
    );
  }
  for (const metric of positionBias.filter(
    (entry) => entry.contentKind === POOLED_KIND,
  )) {
    const check = atMost(
      'judge-position-bias',
      metric.judgeRegistryKey,
      metric.positionBiasRate,
      thresholds.maxPositionBiasRate,
    );
    // A judge with no measured swapped pair has no position-bias evidence, so
    // its null rate fails rather than passing as `atMost` would.
    checks.push({
      ...check,
      passed: check.passed && metric.positionBiasRate !== null,
    });
  }
  return checks;
}

export function buildCalibrationSection(
  input: CalibrationAnalysisInput,
): CalibrationAnalysis {
  const {
    arms,
    calls,
    harnessJudgeKeys,
    pairJudgements,
    plan,
    rows,
    scores,
    skippedCrossFamily,
  } = input;
  const kinds = fixtureKinds(rows);
  const metrics = arms.flatMap((arm) =>
    buildMetricRows(arm, scores, rows, kinds),
  );
  const positionBias = buildPositionBiasRows(
    pairJudgements,
    harnessJudgeKeys,
    kinds,
  );
  const byCallId = new Map(calls.map((call) => [call.callId, call]));
  return {
    section: {
      arms: arms.map((arm) => {
        const armCalls = scores
          .filter((score) => score.armId === arm.armId)
          .flatMap((score) => {
            const call =
              score.callId === null ? undefined : byCallId.get(score.callId);
            return call === undefined ? [] : [call];
          });
        return {
          ...arm,
          modelVersions: [
            ...new Set(armCalls.map((call) => call.modelVersion)),
          ].sort(),
          providers: [...new Set(armCalls.map((call) => call.provider))].sort(),
        };
      }),
      crossFamily: buildCrossFamilyRows(arms, scores, rows),
      injection: buildInjectionSection(arms, scores, rows, plan),
      metrics,
      pointwisePositionBias: 'not-applicable-pointwise',
      positionBias,
      rubricAlignment: buildRubricAlignment(arms, metrics, scores),
      schemaVersion: CALIBRATION_SCHEMA_VERSION,
      scores,
      scoringSurface: {
        textDigest: plan.scoringSurface.text.digest,
        visionDigest: plan.scoringSurface.vision.digest,
      },
      skippedCrossFamily,
      vision: null,
    },
    thresholdChecks: buildCalibrationChecks(
      arms,
      metrics,
      positionBias,
      rows,
      kinds,
    ),
  };
}
