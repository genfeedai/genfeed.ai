import {
  type SubscriptionStatus,
  subscriptionStatusFromStripe,
} from '@genfeedai/contracts';
import type { IOrganizationBilling } from '@genfeedai/contracts/interfaces';

/** Free is not a Stripe price, so an organization with no subscription row reports it. */
const FREE_TIER = 'free';

export interface OrganizationBillingSource {
  id: string;
  label: string;
  ownerEmail: string | null;
}

export interface SubscriptionBillingSource {
  currentPeriodEnd: Date | null;
  plan: string | null;
  status: string;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  stripeSubscriptionId: string | null;
}

export interface OrganizationBillingInput {
  /** Spendable credits: settled balance minus held. Zero when no wallet exists. */
  balance: number;
  organization: OrganizationBillingSource;
  /** Credits one billing period of the subscription's price includes. */
  planLimit: number;
  subscription: SubscriptionBillingSource | null;
  /** The tier the price maps to, else the organization's stored tier. */
  tier: string | null;
}

export function buildOrganizationBillingRow(
  input: OrganizationBillingInput,
): IOrganizationBilling {
  const { balance, organization, planLimit, subscription } = input;

  // A plan with no resolvable grant reports 0% used rather than dividing by
  // zero; the row still shows so the gap is visible, not hidden.
  const usedCredits = planLimit > 0 ? Math.max(0, planLimit - balance) : 0;
  const usedPercent =
    planLimit > 0
      ? Math.min(100, Math.max(0, (usedCredits / planLimit) * 100))
      : 0;

  const status: SubscriptionStatus | null = subscription
    ? subscriptionStatusFromStripe(subscription.status)
    : null;

  return {
    balance,
    currentPeriodEnd: subscription?.currentPeriodEnd
      ? subscription.currentPeriodEnd.toISOString()
      : null,
    hasSubscription: Boolean(subscription),
    isMaxedOut: usedPercent >= 90,
    isUnderUsing: planLimit > 0 && usedPercent <= 10,
    organizationId: organization.id,
    organizationName: organization.label,
    ownerEmail: organization.ownerEmail,
    plan: subscription?.plan ?? null,
    planLimit,
    remainingPercent: 100 - usedPercent,
    status,
    stripeCustomerId: subscription?.stripeCustomerId ?? null,
    stripeSubscriptionId: subscription?.stripeSubscriptionId ?? null,
    tier: input.tier ?? (subscription ? null : FREE_TIER),
    usedCredits,
    usedPercent,
  };
}
