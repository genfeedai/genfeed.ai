/**
 * Outlier contracts for content-eval run reports (#5234).
 *
 * Averages hide the cases that explain a run: the output a judge loved and a
 * human rejected, the contestant with a good mean and a bad tail, the
 * generation that cost ten times the median. The analyzer reads scores the run
 * already produced (no provider calls) and emits a capped, reviewable section.
 *
 * Imports the leaf `../rows` schemas, never `../contracts`: the report schema
 * embeds this section, so importing it back would be a cycle.
 */

import { z } from 'zod';
import type { FixtureRow, PairwiseResult, ScoredRow } from '../rows';
import {
  contestantProvenanceSchema,
  FIXTURE_VISIBILITIES,
  fixtureInputSchema,
  humanDecisionSchema,
  judgeVoteSchema,
  pairwiseResultSchema,
  SUITE_NAMES,
  scoreBandSchema,
} from '../rows';

export const OUTLIER_CLASSES = [
  'judge_human_disagreement',
  'judge_disagreement',
  'extreme_score',
  'cost_latency',
] as const;

export const outlierClassSchema = z.enum(OUTLIER_CLASSES);
export type OutlierClass = z.infer<typeof outlierClassSchema>;

/** Rate key for judge-suite rows, which score a text with no contestant. */
export const JUDGED_OUTPUT_KEY = 'judged-output';

const unitScoreSchema = z.number().min(0).max(1);

/**
 * Versioned run configuration. The report records the thresholds it used, so
 * a rate is always read against the cut that produced it.
 */
export const outlierThresholdsSchema = z
  .object({
    version: z.string().min(1),
    /** Judge score may sit this far outside the human band before it counts. */
    judgeHumanBandTolerance: unitScoreSchema,
    /** Max − min judge score on one case above which the panel disagrees. */
    judgeSpreadMax: unitScoreSchema,
    /** Lower/upper percentiles per content kind × contestant. */
    extremeScoreLowPercentile: unitScoreSchema,
    extremeScoreHighPercentile: unitScoreSchema,
    /** Smaller groups make percentiles noise; they are skipped and listed. */
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

export const outlierMissingFieldSchema = z.enum([
  'input',
  'artifact',
  'rationale',
  'votes',
]);
export type OutlierMissingField = z.infer<typeof outlierMissingFieldSchema>;

/** Filled by a reviewer on the run report (phase 2); absent until then. */
export const outlierReviewSchema = z.object({
  failureReason: z.string().min(1).nullable(),
  isPromoted: z.boolean(),
});

/**
 * Everything needed to review a case without re-running it: the fixture
 * input, the artifact (inline text or a reference), every judge's score and
 * rationale, the human label, rubric version and model provenance.
 */
export const outlierRecordSchema = z.object({
  artifactRef: z.string().nullable(),
  brandFixtureId: z.string().min(1),
  callIds: z.array(z.string()),
  class: outlierClassSchema,
  contentKind: z.string().min(1),
  contestant: contestantProvenanceSchema.nullable(),
  costCredits: z.number().nonnegative(),
  fixtureId: z.string().min(1),
  fixtureVisibility: z.enum(FIXTURE_VISIBILITIES),
  humanLabel: z
    .object({
      band: scoreBandSchema.nullable(),
      decision: humanDecisionSchema.nullable(),
    })
    .nullable(),
  id: z.string().min(1),
  input: fixtureInputSchema.nullable(),
  latencyMs: z.number().nonnegative(),
  missingFields: z.array(outlierMissingFieldSchema),
  output: z.string().nullable(),
  /** Split pairwise battles this case lost or won, with their votes. */
  pairs: z.array(pairwiseResultSchema),
  /** Why this case crossed the threshold, in one line. */
  reason: z.string().min(1),
  review: outlierReviewSchema.optional(),
  rubricVersion: z.string().min(1),
  runId: z.string().min(1),
  /** How far past the threshold; orders cases inside the cap. */
  severity: z.number().nonnegative(),
  suite: z.enum(SUITE_NAMES),
  votes: z.array(judgeVoteSchema),
});
export type OutlierRecord = z.infer<typeof outlierRecordSchema>;

const classCountsSchema = z.object({
  cost_latency: z.number().int().nonnegative(),
  extreme_score: z.number().int().nonnegative(),
  judge_disagreement: z.number().int().nonnegative(),
  judge_human_disagreement: z.number().int().nonnegative(),
});
export type OutlierClassCounts = z.infer<typeof classCountsSchema>;

/** Counts sit next to rates: small fixture sets make a rate alone misleading. */
export const outlierRateSchema = z.object({
  byClass: classCountsSchema,
  caseCount: z.number().int().nonnegative(),
  key: z.string().min(1),
  outlierCaseCount: z.number().int().nonnegative(),
  outlierRate: unitScoreSchema,
});
export type OutlierRate = z.infer<typeof outlierRateSchema>;

export const outlierSectionSchema = z.object({
  byContentKind: z.array(outlierRateSchema),
  byContestant: z.array(outlierRateSchema),
  cap: z.object({ perClassAndContestant: z.number().int().min(1) }),
  caseCount: z.number().int().nonnegative(),
  cases: z.array(outlierRecordSchema),
  /** Set when analysis failed; the run itself is never voided by it. */
  error: z.string().optional(),
  /** content kind × contestant groups too small for a percentile cut. */
  extremeScoreSkippedGroups: z.array(
    z.object({
      contentKind: z.string().min(1),
      contestantKey: z.string().min(1),
      scoredCaseCount: z.number().int().nonnegative(),
    }),
  ),
  status: z.enum(['ok', 'failed']),
  thresholds: outlierThresholdsSchema,
  totals: z.array(
    z.object({
      class: outlierClassSchema,
      reported: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
  ),
});
export type OutlierSection = z.infer<typeof outlierSectionSchema>;

export interface OutlierAnalysisInput {
  fixtureRowsById: Map<string, FixtureRow>;
  pairs: PairwiseResult[];
  rows: ScoredRow[];
  thresholds: OutlierThresholds;
}
