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
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
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

  // Get organization ID from user
  const organizationId = useMemo(() => {
    if (!user) {
      return undefined;
    }
    const publicData = getClerkPublicData(user as unknown as UserResource);
    return publicData.organization;
  }, [user]);
  const subscriptionCacheKey = organizationId
    ? `subscription:${organizationId}`
    : undefined;
  const creditsCacheKey = user?.id
    ? `credits-breakdown:${organizationId ?? 'no-org'}:${user.id}`
    : undefined;

  // Fetch subscription using useResource
  const {
    data: subscription = null,
    isLoading: isLoadingSubscription,
    refresh: refreshSubscription,
  } = useResource(
    async () => {
      if (!organizationId) {
        return null;
      }

      const service = await getOrganizationsService();
      const data = await service.findOrganizationSubscription(organizationId);

      return data || null;
    },
    {
      cacheKey: subscriptionCacheKey,
      cacheTimeMs: SUBSCRIPTION_CACHE_TTL_MS,
      dependencies: [organizationId],
    },
  );

  // Fetch credits breakdown using useResource
  const {
    data: creditsBreakdown = null,
    isLoading: isLoadingCredits,
    refresh: refreshCreditsBreakdown,
    error: creditsError,
  } = useResource(
    async () => {
      if (!user) {
        return null;
      }

      const service = await getSubscriptionsService();
      const data = await service.getCreditsBreakdown();

      return data as ICreditsBreakdown;
    },
    {
      cacheKey: creditsCacheKey,
      cacheTimeMs: CREDITS_CACHE_TTL_MS,
      dependencies: [user],
    },
  );

  const isLoading = isLoadingSubscription || isLoadingCredits;
  const error = creditsError?.message ?? null;

  // Open billing portal for organization
  const openBillingPortal = async () => {
    try {
      const service = await getStripeService();
      const response: IBillingPortalResponse = await service.getPortalUrl();

      // Open in new tab
      window.open(response.url, '_blank');
    } catch (error) {
      logger.error('Failed to open billing portal:', error);
      notificationsService.error('Opening billing portal');
    }
  };

  // Preview subscription change
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

  // Change subscription plan
  const changeSubscriptionPlan = async (newPriceId: string): Promise<void> => {
    try {
      const service = await getSubscriptionsService();
      await service.changeSubscriptionPlan(newPriceId);

      // Refresh subscription data
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
