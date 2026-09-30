import { ActivitySource } from '@genfeedai/contracts';
import { z } from 'zod';

export const generationFailureProofSchema = z.object({
  version: z.literal(1),
  ingredientId: z.string().min(1),
  provider: z.string().min(1),
  kind: z.enum(['submission-rejected', 'provider-terminal']),
  observedAt: z.iso.datetime(),
});
export const generationSubmissionIntentSchema = z.object({
  assetId: z.string().min(1),
  submissionIntent: z.object({
    version: z.literal(1),
    provider: z.string().min(1),
  }),
});
export const submittedGenerationMetadataSchema =
  generationSubmissionIntentSchema.extend({
    confirmedFailure: generationFailureProofSchema.optional(),
  });
export const generationUsageReceiptSchema = z.object({
  kind: z.literal('byok'),
  amount: z.number().finite().nonnegative(),
  description: z.string(),
  expiresAt: z.iso.datetime(),
  source: z.enum(ActivitySource),
  state: z.enum(['pending', 'recorded', 'failed']),
  userId: z.string().min(1),
  submissionIntentProvider: z.string().min(1).optional(),
  confirmedFailure: generationFailureProofSchema.optional(),
});
