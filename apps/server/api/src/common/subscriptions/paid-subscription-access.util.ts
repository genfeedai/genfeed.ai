import {
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
  subscriptionStatusFromStripe,
} from '@genfeedai/contracts';

/**
 * The canonical server-side "does this organization pay us" decision. Reads
 * only the persisted subscription rows and the organization's tier — never
 * session flags, API keys, or BYOK settings. Research collection access, the
 * agent free-tier model lock, and BYOK entitlement all decide through it.
 *
 * A subscription row is not the only way to be paid: an organization with a
 * paid tier and no subscription row at all (an operator-granted tier, or a
 * linked billing account's own tier) is also a grant — see
 * {@link resolveOrganizationPaidGrant}. `OrganizationPaidAccessService`
 * additionally runs this same decision against a linked billing account's
 * subscriptions and tier, since a billing-account-linked organization has no
 * subscription rows of its own to read here.
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
 * A paid plan on the subscription row or a paid tier on the organization is
 * enough. The free tier never grants access on its own, and a trial never
 * does, even when its period end is still ahead.
 */
function isPaidProduct(
  subscription: PaidSubscriptionSnapshot,
  subscriptionTier: string | null,
): boolean {
  if (PAID_PLANS.has(normalize(subscription.plan))) return true;
  return PAID_TIERS.has(normalize(subscriptionTier));
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
 *
 * An organization with no subscription rows at all — never billed through
 * Stripe, e.g. an operator-granted enterprise/pro tier set directly on
 * organization settings — falls back to the tier alone: a paid tier with no
 * billing history is an unconditional grant, since there is no period end to
 * check it against. This fallback only applies when there is truly no row to
 * examine; a real row's own status still governs once one exists (a trialing
 * row does not become paid just because the tier happens to read PRO).
 */
export function resolveOrganizationPaidGrant(
  subscriptions: readonly PaidSubscriptionSnapshot[],
  subscriptionTier: string | null,
  now: Date,
): PaidSubscriptionGrant | null {
  if (subscriptions.length === 0) {
    return PAID_TIERS.has(normalize(subscriptionTier)) ? 'active_paid' : null;
  }
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
