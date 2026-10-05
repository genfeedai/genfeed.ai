import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  type GenerationLineReservationIntent,
  generationLineReservationIntentSchema,
} from '@api/helpers/utils/credits/generation-line-reservation.schema';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { assertWorkflowCanonicalJson } from '@api/helpers/utils/credits/workflow-media-dispatch-input.util';
import { quoteModelBillablePricing } from '@genfeedai/pricing';

export function generationLineIdentity(
  owner: GenerationLineReservationIntent['owner'],
): string {
  return quoteSnapshotHash({
    version: 1,
    organizationId: owner.organizationId,
    runId: owner.runId,
    operationId: owner.operationId,
    lineKey: owner.lineKey,
    attempt: owner.attempt,
  });
}
export function generationLineReservationKey(
  intent: GenerationLineReservationIntent,
): string {
  return `storyboard-funding-v1:${generationLineIdentity(intent.owner)}`;
}
export function hasGenerationLineProtocol(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    (Object.hasOwn(value, 'lineFunding') ||
      Object.hasOwn(value, 'storyboardSubmission'))
  );
}
export function buildGenerationLineReservationIntent(
  input: Omit<GenerationLineReservationIntent, 'intentHash'>,
): GenerationLineReservationIntent {
  assertWorkflowCanonicalJson(input);
  const parsed = generationLineReservationIntentSchema
    .omit({ intentHash: true })
    .parse(input);
  if (quoteSnapshotHash(parsed) !== quoteSnapshotHash(input))
    throw new BusinessLogicException(
      'Frozen line intent contains unsupported fields',
    );
  const quote = parsed.modelQuote;
  if (
    quote.quantities.requests !== 1 ||
    quote.quantities.outputs !== 1 ||
    !Number.isSafeInteger(quote.credits) ||
    quote.credits <= 0 ||
    quote.costSource === 'explicit-free' ||
    quote.modelKey !== quote.pricingProfile.key ||
    quote.provider !== quote.pricingProfile.provider ||
    parsed.owner.sourceActionId !==
      `storyboard-line-v1:${generationLineIdentity(parsed.owner)}`
  )
    throw new BusinessLogicException(
      'Positive native single-output platform quote is required',
    );
  const recomputed = quoteModelBillablePricing(
    quote.pricingProfile,
    { ...quote.quantities, modelKey: quote.modelKey, provider: quote.provider },
    quote.marginMultiplier,
    quote.quotedAt,
    { kind: 'frozen' },
  );
  if (
    recomputed.status !== 'priced' ||
    quoteSnapshotHash(recomputed.snapshot) !== quoteSnapshotHash(quote)
  )
    throw new BusinessLogicException('Frozen line quote arithmetic differs');
  return { ...parsed, intentHash: quoteSnapshotHash(parsed) };
}
export function validateGenerationLineReservationIntent(
  value: unknown,
): GenerationLineReservationIntent {
  assertWorkflowCanonicalJson(value);
  const parsed = generationLineReservationIntentSchema.parse(value);
  if (quoteSnapshotHash(parsed) !== quoteSnapshotHash(value))
    throw new BusinessLogicException(
      'Frozen line intent contains unsupported fields',
    );
  const { intentHash, ...input } = parsed;
  const expected = buildGenerationLineReservationIntent(input);
  if (intentHash !== expected.intentHash)
    throw new BusinessLogicException('Frozen line intent changed');
  return parsed;
}
export function initialGenerationLineMetadata(
  intent: GenerationLineReservationIntent,
) {
  return {
    modelQuote: intent.modelQuote,
    boundOutputIds: [],
    dispatchClosed: false,
    failedOutputIds: [],
    completedArtifacts: [],
    lineFunding: {
      version: 1 as const,
      intent,
      intentHash: intent.intentHash,
      attachment: 'preparing' as const,
    },
    storyboardSubmission: {
      version: 1 as const,
      ownerHash: quoteSnapshotHash(intent.owner),
      fundingIntentHash: intent.intentHash,
      submissionState: 'never-started' as const,
      submissionIntentId: null,
      noSubmissionProof: null,
    },
  };
}
