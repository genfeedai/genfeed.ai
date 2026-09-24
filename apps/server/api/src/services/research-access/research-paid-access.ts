import {
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
  subscriptionStatusFromStripe,
} from '@genfeedai/contracts';

/**
 * Server-side paid research decision. Callers must not consult API-key,
 * trial, or BYOK session flags — those do not grant hosted collection.
 */
export type ResearchAccessReason =
  | 'active_paid'
  | 'paid_through'
  | 'research_paid_access_required'
  | 'research_subscription_unverified'
  | 'self_hosted';

export interface ResearchAccessDecision {
  isAllowed: boolean;
  reason: ResearchAccessReason;
}

export interface ResearchSubscriptionSnapshot {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | string | null;
  plan: string | null;
  status: string;
}

export interface ResearchAccessInput {
  isHostedSaas: boolean;
  now: Date;
  subscriptionReadFailed: boolean;
  /** Non-deleted organization subscriptions. Empty when none exist. */
  subscriptions: readonly ResearchSubscriptionSnapshot[];
  subscriptionTier: string | null;
}

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
  subscription: ResearchSubscriptionSnapshot,
  subscriptionTier: string | null,
): boolean {
  const tier = normalize(subscriptionTier);
  if (PAID_PLANS.has(normalize(subscription.plan))) return true;
  if (tier === SubscriptionTier.BYOK || tier === SubscriptionTier.FREE) {
    return false;
  }
  return PAID_TIERS.has(tier);
}

function grantForSubscription(
  subscription: ResearchSubscriptionSnapshot,
  subscriptionTier: string | null,
  now: Date,
): 'active_paid' | 'paid_through' | null {
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
 * Hosted SaaS collection requires an active paid subscription, or a
 * cancellation that is still inside the paid period. Self-hosted installs
 * do not use this subscription policy. A failed subscription read fails closed.
 */
export function resolveResearchCollectionAccess(
  input: ResearchAccessInput,
): ResearchAccessDecision {
  if (!input.isHostedSaas) {
    return { isAllowed: true, reason: 'self_hosted' };
  }
  if (input.subscriptionReadFailed) {
    return { isAllowed: false, reason: 'research_subscription_unverified' };
  }
  let paidThrough = false;
  for (const subscription of input.subscriptions) {
    const grant = grantForSubscription(
      subscription,
      input.subscriptionTier,
      input.now,
    );
    if (grant === 'active_paid') {
      return { isAllowed: true, reason: 'active_paid' };
    }
    if (grant === 'paid_through') paidThrough = true;
  }
  if (paidThrough) return { isAllowed: true, reason: 'paid_through' };
  return { isAllowed: false, reason: 'research_paid_access_required' };
}
