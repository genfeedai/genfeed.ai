import { shouldShowCreditsNav } from '@genfeedai/config/license';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { SubscriptionStatus } from '@genfeedai/contracts';
import type {
  IBillingPortalResponse,
  ICreditsBreakdown,
  SubscriptionChangePreview,
} from '@genfeedai/contracts/interfaces';
import type { UseSubscriptionReturn } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { StripeService } from '@genfeedai/services/billing/stripe.service';
import { SubscriptionsService } from '@genfeedai/services/billing/subscriptions.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const SUBSCRIPTION_CACHE_TTL_MS = 60_000;
const CREDITS_CACHE_TTL_MS = 30_000;

export function useSubscription(): UseSubscriptionReturn {
  const { userId } = useAuthIdentity();
  const { organizationId } = useBrand();
  const queryClient = useQueryClient();

  const notificationsService = NotificationsService.getInstance();

  const getSubscriptionsService = useAuthedService((token: string) =>
    SubscriptionsService.getInstance(token),
  );

  const getStripeService = useAuthedService((token: string) =>
    StripeService.getInstance(token),
  );

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const subscriptionQueryKey = ['subscription', organizationId];
  const creditsQueryKey = [
    'credits-breakdown',
    organizationId ?? 'no-org',
    userId,
  ];

  const {
    data: subscription = null,
    isLoading: isLoadingSubscription,
    refetch: refetchSubscription,
  } = useQuery({
    queryKey: subscriptionQueryKey,
    queryFn: async () => {
      if (!organizationId) {
        return null;
      }

      const service = await getOrganizationsService();
      const data = await service.findOrganizationSubscription(organizationId);

      return data || null;
    },
    staleTime: SUBSCRIPTION_CACHE_TTL_MS,
    enabled: !!organizationId,
  });

  const hasActiveSubscription =
    subscription?.status === SubscriptionStatus.ACTIVE;
  // Wallet balance is independent of plan status — free/trial orgs still show
  // GEN in the topbar and need the low-credits shell banner. Gating only on
  // ACTIVE subscription left creditsBreakdown null while the chip showed 0.
  const shouldLoadCredits = Boolean(
    userId && (hasActiveSubscription || shouldShowCreditsNav()),
  );

  const {
    data: creditsBreakdown = null,
    isLoading: isLoadingCredits,
    refetch: refetchCredits,
    error: creditsQueryError,
  } = useQuery({
    queryKey: creditsQueryKey,
    queryFn: async () => {
      if (!userId) {
        return null;
      }

      const service = await getSubscriptionsService();
      const data = await service.getCreditsBreakdown();

      return data as ICreditsBreakdown;
    },
    staleTime: CREDITS_CACHE_TTL_MS,
    enabled: shouldLoadCredits,
  });

  const isLoading = isLoadingSubscription || isLoadingCredits;
  const error =
    creditsQueryError instanceof Error ? creditsQueryError.message : null;

  const openBillingPortal = async () => {
    try {
      const service = await getStripeService();
      // Stripe returns the customer to wherever they left the app; the server
      // only knows the origin, so the current path travels with the request.
      const returnPath =
        typeof window === 'undefined'
          ? undefined
          : `${window.location.pathname}${window.location.search}`;
      const response: IBillingPortalResponse =
        await service.getPortalUrl(returnPath);

      window.open(response.url, '_blank');
    } catch (err) {
      logger.error('Failed to open billing portal:', err);
      notificationsService.error('Opening billing portal');
    }
  };

  const previewPlanChange = async (
    newPriceId: string,
  ): Promise<SubscriptionChangePreview> => {
    try {
      const service = await getSubscriptionsService();

      return await service.previewSubscriptionChange(newPriceId);
    } catch (err) {
      logger.error('Failed to preview subscription change:', err);
      notificationsService.error('Subscription preview');
      throw err;
    }
  };

  const changeSubscriptionPlan = async (newPriceId: string): Promise<void> => {
    try {
      const service = await getSubscriptionsService();
      await service.changeSubscriptionPlan(newPriceId);

      await refetchSubscription();
      await refetchCredits();

      notificationsService.success('Subscription plan changed');
    } catch (err) {
      logger.error('Failed to change subscription plan:', err);
      notificationsService.error('Subscription plan change');
      throw err;
    }
  };

  const refreshSubscription = async () => {
    await refetchSubscription();
  };

  const refreshCreditsBreakdown = async () => {
    await refetchCredits();
  };

  return {
    changeSubscriptionPlan,
    creditsBreakdown,
    error,

    isLoading,
    isSubscriptionActive: hasActiveSubscription,

    openBillingPortal,
    previewPlanChange,
    refreshCreditsBreakdown,
    refreshSubscription,
    subscription,
  };
}
