import { z } from 'zod';
import { storyboardModelKeySchema } from './storyboard-run-capabilities.contract';
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
    capabilityVersion: z.string().regex(/^[a-f0-9]{64}$/),
    maximumShotCount: z.number().int().min(2).max(12).nullable(),
    amountKind: z.enum(['maximum', 'exact']),
    total: z.number().finite().nonnegative(),
    items: z
      .array(
        z
          .object({
            key: storyboardIdSchema,
            shotId: storyboardIdSchema.optional(),
            slotOrdinal: z.number().int().min(1).max(12).nullable(),
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
            model: storyboardModelKeySchema,
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
  )
  .superRefine((quote, ctx) => {
    if ((quote.operation === 'plan') !== (quote.maximumShotCount !== null))
      ctx.addIssue({
        code: 'custom',
        path: ['maximumShotCount'],
        message: 'Only planning quotes require a maximum shot count.',
      });
    if (quote.operation === 'plan' && quote.amountKind !== 'maximum')
      ctx.addIssue({
        code: 'custom',
        path: ['amountKind'],
        message: 'Planning quotes contain a priced maximum.',
      });
    const slots = new Set<number>();
    quote.items.forEach((line, index) => {
      if (line.slotOrdinal === null) {
        if (quote.operation === 'plan' && line.stage === 'image')
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'slotOrdinal'],
            message: 'A first-pass still requires its stable slot ordinal.',
          });
        return;
      }
      if (
        quote.operation !== 'plan' ||
        line.stage !== 'image' ||
        line.shotId ||
        line.slotOrdinal > (quote.maximumShotCount ?? 0) ||
        slots.has(line.slotOrdinal)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'slotOrdinal'],
          message:
            'Only distinct first-pass planning still slots may have ordinals within the quoted maximum.',
        });
      slots.add(line.slotOrdinal);
    });
    if (
      new Set(quote.items.map((line) => line.key)).size !== quote.items.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Quote line keys must be unique.',
      });
    if (
      quote.operation === 'plan' &&
      (slots.size !== quote.maximumShotCount ||
        quote.items.filter((line) => line.stage === 'plan').length !== 1 ||
        quote.items.some((line) => !['plan', 'image'].includes(line.stage)))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message:
          'Planning quotes require one text request and all bounded first-pass still slots.',
      });
  });
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

// Historical operation identities are validated without changing accepted bytes.
export const storyboardAcceptedOperationIdSchema = z
  .string()
  .refine(
    (value) => value.trim().length > 0 && value.trim().length <= 200,
    'Invalid accepted operation ID',
  );

export const controlStoryboardOperationSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    operationId: storyboardAcceptedOperationIdSchema,
  })
  .strict();
export const storyboardOperationProjectionSchema = z
  .object({
    id: storyboardAcceptedOperationIdSchema,
    quoteId: storyboardAcceptedOperationIdSchema,
    acceptedRevision: z.number().int().positive(),
    status: z.enum([
      'running',
      'blocked',
      'reconciling',
      'completed',
      'cancelled',
      'failed',
    ]),
    canResume: z.boolean(),
    reasonCode: z.string().max(200).nullable(),
  })
  .strict();
export type CancelStoryboardRun = z.infer<
  typeof controlStoryboardOperationSchema
>;
export type ResumeStoryboardRun = z.infer<
  typeof controlStoryboardOperationSchema
>;
export type StoryboardOperationProjection = z.infer<
  typeof storyboardOperationProjectionSchema
>;
