import { getSubscriptionCycleWindow } from '@api/collections/credits/services/credit-cycle-window.util';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { traced } from '@libs/tracing/traced';

interface AdminBillingSubscription {
  currentPeriodEnd: Date | null;
  currentPeriodStart: Date | null;
  plan: string | null;
  stripePriceId: string | null;
}

/**
 * Credits the subscription's whole period grants, the denominator that matches
 * its ledger window: a yearly plan reads a year of usage, so it divides by
 * twelve months of credits. A plan with no period length falls back to the
 * price's monthly credits.
 */
export const resolveAdminPlanLimit = traced(
  'resolveAdminPlanLimit',
  async (
    creditGrantService: Pick<
      SubscriptionCreditGrantService,
      'resolveMonthlyCredits' | 'resolvePlanCredits'
    >,
    subscription: AdminBillingSubscription | undefined,
  ): Promise<number> => {
    if (!subscription) {
      return 0;
    }

    return (
      (await creditGrantService.resolvePlanCredits(
        subscription.plan,
        subscription.stripePriceId,
      )) ??
      (await creditGrantService.resolveMonthlyCredits(
        subscription.stripePriceId,
      )) ??
      0
    );
  },
);

/** Only a plan meter reports usage, so only a plan reads the ledger. */
export const resolveAdminCycleUsed = traced(
  'resolveAdminCycleUsed',
  async (
    creditsUtilsService: Pick<CreditsUtilsService, 'getCycleRemainingMetrics'>,
    organizationId: string,
    subscription: AdminBillingSubscription | undefined,
    planLimit: number,
    balance: number,
  ): Promise<number> => {
    if (planLimit <= 0) {
      return 0;
    }

    const { cycleUsed } = await creditsUtilsService.getCycleRemainingMetrics(
      organizationId,
      getSubscriptionCycleWindow(subscription ?? null),
      balance,
    );

    return cycleUsed;
  },
);
