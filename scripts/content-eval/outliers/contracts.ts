/**
 * Outlier contracts for content-eval run reports (#5234).
 *
 * Averages hide the cases that explain a run: the output a judge loved and a
 * human rejected, the contestant with a good mean and a bad tail, the
 * generation that cost ten times the median. The analyzer reads scores the run
 * already produced (no provider calls) and emits a capped, reviewable section.
 */

import { z } from 'zod';

export const OUTLIER_CLASSES = [
  'judge_human_disagreement',
  'judge_disagreement',
  'extreme_score',
  'cost_latency',
] as const;

export const outlierClassSchema = z.enum(OUTLIER_CLASSES);
export type OutlierClass = z.infer<typeof outlierClassSchema>;

export const fixtureVisibilitySchema = z.enum(['synthetic', 'private']);
export type FixtureVisibility = z.infer<typeof fixtureVisibilitySchema>;

const unitScoreSchema = z.number().min(0).max(1);

/**
 * Versioned run configuration. The report records the thresholds it used, so
 * a rate is always read against the cut that produced it.
 */
export const outlierThresholdsSchema = z
  .object({
    version: z.string().min(1),
    /** Judge score may sit this far outside the human band before it counts. */
    judgeHumanBandTolerance: z.number().min(0).max(1),
    /** Max − min judge score on one case above which the panel disagrees. */
    judgeSpreadMax: z.number().min(0).max(1),
    /** Lower/upper percentiles per content kind × contestant. */
    extremeScoreLowPercentile: unitScoreSchema,
    extremeScoreHighPercentile: unitScoreSchema,
    /** Smaller groups make percentiles noise; they are skipped and counted. */
    extremeScoreMinGroupSize: z.number().int().min(2),
    /** Multiple of the run median above which a case is a cost/latency outlier. */
    costMultiple: z.number().gt(1),
    latencyMultiple: z.number().gt(1),
    /** Reported cases per class × contestant; totals are always complete. */
    maxCasesPerClassAndContestant: z.number().int().min(1),
  })
  .refine(
    (thresholds) =>
      thresholds.extremeScoreLowPercentile <
      thresholds.extremeScoreHighPercentile,
    { message: 'extremeScoreLowPercentile must be below the high percentile' },
  );
export type OutlierThresholds = z.infer<typeof outlierThresholdsSchema>;

/** Conservative starting cut; tune on the first real runs (#5234 risks). */
export const DEFAULT_OUTLIER_THRESHOLDS: OutlierThresholds = {
  version: 'outlier-thresholds-v1',
  judgeHumanBandTolerance: 0.1,
  judgeSpreadMax: 0.4,
  extremeScoreLowPercentile: 0.05,
  extremeScoreHighPercentile: 0.95,
  extremeScoreMinGroupSize: 10,
  costMultiple: 5,
  latencyMultiple: 5,
  maxCasesPerClassAndContestant: 5,
};

export const outlierContestantSchema = z.object({
  id: z.string().min(1),
  registryKey: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  modelVersion: z.string().nullable(),
  family: z.string().min(1),
  isCompiled: z.boolean(),
});
export type OutlierContestant = z.infer<typeof outlierContestantSchema>;

export const pairwiseChoiceSchema = z.enum(['a', 'b', 'tie']);

export const outlierVoteSchema = z.object({
  judgeRegistryKey: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  modelVersion: z.string().nullable(),
  family: z.string().min(1),
  score: unitScoreSchema.nullable(),
  choice: pairwiseChoiceSchema.nullable(),
  rationale: z.string().nullable(),
});
export type OutlierVote = z.infer<typeof outlierVoteSchema>;

export const humanLabelSchema = z
  .object({
    band: z.object({ min: unitScoreSchema, max: unitScoreSchema }),
    decision: z.string().nullable(),
  })
  .refine((label) => label.band.min <= label.band.max, {
    message: 'humanLabel.band.min must not exceed band.max',
  });
export type HumanLabel = z.infer<typeof humanLabelSchema>;

/**
 * One scored row of a run, as the harness report carries it. Missing
 * artifacts, rationales or inputs are allowed here: the analyzer names them
 * on the outlier instead of dropping the case.
 */
export const outlierInputCaseSchema = z.object({
  runId: z.string().min(1),
  suite: z.string().min(1),
  contentKind: z.string().min(1),
  fixtureId: z.string().min(1),
  brandFixtureId: z.string().min(1),
  fixtureVisibility: fixtureVisibilitySchema,
  input: z.unknown().optional(),
  contestant: outlierContestantSchema,
  artifactRef: z.string().nullable(),
  votes: z.array(outlierVoteSchema),
  humanLabel: humanLabelSchema.optional(),
  rubricVersion: z.string().min(1),
  costCredits: z.number().min(0).nullable(),
  latencyMs: z.number().min(0).nullable(),
  voidReason: z.string().nullable(),
});
export type OutlierInputCase = z.infer<typeof outlierInputCaseSchema>;

export const outlierMissingFieldSchema = z.enum([
  'input',
  'artifactRef',
  'rationale',
  'votes',
]);
export type OutlierMissingField = z.infer<typeof outlierMissingFieldSchema>;

/** Filled by a reviewer on the run report (phase 2); absent until then. */
export const outlierReviewSchema = z.object({
  failureReason: z.string().min(1).nullable(),
  isPromoted: z.boolean(),
});

export const outlierRecordSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  class: outlierClassSchema,
  suite: z.string().min(1),
  contentKind: z.string().min(1),
  fixtureId: z.string().min(1),
  brandFixtureId: z.string().min(1),
  fixtureVisibility: fixtureVisibilitySchema,
  input: z.unknown().optional(),
  contestant: outlierContestantSchema,
  artifactRef: z.string().nullable(),
  votes: z.array(outlierVoteSchema),
  humanLabel: humanLabelSchema.optional(),
  rubricVersion: z.string().min(1),
  costCredits: z.number().min(0).nullable(),
  latencyMs: z.number().min(0).nullable(),
  /** Why this case crossed the threshold, in one line. */
  reason: z.string().min(1),
  /** How far past the threshold; orders cases inside the cap. */
  severity: z.number().min(0),
  missingFields: z.array(outlierMissingFieldSchema),
  review: outlierReviewSchema.optional(),
});
export type OutlierRecord = z.infer<typeof outlierRecordSchema>;

const classCountsSchema = z.object({
  judge_human_disagreement: z.number().int().min(0),
  judge_disagreement: z.number().int().min(0),
  extreme_score: z.number().int().min(0),
  cost_latency: z.number().int().min(0),
});
export type OutlierClassCounts = z.infer<typeof classCountsSchema>;

/** Counts sit next to rates: small fixture sets make a rate alone misleading. */
export const outlierRateSchema = z.object({
  key: z.string().min(1),
  caseCount: z.number().int().min(0),
  outlierCaseCount: z.number().int().min(0),
  outlierRate: unitScoreSchema,
  byClass: classCountsSchema,
});
export type OutlierRate = z.infer<typeof outlierRateSchema>;

export const outlierClassTotalSchema = z.object({
  class: outlierClassSchema,
  total: z.number().int().min(0),
  reported: z.number().int().min(0),
});

export const outlierSectionSchema = z.object({
  status: z.enum(['ok', 'failed']),
  /** Set when analysis threw; the run itself is never voided by it. */
  error: z.string().optional(),
  thresholds: outlierThresholdsSchema,
  caseCount: z.number().int().min(0),
  cap: z.object({
    perClassAndContestant: z.number().int().min(1),
  }),
  totals: z.array(outlierClassTotalSchema),
  byContestant: z.array(outlierRateSchema),
  byContentKind: z.array(outlierRateSchema),
  /** content kind × contestant groups too small for a percentile cut. */
  extremeScoreSkippedGroups: z.array(
    z.object({
      contentKind: z.string().min(1),
      contestantKey: z.string().min(1),
      scoredCaseCount: z.number().int().min(0),
    }),
  ),
  cases: z.array(outlierRecordSchema),
});
export type OutlierSection = z.infer<typeof outlierSectionSchema>;
