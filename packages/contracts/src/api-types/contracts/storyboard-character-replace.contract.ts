import { z } from 'zod';
import { storyboardIdSchema } from './storyboard-source.contract';

/** Higgsfield Genjutsu motion transfer. */
export const STORYBOARD_CHARACTER_REPLACE_MODEL_KEY =
  'higgsfield/genjutsu/motion-transfer/v1.0' as const;

/**
 * Honest limits. Genjutsu is motion transfer only: it does not keep the
 * source audio track and it does not guarantee lip-sync. This operation
 * records zero application credits.
 */
export const STORYBOARD_CHARACTER_REPLACE_LIMITATIONS = [
  'Does not preserve the source audio track.',
  'Does not guarantee lip-sync.',
  'This operation records zero application credits.',
] as const;

export const replaceStoryboardCharacterSchema = z
  .object({
    imageAssetIds: z.array(storyboardIdSchema).min(1).max(8),
    prompt: z.string().trim().max(1_000).optional(),
  })
  .strict();

export const storyboardCharacterReplacementSchema = z
  .object({
    shotId: storyboardIdSchema,
    requestId: z.string().trim().min(1).max(200),
    modelKey: z.literal(STORYBOARD_CHARACTER_REPLACE_MODEL_KEY),
    imageAssetIds: z.array(storyboardIdSchema).min(1).max(8),
    videoAssetId: storyboardIdSchema,
    prompt: z.string().max(1_000).optional(),
    status: z.enum([
      'submitting',
      'submitted',
      'running',
      'reconciling',
      'ready',
      'failed',
      'cancelled',
      'blocked',
    ]),
    operationId: z.string().uuid().optional(),
    association: z.enum(['current', 'detached']).optional(),
    output: z
      .object({
        kind: z.literal('provider_url'),
        url: z.string().url(),
        retained: z.literal(false),
      })
      .strict()
      .optional(),
    chargedCredits: z.literal(0),
    limitations: z.array(z.string().max(300)).min(1).max(4),
  })
  .strict();

export type ReplaceStoryboardCharacter = z.infer<
  typeof replaceStoryboardCharacterSchema
>;
export type StoryboardCharacterReplacement = z.infer<
  typeof storyboardCharacterReplacementSchema
>;

export const storyboardCharacterOperationReceiptSchema =
  storyboardCharacterReplacementSchema
    .omit({ requestId: true, prompt: true })
    .extend({
      operationId: z.string().uuid(),
      runId: storyboardIdSchema,
      requestId: z.string().min(1).max(200).optional(),
      acceptedRequestIds: z.array(z.string().min(1).max(200)),
      association: z.enum(['current', 'detached']),
      errorCode: z.string().max(100).optional(),
    })
    .strict();
export type StoryboardCharacterOperationReceipt = z.infer<
  typeof storyboardCharacterOperationReceiptSchema
>;

export const storyboardCharacterReplacementsSchema = z
  .object({
    operations: z.array(storyboardCharacterOperationReceiptSchema).max(128),
    legacyReplacements: z.array(storyboardCharacterReplacementSchema).max(12),
  })
  .strict();
export type StoryboardCharacterReplacements = z.infer<
  typeof storyboardCharacterReplacementsSchema
>;
