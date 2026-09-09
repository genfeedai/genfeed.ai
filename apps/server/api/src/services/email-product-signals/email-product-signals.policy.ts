export function isLongGeneration(
  startedAt: Date | null,
  completedAt: Date | null,
): boolean {
  if (!startedAt || !completedAt) return false;
  const duration = completedAt.getTime() - startedAt.getTime();
  return Number.isFinite(duration) && duration >= 120_000;
}

export function isPurchasedCredit(credit: {
  referenceType: string | null;
  referenceId: string | null;
}): boolean {
  return (
    [
      'stripe-checkout-session:organization-payment',
      'stripe-checkout-session:managed-inference',
      'stripe-checkout-session:user-credit',
    ].includes(credit.referenceType ?? '') && Boolean(credit.referenceId)
  );
}
