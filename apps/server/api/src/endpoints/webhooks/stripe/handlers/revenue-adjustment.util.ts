/**
 * The ledger records revenue net of tax, but Stripe refunds and disputes are
 * stated in the gross amount the customer paid. The net share of an adjusted
 * gross amount is the same fraction of the original net, capped at the whole
 * payment so a dispute larger than the charge can never overshoot it.
 */
export function proratedNetMinor(input: {
  adjustedGrossMinor: number;
  originalGrossMinor: number;
  originalNetMinor: number;
}): number {
  const { adjustedGrossMinor, originalGrossMinor, originalNetMinor } = input;
  if (
    !(originalGrossMinor > 0) ||
    !(originalNetMinor > 0) ||
    !(adjustedGrossMinor > 0)
  ) {
    return 0;
  }
  const share =
    Math.min(adjustedGrossMinor, originalGrossMinor) / originalGrossMinor;
  return Math.round(originalNetMinor * share);
}

/**
 * Ledger key of one adjustment step. A refund event carries the charge's
 * cumulative refunded amount, so each cumulative value is its own row and a
 * replayed webhook lands on the same key.
 */
export function revenueAdjustmentKey(
  adjustmentId: string,
  adjustedGrossMinor: number,
): string {
  return `${adjustmentId}:${adjustedGrossMinor}`;
}

/**
 * Ledger key of the processing fee Stripe charged on one payment. The fee is
 * fixed once the charge settles, so a replayed webhook lands on the same key.
 */
export function processingFeeKey(revenueObjectId: string): string {
  return `fee:${revenueObjectId}`;
}
