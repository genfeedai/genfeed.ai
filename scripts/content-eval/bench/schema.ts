/**
 * Pinned copy of the public bench data contract (`genfeedai/benchmark`,
 * `schema/index.ts` at BENCH_REVISION). Everything below the marker line is
 * verbatim — `schema.test.ts` checks it against that revision whenever a
 * sibling `benchmark` checkout is present. Bump both together; never edit the
 * rules here. The bench is AGPL-3.0, same as this repository.
 */

export const BENCH_REVISION = '851b7c85dab18e39342f3bd017ae776f39b3c35e';
export const BENCH_SCHEMA_PATH = 'schema/index.ts';

// ── verbatim below: genfeedai/benchmark@BENCH_REVISION schema/index.ts ──
import { z } from 'zod';

/**
 * The published data contract. genfeed.ai/benchmark renders straight from these
 * shapes, so a change here is a change to the public page — version the season
 * rather than reshaping a season that is already open.
 */

export const MEDIUM = ['image', 'video'] as const;
export const SEASON_STATE = ['announced', 'open', 'closed'] as const;
export const MATCH_STATE = [
  'queued',
  'generated',
  'judging',
  'recorded',
  'void',
] as const;
export const VERDICT = ['a', 'b', 'void'] as const;

/** Reference material a task is allowed to hand a contestant. */
export const REFERENCE_ROLE = [
  'none',
  'brand-kit',
  'character-sheet',
  'product-shot',
  'style-frame',
] as const;

export const taskSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  medium: z.enum(MEDIUM),
  /** Draft tasks are readable but cannot be drawn into a match. */
  isDraft: z.boolean().default(false),
  title: z.string().min(1),
  /** Why this task separates models. Printed on the public task page. */
  rationale: z.string().min(1),
  /** The exact public prompt. No hidden prompt, ever. */
  prompt: z.string().min(1),
  referenceRoles: z.array(z.enum(REFERENCE_ROLE)).min(1),
  outputSpec: z.object({
    aspectRatio: z.string(),
    count: z.number().int().positive(),
    durationSeconds: z.number().int().positive().optional(),
  }),
  /** What judges are told to weigh, in order. Judges see nothing else. */
  rubric: z.array(z.string().min(1)).min(1),
});

export const contestantSchema = z.object({
  id: z.string().regex(/^[a-z0-9.-]+$/),
  label: z.string().min(1),
  provider: z.string().min(1),
  modelId: z.string().min(1),
  /**
   * True when Genfeed's brief compiler sits in front of the model. The whole
   * point of the bench is that a compiled route can lose to its own raw model.
   */
  isCompiled: z.boolean(),
  mediums: z.array(z.enum(MEDIUM)).min(1),
  addedAt: z.iso.datetime(),
  retiredAt: z.iso.datetime().nullable().default(null),
});

export const ladderEntrySchema = z.object({
  rank: z.number().int().positive(),
  contestantId: z.string(),
  rating: z.number(),
  matches: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  voids: z.number().int().nonnegative(),
});

export const seasonSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  medium: z.enum(MEDIUM),
  state: z.enum(SEASON_STATE),
  announcedAt: z.iso.datetime(),
  openedAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(),
  taskIds: z.array(z.string()),
  contestantIds: z.array(z.string()),
  matchCount: z.number().int().nonnegative(),
  /** Empty until matches are recorded. An empty ladder is a valid season. */
  ladder: z.array(ladderEntrySchema),
  updatedAt: z.iso.datetime(),
});

export const answerSchema = z.object({
  contestantId: z.string(),
  /** Stable public URL of the generated artifact. Never a signed URL. */
  artifactUrl: z.url(),
  seed: z.number().int().nullable(),
  /** Everything needed to re-run this generation. */
  settings: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
});

export const voteSchema = z.object({
  judgeModelId: z.string().min(1),
  choice: z.enum(VERDICT),
  rationale: z.string().min(1),
});

export const matchSchema = z.object({
  id: z.string().min(1),
  seasonId: z.string(),
  taskId: z.string(),
  taskVersion: z.number().int().positive(),
  state: z.enum(MATCH_STATE),
  /** A and B are shuffled before judging; position carries no meaning. */
  a: answerSchema,
  b: answerSchema,
  votes: z.array(voteSchema),
  verdict: z.enum(VERDICT).nullable(),
  ratingChange: z
    .object({ a: z.number(), b: z.number() })
    .nullable()
    .default(null),
  recordedAt: z.iso.datetime().nullable(),
});

export type Task = z.infer<typeof taskSchema>;
export type Contestant = z.infer<typeof contestantSchema>;
export type Season = z.infer<typeof seasonSchema>;
export type Match = z.infer<typeof matchSchema>;
export type LadderEntry = z.infer<typeof ladderEntrySchema>;
