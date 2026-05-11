import { useUser } from '@clerk/nextjs';
import type { UserResource } from '@clerk/types';
import { SubscriptionStatus } from '@genfeedai/enums';
import type {
  IBillingPortalResponse,
  ICreditsBreakdown,
} from '@genfeedai/interfaces';
import type { UseSubscriptionReturn } from '@genfeedai/interfaces/hooks/hooks.interface';
import { StripeService } from '@genfeedai/services/billing/stripe.service';
import { SubscriptionsService } from '@genfeedai/services/billing/subscriptions.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { getClerkPublicData } from '@helpers/auth/clerk.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

const SUBSCRIPTION_CACHE_TTL_MS = 60_000;
const CREDITS_CACHE_TTL_MS = 30_000;

export function useSubscription(): UseSubscriptionReturn {
  const { user } = useUser();
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

  const organizationId = useMemo(() => {
    if (!user) {
      return undefined;
    }
    const publicData = getClerkPublicData(user as unknown as UserResource);
    return publicData.organization;
  }, [user]);

  const subscriptionQueryKey = ['subscription', organizationId];
  const creditsQueryKey = [
    'credits-breakdown',
    organizationId ?? 'no-org',
    user?.id,
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

  const {
    data: creditsBreakdown = null,
    isLoading: isLoadingCredits,
    refetch: refetchCredits,
    error: creditsQueryError,
  } = useQuery({
    queryKey: creditsQueryKey,
    queryFn: async () => {
      if (!user) {
        return null;
      }

      const service = await getSubscriptionsService();
      const data = await service.getCreditsBreakdown();

      return data as ICreditsBreakdown;
    },
    staleTime: CREDITS_CACHE_TTL_MS,
    enabled: !!user,
  });

  const isLoading = isLoadingSubscription || isLoadingCredits;
  const error =
    creditsQueryError instanceof Error ? creditsQueryError.message : null;

  const openBillingPortal = async () => {
    try {
      const service = await getStripeService();
      const response: IBillingPortalResponse = await service.getPortalUrl();

      window.open(response.url, '_blank');
    } catch (err) {
      logger.error('Failed to open billing portal:', err);
      notificationsService.error('Opening billing portal');
    }
  };

  // const postSubscriptionPreview = async (
  //   newPriceId: string,
  // ): Promise<ISubscriptionPreview> => {
  //   try {
  //     const token: string =
  //     const service = SubscriptionsService.getInstance(token);

  //     const body: Partial<ISubscriptionPreview> = {
  //       price: newPriceId,
  //     };

  //     return await service.postSubscriptionPreview(body);
  //   } catch (error) {
  //     logger.error('Failed to preview subscription change:', error);
  //     notificationsService.error('Subscription preview');
  //     setError('Failed to preview subscription change');
  //     throw error;
  //   }
  // };

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
    // postSubscriptionPreview,
    changeSubscriptionPlan,
    creditsBreakdown,
    error,

    isLoading,
    isSubscriptionActive: subscription?.status === SubscriptionStatus.ACTIVE,

    openBillingPortal,
    refreshCreditsBreakdown,
    refreshSubscription,
    subscription,
  };
}
