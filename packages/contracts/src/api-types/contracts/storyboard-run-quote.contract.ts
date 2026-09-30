import { z } from 'zod';
import { storyboardIdSchema } from './storyboard-source.contract';

export const storyboardOperationSchema = z.enum([
  'plan',
  'analysis',
  'still',
  'video',
  'repair',
]);
export const createStoryboardRunQuoteSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    operation: storyboardOperationSchema,
    shotId: storyboardIdSchema.optional(),
    repairStage: z.enum(['image', 'video']).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const needsShot =
      input.operation === 'still' || input.operation === 'repair';
    if (needsShot !== Boolean(input.shotId))
      ctx.addIssue({
        code: 'custom',
        path: ['shotId'],
        message: 'Only still and repair require a shot.',
      });
    if ((input.operation === 'repair') !== Boolean(input.repairStage))
      ctx.addIssue({
        code: 'custom',
        path: ['repairStage'],
        message: 'Only repair requires a repair stage.',
      });
  });
export const storyboardRunQuoteSchema = z
  .object({
    id: storyboardIdSchema,
    revision: z.number().int().positive(),
    operation: storyboardOperationSchema,
    shotId: storyboardIdSchema.optional(),
    repairStage: z.enum(['image', 'video']).optional(),
    inputHash: storyboardIdSchema,
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    total: z.number().finite().nonnegative(),
    items: z
      .array(
        z
          .object({
            key: storyboardIdSchema,
            shotId: storyboardIdSchema.optional(),
            stage: z.enum([
              'plan',
              'transcription',
              'analysis',
              'image',
              'video',
              'voiceover',
              'lip_sync',
              'interpolate',
              'captions',
              'assembly',
            ]),
            model: storyboardIdSchema,
            credits: z.number().finite().nonnegative(),
            billingMode: z.enum(['platform', 'byok']),
            attempt: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict()
  .refine(
    (quote) =>
      Math.abs(
        quote.items.reduce((sum, item) => sum + item.credits, 0) - quote.total,
      ) < 0.000001,
    'Quote total must equal its line items',
  );
export const executeStoryboardRunSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    quoteId: storyboardIdSchema,
  })
  .strict();
export type StoryboardRunQuote = z.infer<typeof storyboardRunQuoteSchema>;
export type CreateStoryboardRunQuote = z.infer<
  typeof createStoryboardRunQuoteSchema
>;
export type ExecuteStoryboardRun = z.infer<typeof executeStoryboardRunSchema>;
