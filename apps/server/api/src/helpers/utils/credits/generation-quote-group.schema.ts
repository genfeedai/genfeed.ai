import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { z } from 'zod';

export const generationQuoteGroupReceiptSchema = z.object({
  kind: z.literal('quote-group'),
  reservationId: z.string().min(1),
  outputIndex: z.number().int().nonnegative(),
});
export const generationQuoteGroupMetadataSchema = z
  .object({
    modelQuote: modelBillableQuoteSnapshotSchema,
    boundOutputIds: z.array(z.string()).default([]),
    dispatchClosed: z.boolean().default(false),
    failedOutputIds: z.array(z.string()).default([]),
    completedArtifacts: z
      .array(
        z.object({
          ingredientId: z.string().min(1),
          s3Key: z.string().min(1),
          completedAt: z.iso.datetime(),
        }),
      )
      .default([]),
  })
  .passthrough();
