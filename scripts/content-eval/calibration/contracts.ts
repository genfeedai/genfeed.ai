import { z } from 'zod';
import { humanDecisionSchema, thresholdCheckSchema } from '../rows';

const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const int = z.number().int().nonnegative();
const rate = z.number().min(0).max(1).nullable();
const kappa = z.number().max(1).nullable();

export const CALIBRATION_SCHEMA_VERSION = 1;
export const EVALUATIONS_JUDGE_SCHEMA_NAME =
  'content_eval_evaluations_response';
export const POOLED_KIND = '*';
export const SCORING_SURFACE_VERSION = 'scoring-surface-v1';
export const SCORING_SURFACE_LOCK_PATH =
  'scripts/content-eval/calibration/scoring-surface.lock.json';
export const INJECTION_MIN_KAPPA_GAIN = 0.05;
export const INJECTION_MAX_KIND_REGRESSION = 0.05;
export const INJECTION_RULE_TEXT =
  'keep iff pooled decision kappa delta >= 0.05, pooled band rows < 30 or pooled band kappa delta >= 0, and every kind with >= 30 decision rows has decision kappa delta >= -0.05; insufficient when pooled decision rows < 30; otherwise drop; a null delta fails its condition';

export const PRODUCTION_PROFILE_IDS = [
  'content-quality',
  'evaluations',
] as const;
export type ProductionProfileId = (typeof PRODUCTION_PROFILE_IDS)[number];
export const ARM_PROFILE_IDS = [
  'content-quality',
  'evaluations',
  'content-quality+criteria',
  'harness-rubric',
] as const;
export type ArmProfileId = (typeof ARM_PROFILE_IDS)[number];
export const PROMPT_SOURCES = [
  'production-code',
  'stub-stand-in',
  'database-templates',
  'harness',
] as const;
export const INJECTION_RECOMMENDATIONS = [
  'keep',
  'drop',
  'insufficient',
] as const;
export type InjectionRecommendation =
  (typeof INJECTION_RECOMMENDATIONS)[number];
export const EVALUATIONS_DIMENSIONS = [
  'brand',
  'engagement',
  'persuasion',
  'technical',
] as const;

export const armSpecSchema = z.object({
  armId: z.string().min(1),
  family: z.string().min(1),
  isPrimary: z.boolean(),
  model: z.string().min(1),
  profileId: z.enum(ARM_PROFILE_IDS),
  promptSource: z.enum(PROMPT_SOURCES),
});
export const armRecordSchema = armSpecSchema.extend({
  modelVersions: z.array(z.string()), // sorted unique provenance.modelVersion of the arm's calls
  providers: z.array(z.string()), // sorted unique provenance.provider of the arm's calls
});

export const armScoreSchema = z.object({
  armId: z.string().min(1),
  band: z.number().int().min(0).max(3).nullable(),
  brandScore: z.number().nullable(),
  callId: z.string().nullable(),
  contentKind: z.string().min(1),
  decision: humanDecisionSchema.nullable(), // the judge's decision (D-5 approveAt)
  failure: z.string().nullable(),
  fixtureId: z.string().min(1),
  nativeScore: z.number().nullable(),
  normalizedScore: z.number().min(0).max(1).nullable(),
});

export const scoreDistributionSchema = z.object({
  bandCounts: z.tuple([int, int, int, int]),
  ceilingRate: rate,
  dominantBandShare: rate,
  floorRate: rate,
  isCompressed: z.boolean(),
  mean: z.number().min(0).max(1).nullable(),
  standardDeviation: z.number().nonnegative().nullable(),
});

export const metricRowSchema = z.object({
  armId: z.string().min(1),
  bandKappa: kappa,
  bandKappaUnweighted: kappa,
  bandRows: int,
  contentKind: z.string().min(1), // a kind or POOLED_KIND
  decisionKappa: kappa,
  decisionRows: int,
  distribution: scoreDistributionSchema,
  maeToBandMidpoint: z.number().min(0).max(1).nullable(),
  rows: int,
  scoredBandRows: int,
  scoredDecisionRows: int,
  scoredRows: int,
  spearmanRho: z.number().min(-1).max(1).nullable(),
  voidCount: int,
  voidRate: rate,
});

export const positionBiasRowSchema = z.object({
  biasedPairs: int,
  contentKind: z.string().min(1),
  humanAgreementRate: rate,
  judgeRegistryKey: z.string().min(1),
  measuredPairs: int,
  pairs: int,
  positionBiasRate: rate,
});

export const crossFamilyRowSchema = z.object({
  bandKappa: kappa,
  crossArmId: z.string().min(1),
  crossModel: z.string().min(1),
  decisionDisagreementRate: rate,
  meanAbsoluteDifference: z.number().min(0).max(1).nullable(),
  primaryArmId: z.string().min(1),
  profileId: z.enum(PRODUCTION_PROFILE_IDS),
  rows: int,
});
export const skippedCrossFamilySchema = z.object({
  model: z.string().min(1),
  profileId: z.enum(PRODUCTION_PROFILE_IDS),
  reason: z.literal('same-family'),
});

export const injectionMetricSchema = z.object({
  bandKappaDelta: z.number().nullable(),
  bandRows: int,
  baselineBandKappa: kappa,
  baselineDecisionKappa: kappa,
  contentKind: z.string().min(1),
  decisionKappaDelta: z.number().nullable(),
  decisionRows: int,
  injectedBandKappa: kappa,
  injectedDecisionKappa: kappa,
  rows: int,
});
export const injectionSectionSchema = z.object({
  missingBrandContextRows: int,
  perKind: z.array(injectionMetricSchema),
  pooled: injectionMetricSchema, // contentKind === POOLED_KIND
  recommendation: z.enum(INJECTION_RECOMMENDATIONS),
  rule: z.literal(INJECTION_RULE_TEXT),
});

export const rubricAlignmentRowSchema = z.object({
  evaluationsDimension: z.enum(EVALUATIONS_DIMENSIONS),
  scorerCriterion: z.string().min(1).nullable(),
});
export const crossJudgeSchema = z.object({
  bandKappa: kappa,
  isSystematic: z.boolean(),
  largeGapRate: rate,
  meanSignedDifference: z.number().min(-1).max(1).nullable(),
  rows: int,
});
export const rubricAlignmentSchema = z.object({
  autoReviewJudge: z.enum(PRODUCTION_PROFILE_IDS).nullable(),
  autoReviewReason: z.string().min(1),
  crossJudge: crossJudgeSchema.nullable(),
  mapping: z.array(rubricAlignmentRowSchema),
});

export const scoringSurfaceDigestsSchema = z.object({
  textDigest: digestSchema,
  visionDigest: digestSchema,
});

export const calibrationSectionSchema = z.object({
  arms: z.array(armRecordSchema),
  crossFamily: z.array(crossFamilyRowSchema),
  injection: injectionSectionSchema.nullable(),
  metrics: z.array(metricRowSchema),
  pointwisePositionBias: z.literal('not-applicable-pointwise'),
  positionBias: z.array(positionBiasRowSchema),
  rubricAlignment: rubricAlignmentSchema,
  schemaVersion: z.literal(CALIBRATION_SCHEMA_VERSION),
  scores: z.array(armScoreSchema),
  scoringSurface: scoringSurfaceDigestsSchema,
  skippedCrossFamily: z.array(skippedCrossFamilySchema),
  vision: z.null(),
});

export const calibrationSummarySchema = z.object({
  calibration: calibrationSectionSchema.omit({ scores: true }),
  evidenceKind: z.enum(['stub-dispatcher', 'live-dispatcher']),
  fixture: z.object({
    digest: digestSchema,
    path: z.string().min(1),
    rowCount: int,
  }),
  generatedAt: z.iso.datetime(),
  kind: z.literal('content-eval-calibration-summary'),
  passed: z.boolean(),
  runId: z.string().min(1),
  schemaVersion: z.literal(CALIBRATION_SCHEMA_VERSION),
  scoringSurface: scoringSurfaceDigestsSchema,
  sourceRevision: z.string().regex(/^[0-9a-f]{40}$/),
  spend: z.object({
    callCount: int,
    spentCredits: z.number().nonnegative(),
    spentUsd: z.number().nonnegative(),
  }),
  thresholdChecks: z.array(thresholdCheckSchema),
  thresholdsVersion: z.string().min(1),
  workingTreeDirty: z.boolean(),
});

export const brandContextEntrySchema = z.object({
  avoidExamples: z.array(z.string().min(1)),
  evaluationCriteria: z.array(z.string().min(1)),
  goodExamples: z.array(z.string().min(1)),
});
export const brandContextFileSchema = z.object({
  brands: z.record(z.string().min(1), brandContextEntrySchema),
  schemaVersion: z.literal(1),
});

export const surfaceFileSchema = z.object({
  digest: digestSchema,
  path: z.string().min(1),
});
export const textSurfaceValuesSchema = z.object({
  contentQualityModel: z.string().min(1),
  evaluationTemplates: z.object({
    article: z.string().min(1),
    post: z.string().min(1),
    system: z.string().min(1),
  }),
  evaluationsModel: z.string().min(1),
  scoringSchema: z.string().min(1),
});
export const visionSurfaceValuesSchema = z.object({
  mediaRubricVersion: z.string().min(1),
  scorerVisionModel: z.string().min(1),
  visionTemplates: z.object({
    image: z.string().min(1),
    video: z.string().min(1),
  }),
});
export const scoringSurfaceSchema = z.object({
  text: z.object({
    digest: digestSchema,
    files: z.array(surfaceFileSchema),
    values: textSurfaceValuesSchema,
  }),
  version: z.literal(SCORING_SURFACE_VERSION),
  vision: z.object({
    digest: digestSchema,
    files: z.array(surfaceFileSchema),
    values: visionSurfaceValuesSchema,
  }),
});
// The lock file content is exactly a ScoringSurface.

const evaluationsDimensionScoreSchema = z.object({
  overall: z.number().min(0).max(100),
});
export const evaluationsJudgeResponseSchema = z.object({
  overallScore: z.number().min(0).max(100),
  scores: z.object({
    brand: evaluationsDimensionScoreSchema,
    engagement: evaluationsDimensionScoreSchema,
    technical: evaluationsDimensionScoreSchema,
  }),
  strengths: z.array(z.string()),
  suggestions: z.array(z.string()),
  weaknesses: z.array(z.string()),
});
export const evaluationsResultSchema = z
  .object({
    overallScore: z.number(),
    scores: z
      .object({ brand: z.object({ overall: z.number() }).loose().optional() })
      .loose(),
  })
  .loose();

export type ArmSpec = z.infer<typeof armSpecSchema>;
export type ArmRecord = z.infer<typeof armRecordSchema>;
export type ArmScore = z.infer<typeof armScoreSchema>;
export type ScoreDistribution = z.infer<typeof scoreDistributionSchema>;
export type MetricRow = z.infer<typeof metricRowSchema>;
export type PositionBiasRow = z.infer<typeof positionBiasRowSchema>;
export type CrossFamilyRow = z.infer<typeof crossFamilyRowSchema>;
export type SkippedCrossFamily = z.infer<typeof skippedCrossFamilySchema>;
export type InjectionMetric = z.infer<typeof injectionMetricSchema>;
export type InjectionSection = z.infer<typeof injectionSectionSchema>;
export type RubricAlignmentRow = z.infer<typeof rubricAlignmentRowSchema>;
export type CrossJudge = z.infer<typeof crossJudgeSchema>;
export type RubricAlignment = z.infer<typeof rubricAlignmentSchema>;
export type ScoringSurfaceDigests = z.infer<typeof scoringSurfaceDigestsSchema>;
export type CalibrationSection = z.infer<typeof calibrationSectionSchema>;
export type CalibrationSummary = z.infer<typeof calibrationSummarySchema>;
export type BrandContextEntry = z.infer<typeof brandContextEntrySchema>;
export type BrandContextFile = z.infer<typeof brandContextFileSchema>;
export type SurfaceFile = z.infer<typeof surfaceFileSchema>;
export type TextSurfaceValues = z.infer<typeof textSurfaceValuesSchema>;
export type VisionSurfaceValues = z.infer<typeof visionSurfaceValuesSchema>;
export type ScoringSurface = z.infer<typeof scoringSurfaceSchema>;
export type EvaluationsJudgeResponse = z.infer<
  typeof evaluationsJudgeResponseSchema
>;
export type EvaluationsResult = z.infer<typeof evaluationsResultSchema>;
