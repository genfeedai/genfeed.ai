import { z } from 'zod';
import { storyboardIdSchema } from './storyboard-source.contract';

/**
 * Every shot render is created with a `sourceActionId` that starts with this
 * prefix (`storyboard-render-<runId>-<operationId>`), which is also the key
 * the video pipeline holds its credits by.
 */
export const STORYBOARD_SHOT_RENDER_SOURCE_ACTION_PREFIX = 'storyboard-render-';

/**
 * A shot renders twice (#9618): a cheap `draft` to check the motion, then the
 * `final` at full quality. A final that follows a current draft promotes it:
 * it reuses the draft's references and prompt, adding the spoken line when
 * the final renders sound and the silent draft left it out.
 */
export const storyboardShotRenderStageSchema = z.enum(['draft', 'final']);

export const storyboardShotRenderStateSchema = z.enum([
  'pending',
  'submitted',
  'ready',
  'failed',
]);

/** The latest render of one shot at one stage, as the run shows it. */
export const storyboardShotRenderSchema = z
  .object({
    operationId: z.string().uuid(),
    shotId: storyboardIdSchema,
    stage: storyboardShotRenderStageSchema,
    modelKey: z.string().trim().min(1).max(255),
    state: storyboardShotRenderStateSchema,
    assetId: storyboardIdSchema.optional(),
    credits: z.number().finite().nonnegative(),
    billingMode: z.enum(['platform', 'byok']),
    prompt: z.string().min(1).max(8_000),
    referenceAssetIds: z.array(storyboardIdSchema).max(20),
    durationSeconds: z.number().finite().positive().max(60),
    resolution: z.string().trim().min(1).max(40).optional(),
    isAudioEnabled: z.boolean(),
    /** The draft this final promoted, when it reused the draft's inputs. */
    promotedFromOperationId: z.string().uuid().optional(),
    /** False once the shot's action, dialogue, still or references changed. */
    isCurrent: z.boolean(),
    errorCode: z.string().max(200).optional(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const shotIdsSchema = z
  .array(storyboardIdSchema)
  .min(1)
  .max(12)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Shot IDs must be unique.',
  );

/**
 * Quotes one stage for the given shots, or for every shot that still needs
 * it: a draft for shots without a current draft, a final for shots without a
 * current final.
 */
export const quoteStoryboardShotRendersSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    stage: storyboardShotRenderStageSchema,
    shotIds: shotIdsSchema.optional(),
  })
  .strict();

export const storyboardShotRenderQuoteSchema = z
  .object({
    revision: z.number().int().positive(),
    stage: storyboardShotRenderStageSchema,
    modelKey: z.string().trim().min(1).max(255),
    billingMode: z.enum(['platform', 'byok']),
    /** Binds rendering to these shots, prompts, references and prices. */
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    items: z
      .array(
        z
          .object({
            shotId: storyboardIdSchema,
            credits: z.number().finite().nonnegative(),
            durationSeconds: z.number().finite().positive().max(60),
            promotedFromOperationId: z.string().uuid().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
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

/** Accepts a quote: rendering starts only while the quoted inputs still match. */
export const startStoryboardShotRendersSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    stage: storyboardShotRenderStageSchema,
    shotIds: shotIdsSchema,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type StoryboardShotRenderStage = z.infer<
  typeof storyboardShotRenderStageSchema
>;
export type StoryboardShotRender = z.infer<typeof storyboardShotRenderSchema>;
export type QuoteStoryboardShotRenders = z.infer<
  typeof quoteStoryboardShotRendersSchema
>;
export type StoryboardShotRenderQuote = z.infer<
  typeof storyboardShotRenderQuoteSchema
>;
export type StartStoryboardShotRenders = z.infer<
  typeof startStoryboardShotRendersSchema
>;
