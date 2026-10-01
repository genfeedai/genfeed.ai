import { z } from 'zod';
import { storyboardIdSchema } from './storyboard-source.contract';

/** Higgsfield Genjutsu motion transfer. Inactive at cost 0 in the model catalog. */
export const STORYBOARD_CHARACTER_REPLACE_MODEL_KEY =
  'higgsfield/genjutsu/motion-transfer/v1.0' as const;

/**
 * Honest limits. Genjutsu is motion transfer only: it does not keep the
 * source audio track and it does not guarantee lip-sync. The catalog row
 * stays inactive at cost 0, so this operation cannot charge credits.
 */
export const STORYBOARD_CHARACTER_REPLACE_LIMITATIONS = [
  'Does not preserve the source audio track.',
  'Does not guarantee lip-sync.',
  'Does not charge credits. Genjutsu stays inactive at cost 0.',
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
    status: z.enum(['submitted', 'ready']),
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
