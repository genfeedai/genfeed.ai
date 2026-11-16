import { SubscriptionPlan } from '@genfeedai/contracts';

export interface CreditCycleWindow {
  cycleEndAt: Date;
  cycleStartAt: Date;
}

/**
 * The date `months` before `date`, with the day clamped to the target month's
 * last day: a period ending March 31 starts February 28, not March 3.
 */
function subtractMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * The billing period a subscription is currently in. The persisted period
 * start is used when Stripe has written one; otherwise it is derived from the
 * period end and plan. Null when the organization has no subscription period
 * (free, pay-as-you-go, or a subscription that never completed checkout).
 */
export function getSubscriptionCycleWindow(
  subscription: {
    currentPeriodEnd?: Date | null;
    currentPeriodStart?: Date | null;
    plan?: string | null;
  } | null,
): CreditCycleWindow | null {
  const subscriptionPlan = subscription?.plan;
  if (!subscription?.currentPeriodEnd || !subscriptionPlan) {
    return null;
  }

  const cycleEndAt = new Date(subscription.currentPeriodEnd);
  const persistedStart = subscription.currentPeriodStart;

  if (persistedStart && persistedStart < cycleEndAt) {
    return { cycleEndAt, cycleStartAt: new Date(persistedStart) };
  }

  if (subscriptionPlan === SubscriptionPlan.MONTHLY) {
    return { cycleEndAt, cycleStartAt: subtractMonths(cycleEndAt, 1) };
  }

  if (subscriptionPlan === SubscriptionPlan.YEARLY) {
    return { cycleEndAt, cycleStartAt: subtractMonths(cycleEndAt, 12) };
  }

  return null;
}
