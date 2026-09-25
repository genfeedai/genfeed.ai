import {
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
  subscriptionStatusFromStripe,
} from '@genfeedai/contracts';

/**
 * The canonical server-side "does this organization pay us" decision. Reads
 * only the persisted subscription rows and the organization's tier — never
 * session flags, API keys, or BYOK settings. Research collection access and
 * the agent free-tier model lock both decide through it.
 */
export interface PaidSubscriptionSnapshot {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | string | null;
  plan: string | null;
  status: string;
}

export type PaidSubscriptionGrant = 'active_paid' | 'paid_through';

const PAID_PLANS = new Set<string>([
  SubscriptionPlan.ENTERPRISE,
  SubscriptionPlan.MONTHLY,
  SubscriptionPlan.PAYG,
  SubscriptionPlan.YEARLY,
]);

const PAID_TIERS = new Set<string>([
  SubscriptionTier.ENTERPRISE,
  SubscriptionTier.PRO,
  SubscriptionTier.SCALE,
]);

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function periodIsOpen(
  currentPeriodEnd: Date | string | null,
  now: Date,
): boolean {
  if (!currentPeriodEnd) return false;
  const end = new Date(currentPeriodEnd);
  return Number.isFinite(end.getTime()) && end.getTime() > now.getTime();
}

/**
 * A paid plan on the subscription row is enough. A paid tier is enough only
 * when the org is not BYOK-only. BYOK and free tiers never grant access on
 * their own, and a trial never does, even when its period end is still ahead.
 */
function isPaidProduct(
  subscription: PaidSubscriptionSnapshot,
  subscriptionTier: string | null,
): boolean {
  const tier = normalize(subscriptionTier);
  if (PAID_PLANS.has(normalize(subscription.plan))) return true;
  if (tier === SubscriptionTier.BYOK || tier === SubscriptionTier.FREE) {
    return false;
  }
  return PAID_TIERS.has(tier);
}

/** Grant carried by one subscription row, or null when it grants nothing. */
export function resolvePaidSubscriptionGrant(
  subscription: PaidSubscriptionSnapshot,
  subscriptionTier: string | null,
  now: Date,
): PaidSubscriptionGrant | null {
  if (!isPaidProduct(subscription, subscriptionTier)) return null;
  if (!periodIsOpen(subscription.currentPeriodEnd, now)) return null;
  const status = subscriptionStatusFromStripe(subscription.status);
  if (status === SubscriptionStatus.ACTIVE && subscription.cancelAtPeriodEnd) {
    return 'paid_through';
  }
  if (status === SubscriptionStatus.ACTIVE) return 'active_paid';
  if (status === SubscriptionStatus.CANCELLED) return 'paid_through';
  return null;
}

/**
 * Strongest grant across an organization's non-deleted subscription rows:
 * an active paid row wins over a cancellation still inside its paid period.
 */
export function resolveOrganizationPaidGrant(
  subscriptions: readonly PaidSubscriptionSnapshot[],
  subscriptionTier: string | null,
  now: Date,
): PaidSubscriptionGrant | null {
  let grant: PaidSubscriptionGrant | null = null;
  for (const subscription of subscriptions) {
    const next = resolvePaidSubscriptionGrant(
      subscription,
      subscriptionTier,
      now,
    );
    if (next === 'active_paid') return next;
    if (next === 'paid_through') grant = next;
  }
  return grant;
}
