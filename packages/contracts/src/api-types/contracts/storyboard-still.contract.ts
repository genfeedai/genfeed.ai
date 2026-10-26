import { z } from 'zod';
import { storyboardIdSchema } from './storyboard-source.contract';

/**
 * Every sketch still is created with a `sourceActionId` that starts with this
 * prefix. The Library and the playground gallery use it to leave stills out:
 * they belong in the storyboard layout only.
 */
export const STORYBOARD_STILL_SOURCE_ACTION_PREFIX = 'storyboard-still-';

const OPERATION_ID_SUFFIX =
  /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scene stills and scene videos of a storyboard are keyed `remix-<runId>-...`
 * (their `sourceActionId` for stills, their `groupId` for stills and videos).
 * Run ids are cuids, so the run is the first dash-free segment; the
 * `remix-source:` import marker has no such segment.
 */
const STORYBOARD_SCENE_KEY = /^remix-([a-z0-9]+)-/;

/**
 * The storyboard run a generated still or video belongs to, read from its
 * `sourceActionId` or `groupId` (`storyboard-still-<runId>-<operationId>` or
 * `remix-<runId>-...`). Returns null for any other ingredient. The caller
 * still confirms the run is a storyboard.
 */
export function parseStoryboardRunId(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const runId = value.startsWith(STORYBOARD_STILL_SOURCE_ACTION_PREFIX)
    ? value
        .slice(STORYBOARD_STILL_SOURCE_ACTION_PREFIX.length)
        .replace(OPERATION_ID_SUFFIX, '')
    : (STORYBOARD_SCENE_KEY.exec(value)?.[1] ?? '');
  return runId.length > 0 ? runId : null;
}

const shotIdsSchema = z
  .array(storyboardIdSchema)
  .min(1)
  .max(12)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Shot IDs must be unique.',
  );

/** A long-form storyboard has up to 600 cutaways; a call covers a batch. */
export const STORYBOARD_CUTAWAY_STILLS_PER_CALL = 60;

const cutawayIdsSchema = z
  .array(storyboardIdSchema)
  .min(1)
  .max(STORYBOARD_CUTAWAY_STILLS_PER_CALL)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Cutaway IDs must be unique.',
  );

/**
 * Quotes stills for the given shots, or for every shot that needs one. On a
 * long-form storyboard the stills are cutaway B-roll: the given cutaways, or
 * every one without footage.
 */
export const quoteStoryboardStillsSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    shotIds: shotIdsSchema.optional(),
    cutawayIds: cutawayIdsSchema.optional(),
  })
  .strict()
  .refine(
    (input) => !(input.shotIds && input.cutawayIds),
    'Quote shots or cutaways, not both.',
  );

export const storyboardStillQuoteSchema = z
  .object({
    revision: z.number().int().positive(),
    modelKey: z.string().trim().min(1).max(255),
    billingMode: z.enum(['platform', 'byok']),
    /** Binds generation to these shots, prompts, references and prices. */
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    items: z
      .array(
        z
          .object({
            /** The shot, or on a long-form storyboard the cutaway. */
            shotId: storyboardIdSchema,
            credits: z.number().finite().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(STORYBOARD_CUTAWAY_STILLS_PER_CALL),
    total: z.number().finite().nonnegative(),
  })
  .strict()
  .refine(
    (quote) =>
      Math.abs(
        quote.items.reduce((sum, item) => sum + item.credits, 0) - quote.total,
      ) < 0.000001,
    'Quote total must equal its line items',
  );

/** Accepts a quote: generation starts only while the quoted inputs still match. */
export const generateStoryboardStillsSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    shotIds: shotIdsSchema.optional(),
    cutawayIds: cutawayIdsSchema.optional(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine(
    (input) => Boolean(input.shotIds) !== Boolean(input.cutawayIds),
    'Generate stills for shots or for cutaways.',
  );

export type QuoteStoryboardStills = z.infer<typeof quoteStoryboardStillsSchema>;
export type StoryboardStillQuote = z.infer<typeof storyboardStillQuoteSchema>;
export type GenerateStoryboardStills = z.infer<
  typeof generateStoryboardStillsSchema
>;
