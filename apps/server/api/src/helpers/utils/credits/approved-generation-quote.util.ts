import type { ApprovedGenerationQuoteConstraint } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { ModelBillableQuoteSnapshot } from '@genfeedai/contracts/interfaces';
import { ConflictException } from '@nestjs/common';

export function generationQuoteIdentityHash(
  snapshot: ModelBillableQuoteSnapshot,
): string {
  const { quotedAt: _quotedAt, ...identity } = snapshot;
  return quoteSnapshotHash(identity);
}

/** Validate actual prepared input before any new reservation or provider call. */
export function assertApprovedGenerationQuote(
  approved: ApprovedGenerationQuoteConstraint | undefined,
  actual: ModelBillableQuoteSnapshot,
  isByok: boolean,
): void {
  if (!approved) return;
  const charge = isByok ? 0 : actual.credits;
  if (
    actual.modelKey !== approved.model ||
    actual.provider !== approved.provider ||
    actual.credits !== approved.unitCredits ||
    (isByok ? 'byok' : 'credits') !== approved.billingMode ||
    !Number.isFinite(approved.maximumCredits) ||
    approved.maximumCredits < 0 ||
    charge > approved.maximumCredits ||
    generationQuoteIdentityHash(actual) !== approved.pricingHash ||
    quoteSnapshotHash(actual.quantities) !==
      quoteSnapshotHash(approved.quantities)
  ) {
    throw new ConflictException(
      'Generation model, pricing, billing mode or prepared quantities changed. Request a fresh quote and approval.',
    );
  }
}
