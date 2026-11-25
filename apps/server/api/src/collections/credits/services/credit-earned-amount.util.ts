/**
 * Records on a ledger row how many earned credits the write consumed (a spend)
 * or restored (a refund). A write that touched none leaves its metadata alone.
 */
export function withEarnedAmount(
  metadata: Record<string, unknown> | undefined,
  earnedAmount: number | undefined,
): { metadata?: Record<string, unknown> } {
  if (earnedAmount && earnedAmount > 0) {
    return { metadata: { ...metadata, earnedAmount } };
  }
  return metadata ? { metadata } : {};
}
