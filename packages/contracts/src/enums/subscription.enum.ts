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

const SUBSCRIPTION_PLANS = new Set<string>(Object.values(SubscriptionPlan));

/**
 * `subscriptions.plan` is a String column, so reads arrive as `string | null`.
 * Cross that boundary here rather than casting: an unrecognised value returns
 * `null` so callers decide what an unknown plan means instead of silently
 * behaving like a known one.
 */
export function parseSubscriptionPlan(
  value: string | null | undefined,
): SubscriptionPlan | null {
  if (!value || !SUBSCRIPTION_PLANS.has(value)) {
    return null;
  }
  return value as SubscriptionPlan;
}

/**
 * Subscription tiers (credit-based).
 *
 * Prices and credit grants deliberately live nowhere near this enum: the grant
 * is Stripe price metadata at runtime, with `TIER_INCLUDED_MONTHLY_CREDITS` in
 * `@genfeedai/pricing` as the published fallback. Repeating either here only
 * produces comments that go stale on the next reprice.
 */
export enum SubscriptionTier {
  FREE = 'free',
  BYOK = 'byok', // Bring Your Own Key — free tier
  PRO = 'pro',
  SCALE = 'scale',
  ENTERPRISE = 'enterprise', // custom terms, contact sales
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
 * writing the subscriptions.status column via `toPrismaSubscriptionStatus`.
 *
 * Stripe sends US spelling `canceled`; domain/Prisma use `CANCELLED`.
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

/** Prisma-backed SubscriptionStatus labels (no Stripe-only extras). */
export type PrismaSubscriptionStatus =
  | SubscriptionStatus.ACTIVE
  | SubscriptionStatus.CANCELLED
  | SubscriptionStatus.PAST_DUE
  | SubscriptionStatus.TRIALING
  | SubscriptionStatus.INCOMPLETE;

/**
 * Stripe sends US spelling `canceled`. Map to Prisma/domain `CANCELLED`.
 * Also accepts legacy lowercase / hyphenated domain spellings.
 */
export function subscriptionStatusFromStripe(
  status: string | null | undefined,
): SubscriptionStatus {
  const normalized = String(status ?? '')
    .replace(/-/g, '_')
    .toUpperCase();
  if (!normalized) {
    return SubscriptionStatus.INCOMPLETE;
  }
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

/**
 * Map domain/Stripe status to a Prisma-safe SubscriptionStatus label.
 * Domain-only Stripe states collapse onto the nearest Prisma member.
 */
export function toPrismaSubscriptionStatus(
  status: string | null | undefined,
): PrismaSubscriptionStatus {
  const domain = subscriptionStatusFromStripe(status);
  switch (domain) {
    case SubscriptionStatus.ACTIVE:
    case SubscriptionStatus.CANCELLED:
    case SubscriptionStatus.PAST_DUE:
    case SubscriptionStatus.TRIALING:
    case SubscriptionStatus.INCOMPLETE:
      return domain;
    case SubscriptionStatus.INCOMPLETE_EXPIRED:
      return SubscriptionStatus.INCOMPLETE;
    case SubscriptionStatus.UNPAID:
      return SubscriptionStatus.PAST_DUE;
    case SubscriptionStatus.PAUSED:
      return SubscriptionStatus.CANCELLED;
    default:
      return SubscriptionStatus.INCOMPLETE;
  }
}
