import {
  generationLineFundingSchema,
  storyboardSubmissionSchema,
} from '@api/helpers/utils/credits/generation-line-reservation.schema';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { crunCreditsEqual, normalizeCrunCredits } from '@genfeedai/pricing';
import type { CrunGenerationTask } from '@genfeedai/prisma';
import { z } from 'zod';

/** Authenticated Crun disposition protects every settlement/release/expiry entry point. */
export function crunReceiptAllowsDisposition(
  task:
    | Pick<
        CrunGenerationTask,
        | 'state'
        | 'terminalReceipt'
        | 'quoteSnapshot'
        | 'vendorCostRecordedAt'
        | 'mediaPersistedAt'
      >
    | null
    | undefined,
  disposition: 'settle' | 'release',
): boolean {
  if (!task || task.state === 'finalized') return true;
  if (task.state === 'prepared') return disposition === 'release';
  const receipt = z
    .object({
      status: z.enum(['success', 'failed']).optional(),
      credits: z.string().optional(),
      isAccepted: z.literal(false).optional(),
    })
    .safeParse(task.terminalReceipt);
  if (!receipt.success) return false;
  if (task.state === 'provider-failed' && receipt.data.isAccepted === false)
    return disposition === 'release';
  const credits = receipt.data.credits;
  if (
    !credits ||
    normalizeCrunCredits(credits) === null ||
    !task.vendorCostRecordedAt
  )
    return false;
  if (task.state === 'provider-failed' && receipt.data.status === 'failed')
    return disposition === 'release';
  if (
    disposition !== 'settle' ||
    task.state !== 'provider-success' ||
    receipt.data.status !== 'success' ||
    !task.mediaPersistedAt
  )
    return false;
  const quote = modelBillableQuoteSnapshotSchema.safeParse(task.quoteSnapshot);
  return (
    quote.success &&
    Boolean(
      quote.data.providerQuote &&
        crunCreditsEqual(
          credits,
          quote.data.providerQuote.providerCreditsPerTask,
        ),
    )
  );
}

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
