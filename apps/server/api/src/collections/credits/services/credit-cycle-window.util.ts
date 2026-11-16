import { SubscriptionPlan } from '@genfeedai/contracts';

export interface CreditCycleWindow {
  cycleEndAt: Date;
  cycleStartAt: Date;
}

/**
 * The billing period a subscription is currently in, derived from its period
 * end and plan. Null when the organization has no subscription period (free,
 * pay-as-you-go, or a subscription that never completed checkout).
 */
export function getSubscriptionCycleWindow(
  subscription: {
    currentPeriodEnd?: Date | null;
    plan?: string | null;
  } | null,
): CreditCycleWindow | null {
  const subscriptionPlan = subscription?.plan;
  if (!subscription?.currentPeriodEnd || !subscriptionPlan) {
    return null;
  }

  const cycleEndAt = new Date(subscription.currentPeriodEnd);
  const cycleStartAt = new Date(cycleEndAt);

  if (subscriptionPlan === SubscriptionPlan.MONTHLY) {
    cycleStartAt.setMonth(cycleStartAt.getMonth() - 1);
    return { cycleEndAt, cycleStartAt };
  }

  if (subscriptionPlan === SubscriptionPlan.YEARLY) {
    cycleStartAt.setFullYear(cycleStartAt.getFullYear() - 1);
    return { cycleEndAt, cycleStartAt };
  }

  return null;
}
