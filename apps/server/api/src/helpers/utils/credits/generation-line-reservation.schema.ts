import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { ActivitySource } from '@genfeedai/contracts';
import { z } from 'zod';

const id = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const generationLineReservationIntentSchema = z.strictObject({
  version: z.literal(1),
  owner: z.strictObject({
    kind: z.literal('storyboard-line'),
    organizationId: id,
    brandId: id,
    runId: id,
    operationId: id,
    lineKey: id,
    attempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    actorUserId: id,
    quoteId: id,
    sourceActionId: id,
    preparedHash: hash,
  }),
  modelQuote: modelBillableQuoteSnapshotSchema,
  source: z.enum(ActivitySource),
  description: id,
  expiresAt: z.iso.datetime(),
  intentHash: hash,
});
export type GenerationLineReservationIntent = z.infer<
  typeof generationLineReservationIntentSchema
>;
export type GenerationLineReservationResult =
  | { status: 'missing' }
  | {
      status: 'reserved';
      reservationId: string;
      intentHash: string;
      attachment: 'preparing' | 'attached';
      expiresAt: string;
      dispatchClosed: boolean;
    }
  | { status: 'settled'; reservationId: string; actualCredits: number }
  | { status: 'ended'; reservationId: string; reason: 'released' | 'expired' };
export const generationLineFundingSchema = z.strictObject({
  version: z.literal(1),
  intent: generationLineReservationIntentSchema,
  intentHash: hash,
  attachment: z.enum(['preparing', 'attached']),
});
export const storyboardNoSubmissionProofSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('storyboard-never-submitted'),
  proofId: hash,
  ownerHash: hash,
  fundingIntentHash: hash,
  closedSequence: z.number().int().nonnegative(),
  cancellationGeneration: z.number().int().nonnegative(),
  reason: z.enum(['cancelled', 'unused-slot', 'admission-expired']),
  observedAt: z.iso.datetime(),
});
export const storyboardSubmissionSchema = z
  .strictObject({
    version: z.literal(1),
    ownerHash: hash,
    fundingIntentHash: hash,
    submissionState: z.enum(['never-started', 'intent-recorded']),
    submissionIntentId: id.nullable(),
    noSubmissionProof: storyboardNoSubmissionProofSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      (value.submissionState === 'never-started') !==
        (value.submissionIntentId === null) ||
      (value.submissionState === 'intent-recorded' &&
        value.noSubmissionProof !== null)
    )
      context.addIssue({
        code: 'custom',
        message: 'Submission state and proof differ',
      });
    const proof = value.noSubmissionProof;
    if (
      proof &&
      (proof.ownerHash !== value.ownerHash ||
        proof.fundingIntentHash !== value.fundingIntentHash)
    )
      context.addIssue({
        code: 'custom',
        message: 'No-submission proof identity differs',
      });
  });
