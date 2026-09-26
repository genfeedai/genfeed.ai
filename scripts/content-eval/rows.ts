/**
 * Leaf row schemas shared by the harness contracts and report sections
 * (`outliers/`, #5234). Kept apart from `contracts.ts` so a section schema can
 * embed a scored row while `contracts.ts` embeds the section, without an
 * import cycle. Re-exported from `contracts.ts`: import from there unless the
 * importer is itself embedded by `contracts.ts`.
 */

import { z } from 'zod';

export const SUITE_NAMES = [
  'judge',
  'ladder',
  'harness-ab',
  'media-ladder',
] as const;
export type SuiteName = (typeof SUITE_NAMES)[number];

export const FIXTURE_VISIBILITIES = ['synthetic', 'private'] as const;
export type FixtureVisibility = (typeof FIXTURE_VISIBILITIES)[number];

export const PAIRWISE_CHOICES = ['a', 'b', 'tie'] as const;
export type PairwiseChoice = (typeof PAIRWISE_CHOICES)[number];

// ─── Fixtures ───────────────────────────────────────────────────────────────

/** A 0–1 band. Human 0–100 reviewer scores are divided by 100 on export. */
export const scoreBandSchema = z
  .object({ max: z.number().min(0).max(1), min: z.number().min(0).max(1) })
  .refine((band) => band.min <= band.max, 'band.min must be <= band.max');
export type ScoreBand = z.infer<typeof scoreBandSchema>;

export const humanDecisionSchema = z.enum(['approve', 'reject']);
export type HumanDecision = z.infer<typeof humanDecisionSchema>;

export const countRangeSchema = z
  .object({
    max: z.number().int().nonnegative(),
    min: z.number().int().nonnegative(),
  })
  .refine((range) => range.min <= range.max, 'range.min must be <= range.max');
export type CountRange = z.infer<typeof countRangeSchema>;

/** Deterministic brief rules applied to a generated or judged text. */
export const contentBriefSchema = z.object({
  bannedPhrases: z.array(z.string().min(1)).default([]),
  guidance: z.string().optional(),
  hashtagRange: countRangeSchema.optional(),
  isCtaRequired: z.boolean().default(false),
  linkRange: countRangeSchema.optional(),
  maxCharacters: z.number().int().positive().optional(),
  minCharacters: z.number().int().nonnegative().optional(),
  /** Structured kinds (carousels, threads as JSON): output must match this. */
  outputJsonSchema: z.record(z.string(), z.unknown()).optional(),
});
export type ContentBrief = z.infer<typeof contentBriefSchema>;

export const fixtureInputSchema = z.object({
  brief: contentBriefSchema.default({
    bannedPhrases: [],
    isCtaRequired: false,
  }),
  /** Judge suite: the already-produced text being scored. */
  output: z.string().min(1).optional(),
  platform: z.string().min(1).optional(),
  prompt: z.string().min(1),
});
export type FixtureInput = z.infer<typeof fixtureInputSchema>;

export const fixtureSourceSchema = z.object({
  /** Anonymised pointer to where the label came from; never a tenant id. */
  reference: z.string().min(1),
  visibility: z.enum(FIXTURE_VISIBILITIES),
});

export const fixtureRowSchema = z.object({
  brandFixtureId: z.string().min(1),
  contentKind: z.string().regex(/^[a-z0-9-]+$/),
  expected: z
    .object({
      decision: humanDecisionSchema.optional(),
      scoreBand: scoreBandSchema.optional(),
    })
    .default({}),
  id: z.string().min(1),
  input: fixtureInputSchema,
  rubricVersion: z.string().min(1),
  source: fixtureSourceSchema,
});
export type FixtureRow = z.infer<typeof fixtureRowSchema>;

// ─── Row results ────────────────────────────────────────────────────────────

export const contestantProvenanceSchema = z.object({
  family: z.string().min(1),
  guidanceArm: z.enum(['raw', 'brief']),
  id: z.string().min(1),
  isCompiled: z.boolean(),
  model: z.string().min(1),
  modelVersion: z.string().nullable(),
  provider: z.string().nullable(),
  registryKey: z.string().min(1),
});
export type ContestantProvenance = z.infer<typeof contestantProvenanceSchema>;

export const judgeVoteSchema = z.object({
  callId: z.string().nullable(),
  choice: z.enum(PAIRWISE_CHOICES).nullable(),
  family: z.string().min(1),
  judgeRegistryKey: z.string().min(1),
  model: z.string().min(1),
  modelVersion: z.string().nullable(),
  provider: z.string().nullable(),
  rationale: z.string().nullable(),
  /** Pointwise score on 0–1; null for a pairwise-only vote or a failure. */
  score: z.number().min(0).max(1).nullable(),
});
export type JudgeVote = z.infer<typeof judgeVoteSchema>;

export const deterministicCheckSchema = z.object({
  detail: z.string(),
  id: z.string().min(1),
  passed: z.boolean(),
});
export type DeterministicCheck = z.infer<typeof deterministicCheckSchema>;

/** One scored answer: a judged text, or one contestant's output on a row. */
export const scoredRowSchema = z.object({
  artifactRef: z.string().nullable(),
  brandFixtureId: z.string().min(1),
  callIds: z.array(z.string()),
  contentKind: z.string().min(1),
  contestant: contestantProvenanceSchema.nullable(),
  costCredits: z.number().nonnegative(),
  deterministicChecks: z.array(deterministicCheckSchema),
  fixtureId: z.string().min(1),
  fixtureVisibility: z.enum(FIXTURE_VISIBILITIES),
  humanLabel: z
    .object({
      band: scoreBandSchema.nullable(),
      decision: humanDecisionSchema.nullable(),
    })
    .nullable(),
  isAccepted: z.boolean().nullable(),
  latencyMs: z.number().nonnegative(),
  output: z.string().nullable(),
  rubricVersion: z.string().min(1),
  runId: z.string().min(1),
  suite: z.enum(SUITE_NAMES),
  voidReason: z.string().nullable(),
  votes: z.array(judgeVoteSchema),
});
export type ScoredRow = z.infer<typeof scoredRowSchema>;

export const pairwiseResultSchema = z.object({
  baselineId: z.string().min(1),
  battleVotes: z.array(judgeVoteSchema),
  challengerId: z.string().min(1),
  contentKind: z.string().min(1),
  fixtureId: z.string().min(1),
  isPositionBiased: z.boolean().nullable(),
  orderedChoice: z.enum(PAIRWISE_CHOICES).nullable(),
  pointwiseChoice: z.enum(PAIRWISE_CHOICES).nullable(),
  /** a = challenger wins, b = baseline wins; null when voided. */
  verdict: z.enum(PAIRWISE_CHOICES).nullable(),
  voidReason: z.string().nullable(),
});
export type PairwiseResult = z.infer<typeof pairwiseResultSchema>;
