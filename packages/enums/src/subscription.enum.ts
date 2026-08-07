export enum SubscriptionCategory {
  MONTHLY = 'monthly',
  PAYG = 'payg',
}

export enum SubscriptionPlan {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  PAYG = 'payg',
  ENTERPRISE = 'enterprise',
}

/**
 * Subscription tiers (credit-based)
 * See: https://github.com/genfeedai/cloud/issues?q=is%3Aissue+pricing
 */
export enum SubscriptionTier {
  FREE = 'free',
  BYOK = 'byok', // Bring Your Own Key — free tier
  PRO = 'pro', // $49/month - Pro/"Creator" card, 8,000 credits
  SCALE = 'scale', // $499/month - Scale/"Cloud Teams" card, 80,000 credits
  ENTERPRISE = 'enterprise', // custom
}

/**
 * BYOK billing state. Values match Prisma `ByokBillingStatus`.
 * @see packages/prisma/prisma/schema.prisma `enum ByokBillingStatus`
 */
export enum ByokBillingStatus {
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  SUSPENDED = 'SUSPENDED',
}

/**
 * Subscription lifecycle. Core members match Prisma `SubscriptionStatus`.
 *
 * Stripe-only extras (`INCOMPLETE_EXPIRED`, `UNPAID`, `PAUSED`) are domain
 * states used at the Stripe webhook boundary — map to a Prisma label before
 * writing the subscriptions.status column.
 *
 * `CANCELED` is a US-spelling alias of `CANCELLED` (Stripe sends `canceled`).
 *
 * @see packages/prisma/prisma/schema.prisma `enum SubscriptionStatus`
 */
export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  PAST_DUE = 'PAST_DUE',
  TRIALING = 'TRIALING',
  INCOMPLETE = 'INCOMPLETE',
  /** Stripe-only — not a Prisma SubscriptionStatus label. */
  INCOMPLETE_EXPIRED = 'INCOMPLETE_EXPIRED',
  /** Stripe-only — not a Prisma SubscriptionStatus label. */
  UNPAID = 'UNPAID',
  /** Stripe-only — not a Prisma SubscriptionStatus label. */
  PAUSED = 'PAUSED',
}

/**
 * Stripe sends US spelling `canceled`. Map to Prisma/domain `CANCELLED`.
 */
export function subscriptionStatusFromStripe(
  status: string | null | undefined,
): SubscriptionStatus {
  const normalized = String(status ?? '')
    .replace(/-/g, '_')
    .toUpperCase();
  if (normalized === 'CANCELED' || normalized === 'CANCELLED') {
    return SubscriptionStatus.CANCELLED;
  }
  if (
    Object.values(SubscriptionStatus).includes(normalized as SubscriptionStatus)
  ) {
    return normalized as SubscriptionStatus;
  }
  return SubscriptionStatus.INCOMPLETE;
}
