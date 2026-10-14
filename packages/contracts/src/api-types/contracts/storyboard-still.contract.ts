import { z } from 'zod';
import { storyboardIdSchema } from './storyboard-source.contract';

const shotIdsSchema = z
  .array(storyboardIdSchema)
  .min(1)
  .max(12)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Shot IDs must be unique.',
  );

/** Quotes sketch stills for the given shots, or for every shot that needs one. */
export const quoteStoryboardStillsSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    shotIds: shotIdsSchema.optional(),
  })
  .strict();

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
            shotId: storyboardIdSchema,
            credits: z.number().finite().nonnegative(),
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

/** Accepts a quote: generation starts only while the quoted inputs still match. */
export const generateStoryboardStillsSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    shotIds: shotIdsSchema,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type QuoteStoryboardStills = z.infer<typeof quoteStoryboardStillsSchema>;
export type StoryboardStillQuote = z.infer<typeof storyboardStillQuoteSchema>;
export type GenerateStoryboardStills = z.infer<
  typeof generateStoryboardStillsSchema
>;
