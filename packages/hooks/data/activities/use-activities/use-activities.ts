import { useAuth, useUser } from '@clerk/nextjs';
import type { UserResource } from '@clerk/types';
import type { IActivity } from '@cloud/interfaces';
import type {
  ActivitiesOptions,
  ActivitiesReturn,
} from '@cloud/interfaces/hooks/hooks.interface';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getClerkPublicData,
  getPlaywrightAuthState,
} from '@helpers/auth/clerk.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { withSilentOperation } from '@hooks/utils/service-operation/service-operation.util';
import { useFilteredData } from '@hooks/utils/use-filtered-data/use-filtered-data';
import { OrganizationsService } from '@services/organization/organizations.service';
import { ActivitiesService } from '@services/social/activities.service';
import { BrandsService } from '@services/social/brands.service';
import { PageScope } from '@ui-constants/misc.constant';
import { useMemo, useState } from 'react';

export function useActivities({
  initialFilter = '',
  autoLoad = true,
  scope = PageScope.BRAND,
  page = 1,
  limit = 20,
}: ActivitiesOptions = {}): ActivitiesReturn {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { brandId, organizationId } = useBrand();
  const playwrightAuth = getPlaywrightAuthState();
  const isAuthReady = isAuthLoaded || playwrightAuth?.isLoaded === true;
  const hasAuthenticatedSession =
    isSignedIn || playwrightAuth?.isSignedIn === true;

  const [filter, setFilter] = useState(initialFilter);

  // Compute isSuperAdmin directly from user data (don't store in state)
  const isSuperAdmin = useMemo(() => {
    if (!user) {
      return false;
    }
    const data = getClerkPublicData(user as unknown as UserResource);
    return data.isSuperAdmin === true;
  }, [user]);

  // Get services without unnecessary useMemo wrappers
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const getActivitiesService = useAuthedService((token: string) =>
    ActivitiesService.getInstance(token),
  );

  // Fetch activities based on scope using useResource
  const {
    data: activitiesData,
    isLoading,
    isRefreshing,
    refresh,
  } = useResource(
    async () => {
      if (!autoLoad || !hasAuthenticatedSession) {
        return [];
      }

      let data: IActivity[] = [];
      const paginationParams = { limit, page };

      // Load activities based on scope and user role
      if (isSuperAdmin && scope === PageScope.ORGANIZATION && organizationId) {
        // Organization scope for dashboard
        const service = await getOrganizationsService();
        data = await service.findOrganizationActivities(
          organizationId,
          paginationParams,
        );
      } else if (isSuperAdmin && scope === PageScope.BRAND && brandId) {
        // Account scope
        const service = await getBrandsService();
        data = await service.findBrandActivities(brandId, paginationParams);
      } else if (isSuperAdmin && scope === PageScope.SUPERADMIN) {
        // Global scope for superadmin
        const service = await getActivitiesService();
        data = await service.findAll(paginationParams);
      } else if (!isSuperAdmin) {
        // For non-superadmin users, respect the scope parameter
        if (scope === PageScope.BRAND && brandId) {
          const service = await getBrandsService();
          data = await service.findBrandActivities(brandId, paginationParams);
        } else if (organizationId) {
          // Default to organization scope if available
          const service = await getOrganizationsService();
          data = await service.findOrganizationActivities(
            organizationId,
            paginationParams,
          );
        } else {
          if (brandId) {
            // Fallback to brand scope if no organization
            const service = await getBrandsService();
            data = await service.findBrandActivities(brandId, paginationParams);
          }
        }
      } else {
        // Fallback to global activities service
        const service = await getActivitiesService();
        data = await service.findAll(paginationParams);
      }

      return data;
    },
    {
      dependencies: [
        autoLoad,
        isAuthReady,
        hasAuthenticatedSession,
        isSuperAdmin,
        scope,
        organizationId,
        brandId,
        page,
        limit,
      ],
      enabled: autoLoad && isAuthReady && hasAuthenticatedSession,
    },
  );

  // Ensure activities is always an array
  const activities = useMemo(() => activitiesData ?? [], [activitiesData]);

  // Filter activities using useFilteredData
  const filteredActivities = useFilteredData({
    data: activities,
    filter,
    filterFields: (activity) => [activity.key],
  });

  // Memoize expensive stats calculation
  const activityStats = useMemo(() => {
    const total = activities.length;
    const today = new Date().toDateString();
    const todayCount = activities.filter(
      (a) => new Date(a.createdAt).toDateString() === today,
    ).length;

    const statusCounts = activities.reduce(
      (acc, activity) => {
        acc[activity.value] = (acc[activity.value] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return { statusCounts, todayCount, total };
  }, [activities]);

  const patchActivities = async (activityIds: string[]) => {
    if (activityIds.length === 0) {
      return;
    }

    await withSilentOperation({
      errorMessage: 'Failed to mark activities as read',
      onSuccess: refresh,
      operation: async () => {
        const service = await getActivitiesService();
        return service.bulkPatch({
          ids: activityIds,
          isRead: true,
          type: 'activity-bulk-patch',
        });
      },
      url: `PATCH /activities/bulk [${activityIds.length} activities]`,
    });
  };

  const clearCompletedActivities = async (activityIds: string[]) => {
    if (activityIds.length === 0) {
      return;
    }

    await withSilentOperation({
      errorMessage: 'Failed to clear completed activities',
      onSuccess: refresh,
      operation: async () => {
        const service = await getActivitiesService();
        return service.bulkPatch({
          ids: activityIds,
          isDeleted: true,
          isRead: true,
          type: 'activity-bulk-patch',
        });
      },
      url: `PATCH /activities/bulk [clear ${activityIds.length} completed]`,
    });
  };

  const markActivitiesAsRead = async (activityIds?: string[]) => {
    let idsToMark: string[];

    if (activityIds && activityIds.length > 0) {
      // Mark specific activities
      idsToMark = activityIds;
    } else {
      // Mark all unread activities
      idsToMark = activities.filter((a) => !a.isRead).map((a) => a.id);
    }

    await patchActivities(idsToMark);
  };

  const toggleActivityRead = async (activityId: string) => {
    const activity = activities.find((a) => a.id === activityId);
    if (!activity) {
      return;
    }

    await withSilentOperation({
      errorMessage: 'Failed to update activity status',
      onSuccess: refresh,
      operation: async () => {
        const service = await getActivitiesService();
        return service.patch(activityId, {
          id: activityId,
          isRead: !activity.isRead,
        });
      },
      url: `PATCH /activities/${activityId} [toggle read]`,
    });
  };

  return {
    activities,
    activityStats,
    clearCompletedActivities,
    filter,
    filteredActivities,
    isLoading,
    isRefreshing,
    markActivitiesAsRead,
    refresh,
    setFilter,
    toggleActivityRead,
  };
}
