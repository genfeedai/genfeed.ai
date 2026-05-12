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
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const SUBSCRIPTION_CACHE_TTL_MS = 60_000;
const CREDITS_CACHE_TTL_MS = 30_000;

export function useSubscription(): UseSubscriptionReturn {
  const { user } = useUser();

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

  const {
    data: subscription = null,
    isLoading: isLoadingSubscription,
    refetch: refetchSubscription,
  } = useQuery({
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) {
        return null;
      }

      const service = await getOrganizationsService();
      const data = await service.findOrganizationSubscription(organizationId);

      return data || null;
    },
    queryKey: ['subscription', organizationId],
    staleTime: SUBSCRIPTION_CACHE_TTL_MS,
  });

  const {
    data: creditsBreakdown = null,
    isLoading: isLoadingCredits,
    refetch: refetchCredits,
    error: creditsError,
  } = useQuery({
    enabled: !!user,
    queryFn: async () => {
      if (!user) {
        return null;
      }

      const service = await getSubscriptionsService();
      const data = await service.getCreditsBreakdown();

      return data as ICreditsBreakdown;
    },
    queryKey: ['credits-breakdown', organizationId, user?.id],
    staleTime: CREDITS_CACHE_TTL_MS,
  });

  const isLoading = isLoadingSubscription || isLoadingCredits;
  const error = creditsError?.message ?? null;

  const refreshSubscription = async () => {
    await refetchSubscription();
  };

  const refreshCreditsBreakdown = async () => {
    await refetchCredits();
  };

  const openBillingPortal = async () => {
    try {
      const service = await getStripeService();
      const response: IBillingPortalResponse = await service.getPortalUrl();

      window.open(response.url, '_blank');
    } catch (error) {
      logger.error('Failed to open billing portal:', error);
      notificationsService.error('Opening billing portal');
    }
  };

  const changeSubscriptionPlan = async (newPriceId: string): Promise<void> => {
    try {
      const service = await getSubscriptionsService();
      await service.changeSubscriptionPlan(newPriceId);

      await refreshSubscription();
      await refreshCreditsBreakdown();

      notificationsService.success('Subscription plan changed');
    } catch (error) {
      logger.error('Failed to change subscription plan:', error);
      notificationsService.error('Subscription plan change');
      throw error;
    }
  };

  return {
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
