import { z } from 'zod';
import {
  answerSchema,
  contestantSchema,
  MEDIUM,
  matchSchema,
  REFERENCE_ROLE,
  taskSchema,
  voteSchema,
} from '../bench/schema';

/**
 * Media-ladder contracts (#4926). The bench schema (`../bench/schema`) owns
 * task, contestant, answer, vote and match; everything here either extends a
 * bench record with internal provenance or describes the internal run. A match
 * record written by this suite must still parse with the bench `matchSchema`.
 */

export const MEDIA_LADDER_SCHEMA_VERSION = 1;

/** Bench ladder constants, verbatim from genfeedai/benchmark scripts/ladder.ts. */
export const ELO_K_FACTOR = 24;
export const ELO_SEED_RATING = 1500;
export const MIN_JUDGES_PER_MATCH = 3;

export const MEDIA_RUBRIC_VERSION = 'media-panel-v1';

export const mediumSchema = z.enum(MEDIUM);
export const referenceRoleSchema = z.enum(REFERENCE_ROLE);
export const fidelityModeSchema = z.enum(['off', 'guided', 'strict']);

export const brandKitSchema = z.object({
  name: z.string().min(1),
  note: z.string().optional(),
  palette: z.record(z.string(), z.string().regex(/^#[0-9A-Fa-f]{6}$/)),
  wordmark: z.object({
    text: z.string().min(1),
    case: z.string(),
    tracking: z.string(),
    placement: z.string(),
    widthRatio: z.number().positive().max(1),
  }),
  typeface: z.object({ family: z.string(), fallback: z.string() }),
  rules: z.array(z.string().min(1)).min(1),
});

/**
 * Where a task came from. `public` tasks are the pinned bench pack and the
 * generation-brief corpus; `private` tasks load from genfeedai/harness and must
 * never reach a public artifact.
 */
export const taskVisibilitySchema = z.enum(['public', 'private']);

export const mediaTaskSchema = z.object({
  task: taskSchema,
  source: z.enum(['bench', 'generation-brief-corpus', 'private-harness']),
  visibility: taskVisibilitySchema,
  /** Brand context the compiled route resolves (eval-org brand key). */
  brandKey: z.string().min(1).nullable(),
  /** Extra criteria folded into the brand-fit dimension (harness evaluationCriteria). */
  evaluationCriteria: z.array(z.string().min(1)).default([]),
  /** Visual direction sent as `style` (the #3470 grid's brand kit string). */
  style: z.string().min(1).nullable().default(null),
  /** Overrides a compiled route's fidelity for this task (e.g. `off` on unbranded grid rows). */
  compiledFidelity: fidelityModeSchema.nullable().default(null),
  /** Replays a recorded seed instead of deriving one from the run seed. */
  fixedSeed: z.number().int().nullable().default(null),
});

/**
 * A route is how a contestant reaches its model. `raw` sends the task prompt
 * with prompt enhancement off; `compiled` lets the product run the harness and
 * the generation-brief compiler at the given fidelity. Both go through the
 * product API.
 */
export const mediaRouteSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('raw') }),
  z.object({
    kind: z.literal('compiled'),
    fidelityMode: fidelityModeSchema,
    compilerId: z.string().min(1),
    compilerVersion: z.number().int().positive(),
    profileId: z.string().min(1),
    profileVersion: z.number().int().positive(),
  }),
]);

export const mediaContestantSchema = z.object({
  contestant: contestantSchema,
  registryKey: z.string().min(1),
  family: z.string().min(1),
  route: mediaRouteSchema,
  /** Registry credits per output; used for the reservation estimate. */
  creditsPerOutput: z.number().nonnegative(),
});

export const judgeSpecSchema = z.object({
  modelId: z.string().min(1),
  family: z.string().min(1),
});

/** VQAScore-style adherence: the judge's probability that the rubric line holds. */
export const rubricLineScoreSchema = z.object({
  line: z.number().int().nonnegative(),
  yesProbability: z.number().min(0).max(1),
});

export const answerDimensionsSchema = z.object({
  adherence: z.array(rubricLineScoreSchema),
  /** Null when the task carries no brand reference or criteria. */
  brandFit: z.number().min(0).max(1).nullable(),
  craft: z.number().min(0).max(1),
});

/** What a vision judge returns for one shuffled pair. */
export const judgeVerdictSchema = z.object({
  a: answerDimensionsSchema,
  b: answerDimensionsSchema,
  choice: z.enum(['a', 'b', 'tie']),
  rationale: z.string().min(1),
});

export const readinessResultSchema = z.object({
  status: z.enum(['ready', 'blocked', 'unprobed']),
  platform: z.string().nullable(),
  diagnostics: z.array(z.string()),
});

export const answerVoidReasonSchema = z.enum([
  'generation-failed',
  'provider-refused',
  'reference-missing',
  'readiness-blocked',
  'spend-cap',
]);

/** One generated answer plus everything needed to reproduce and audit it. */
export const mediaAnswerRecordSchema = z.object({
  answer: answerSchema,
  taskId: z.string(),
  contestantId: z.string(),
  ingredientId: z.string().nullable(),
  /** Rendered prompt sent to the product API; digested into provenance. */
  requestPromptDigest: z.string(),
  costCredits: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  readiness: readinessResultSchema,
  voidReason: answerVoidReasonSchema.nullable(),
  voidDetail: z.string().nullable(),
  /** Ledger call ids of the generation charges behind this answer. */
  callIds: z.array(z.string()),
});

export const mediaVoteRecordSchema = z.object({
  vote: voteSchema,
  callId: z.string().nullable(),
  judgeFamily: z.string(),
  /** Choice before the bench mapping (`tie` is recorded as a `void` vote). */
  rawChoice: z.enum(['a', 'b', 'tie']).nullable(),
  dimensions: z
    .object({ a: answerDimensionsSchema, b: answerDimensionsSchema })
    .nullable(),
  costUsd: z.number().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative(),
  error: z.string().nullable(),
});

export const matchVoidReasonSchema = z.enum([
  'answer-void',
  'panel-tie',
  'panel-short',
]);

export const mediaMatchRecordSchema = z.object({
  match: matchSchema,
  medium: mediumSchema,
  votes: z.array(mediaVoteRecordSchema),
  voidReason: matchVoidReasonSchema.nullable(),
  voidDetail: z.string().nullable(),
});

export const ladderRowSchema = z.object({
  rank: z.number().int().positive(),
  contestantId: z.string(),
  rating: z.number(),
  matches: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  voids: z.number().int().nonnegative(),
  voidRate: z.number().min(0).max(1),
  acceptedOutputs: z.number().int().nonnegative(),
  costCredits: z.number().nonnegative(),
  costPerAcceptedOutput: z.number().nonnegative().nullable(),
});

export const taskWinRateSchema = z.object({
  taskId: z.string(),
  contestantId: z.string(),
  wins: z.number().int().nonnegative(),
  decided: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1).nullable(),
});

export const calibrationStatusSchema = z.object({
  isDecisionGrade: z.boolean(),
  reason: z.string().min(1),
  reportRef: z.string().nullable(),
});

/** VBench dims are recorded explicitly as absent until a fleet run supplies them. */
export const technicalDimsSchema = z.object({
  source: z.enum(['absent', 'vbench-sidecar']),
  reason: z.string(),
});

export const mediaLadderSectionSchema = z.object({
  schemaVersion: z.literal(MEDIA_LADDER_SCHEMA_VERSION),
  benchRevision: z.string(),
  rubricVersion: z.string(),
  medium: mediumSchema,
  seasonId: z.string(),
  seed: z.number().int(),
  judges: z.array(judgeSpecSchema).min(MIN_JUDGES_PER_MATCH),
  contestants: z.array(mediaContestantSchema),
  tasks: z.array(
    z.object({
      id: z.string(),
      version: z.number().int().positive(),
      source: mediaTaskSchema.shape.source,
      visibility: taskVisibilitySchema,
      skippedReason: z.string().nullable(),
    }),
  ),
  answers: z.array(mediaAnswerRecordSchema),
  matches: z.array(mediaMatchRecordSchema),
  ladder: z.array(ladderRowSchema),
  taskWinRates: z.array(taskWinRateSchema),
  calibration: calibrationStatusSchema,
  technicalDims: technicalDimsSchema,
  /** True when the spend cap stopped the run; the section is partial. */
  isAborted: z.boolean(),
  /** Internal runs never publish; a public run goes through #3848. */
  isPublicLadderEligible: z.literal(false),
});

export type BrandKit = z.infer<typeof brandKitSchema>;
export type MediaTask = z.infer<typeof mediaTaskSchema>;
export type MediaRoute = z.infer<typeof mediaRouteSchema>;
export type MediaContestant = z.infer<typeof mediaContestantSchema>;
export type JudgeSpec = z.infer<typeof judgeSpecSchema>;
export type AnswerDimensions = z.infer<typeof answerDimensionsSchema>;
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;
export type ReadinessResult = z.infer<typeof readinessResultSchema>;
export type AnswerVoidReason = z.infer<typeof answerVoidReasonSchema>;
export type MediaAnswerRecord = z.infer<typeof mediaAnswerRecordSchema>;
export type MediaVoteRecord = z.infer<typeof mediaVoteRecordSchema>;
export type MatchVoidReason = z.infer<typeof matchVoidReasonSchema>;
export type MediaMatchRecord = z.infer<typeof mediaMatchRecordSchema>;
export type LadderRow = z.infer<typeof ladderRowSchema>;
export type TaskWinRate = z.infer<typeof taskWinRateSchema>;
export type CalibrationStatus = z.infer<typeof calibrationStatusSchema>;
export type MediaLadderSection = z.infer<typeof mediaLadderSectionSchema>;
export type Medium = z.infer<typeof mediumSchema>;
export type ReferenceRole = z.infer<typeof referenceRoleSchema>;
