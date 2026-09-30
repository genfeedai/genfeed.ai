import {
  generationLineFundingSchema,
  storyboardSubmissionSchema,
} from '@api/helpers/utils/credits/generation-line-reservation.schema';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { z } from 'zod';

export const generationQuoteGroupReceiptSchema = z.object({
  kind: z.literal('quote-group'),
  reservationId: z.string().min(1),
  outputIndex: z.number().int().nonnegative(),
});
export const generationQuoteGroupMetadataSchema = z
  .object({
    lineFunding: generationLineFundingSchema.optional(),
    storyboardSubmission: storyboardSubmissionSchema.optional(),
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
  .passthrough()
  .superRefine((value, context) => {
    if (Boolean(value.lineFunding) !== Boolean(value.storyboardSubmission))
      context.addIssue({
        code: 'custom',
        message: 'Line funding and submission protocol must coexist',
      });
    if (
      value.lineFunding &&
      value.storyboardSubmission &&
      value.lineFunding.intentHash !==
        value.storyboardSubmission.fundingIntentHash
    )
      context.addIssue({
        code: 'custom',
        message: 'Line funding and submission hashes differ',
      });
  });
