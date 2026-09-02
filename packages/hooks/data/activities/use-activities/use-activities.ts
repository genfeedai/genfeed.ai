import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { PageScope } from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import type {
  ActivitiesOptions,
  ActivitiesReturn,
} from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { ActivitiesService } from '@genfeedai/services/social/activities.service';
import { BrandsService } from '@genfeedai/services/social/brands.service';
import { getPlaywrightAuthState } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { withSilentOperation } from '@hooks/utils/service-operation/service-operation.util';
import { useFilteredData } from '@hooks/utils/use-filtered-data/use-filtered-data';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

const EMPTY_ACTIVITIES: IActivity[] = [];

function activityFilterFields(activity: IActivity): (string | undefined)[] {
  return [activity.key];
}

export function useActivities({
  initialFilter = '',
  autoLoad = true,
  scope = PageScope.BRAND,
  page = 1,
  limit = 20,
}: ActivitiesOptions = {}): ActivitiesReturn {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuthIdentity();
  const { isSuperAdmin } = useAccessState();
  const { brandId, organizationId } = useCollectionScope();
  const playwrightAuth = getPlaywrightAuthState();
  const isAuthReady = isAuthLoaded || playwrightAuth?.isLoaded === true;
  const hasAuthenticatedSession =
    isSignedIn || playwrightAuth?.isSignedIn === true;

  const [filter, setFilter] = useState(initialFilter);

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const getActivitiesService = useAuthedService((token: string) =>
    ActivitiesService.getInstance(token),
  );

  // Platform-admin lists ignore brand/org scope — omit those ids from the key
  // so brand-context hydration does not thrash the query while ids settle.
  const scopeBrandId = scope === PageScope.SUPERADMIN ? null : brandId || null;
  const scopeOrganizationId =
    scope === PageScope.SUPERADMIN ? null : organizationId || null;

  const {
    data: activitiesData,
    error,
    isError,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [
      'activities',
      autoLoad,
      isAuthReady,
      hasAuthenticatedSession,
      isSuperAdmin,
      scope,
      scopeOrganizationId,
      scopeBrandId,
      page,
      limit,
    ],
    queryFn: async () => {
      if (!autoLoad || !hasAuthenticatedSession) {
        return EMPTY_ACTIVITIES;
      }

      let data: IActivity[] = [];
      const paginationParams = { limit, page };

      if (isSuperAdmin && scope === PageScope.ORGANIZATION && organizationId) {
        const service = await getOrganizationsService();
        data = await service.findOrganizationActivities(
          organizationId,
          paginationParams,
        );
      } else if (isSuperAdmin && scope === PageScope.BRAND && brandId) {
        const service = await getBrandsService();
        data = await service.findBrandActivities(brandId, paginationParams);
      } else if (isSuperAdmin && scope === PageScope.SUPERADMIN) {
        const service = await getActivitiesService();
        data = await service.findAll(paginationParams);
      } else if (!isSuperAdmin) {
        if (scope === PageScope.BRAND && brandId) {
          const service = await getBrandsService();
          data = await service.findBrandActivities(brandId, paginationParams);
        } else if (organizationId) {
          const service = await getOrganizationsService();
          data = await service.findOrganizationActivities(
            organizationId,
            paginationParams,
          );
        } else {
          if (brandId) {
            const service = await getBrandsService();
            data = await service.findBrandActivities(brandId, paginationParams);
          }
        }
      } else {
        const service = await getActivitiesService();
        data = await service.findAll(paginationParams);
      }

      return data;
    },
    enabled: autoLoad && isAuthReady && hasAuthenticatedSession,
    // Avoid refetch storms when shell brand context remounts this page.
    staleTime: 30_000,
  });

  const isRefreshing = isFetching && !isLoading;

  const activities = activitiesData ?? EMPTY_ACTIVITIES;

  const filteredActivities = useFilteredData({
    data: activities,
    filter,
    filterFields: activityFilterFields,
  });

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

  const patchActivities = useCallback(
    async (activityIds: string[]) => {
      if (activityIds.length === 0) {
        return;
      }

      await withSilentOperation({
        errorMessage: 'Failed to mark activities as read',
        onSuccess: () => void refetch(),
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
    },
    [getActivitiesService, refetch],
  );

  const clearCompletedActivities = useCallback(
    async (activityIds: string[]) => {
      if (activityIds.length === 0) {
        return;
      }

      await withSilentOperation({
        errorMessage: 'Failed to clear completed activities',
        onSuccess: () => void refetch(),
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
    },
    [getActivitiesService, refetch],
  );

  const markActivitiesAsRead = useCallback(
    async (activityIds?: string[]) => {
      let idsToMark: string[];

      if (activityIds && activityIds.length > 0) {
        idsToMark = activityIds;
      } else {
        idsToMark = activities.filter((a) => !a.isRead).map((a) => a.id);
      }

      await patchActivities(idsToMark);
    },
    [activities, patchActivities],
  );

  const toggleActivityRead = useCallback(
    async (activityId: string) => {
      const activity = activities.find((a) => a.id === activityId);
      if (!activity) {
        return;
      }

      await withSilentOperation({
        errorMessage: 'Failed to update activity status',
        onSuccess: () => void refetch(),
        operation: async () => {
          const service = await getActivitiesService();
          return service.patch(activityId, {
            id: activityId,
            isRead: !activity.isRead,
          });
        },
        url: `PATCH /activities/${activityId} [toggle read]`,
      });
    },
    [activities, getActivitiesService, refetch],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    activities,
    activityStats,
    clearCompletedActivities,
    error,
    filter,
    filteredActivities,
    isError,
    isLoading,
    isRefreshing,
    markActivitiesAsRead,
    refresh,
    setFilter,
    toggleActivityRead,
  };
}
