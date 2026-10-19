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

type ActivitiesTarget =
  | { kind: 'organization'; id: string }
  | { kind: 'brand'; id: string }
  | { kind: 'all' }
  | { kind: 'none' };

/**
 * Which list a caller reads. The query key carries this, not the raw scope
 * inputs: the super-admin flag and brand id hydrate after first render, and
 * keying on them re-reads the same list under a new key (a duplicate request)
 * whenever they settle without changing what is read.
 */
function resolveActivitiesTarget({
  brandId,
  isSuperAdmin,
  organizationId,
  scope,
}: {
  brandId: string | undefined;
  isSuperAdmin: boolean;
  organizationId: string | undefined;
  scope: NonNullable<ActivitiesOptions['scope']>;
}): ActivitiesTarget {
  if (isSuperAdmin) {
    if (scope === PageScope.ORGANIZATION && organizationId) {
      return { id: organizationId, kind: 'organization' };
    }
    if (scope === PageScope.BRAND && brandId) {
      return { id: brandId, kind: 'brand' };
    }
    return { kind: 'all' };
  }

  if (scope === PageScope.BRAND && brandId) {
    return { id: brandId, kind: 'brand' };
  }
  if (organizationId) {
    return { id: organizationId, kind: 'organization' };
  }
  if (brandId) {
    return { id: brandId, kind: 'brand' };
  }
  return { kind: 'none' };
}

function activityFilterFields(activity: IActivity): (string | undefined)[] {
  return [activity.key];
}

export function useActivities({
  initialFilter = '',
  activeOnly = false,
  sort,
  autoLoad = true,
  scope = PageScope.BRAND,
  page = 1,
  limit = 20,
}: ActivitiesOptions = {}): ActivitiesReturn {
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useAuthIdentity();
  const { isLoading: isAccessStateLoading, isSuperAdmin } = useAccessState();
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

  const target = resolveActivitiesTarget({
    brandId,
    isSuperAdmin,
    organizationId,
    scope,
  });
  const targetId = 'id' in target ? target.id : null;
  // Organization-scoped keys carry the organization id so socket refreshes can
  // find them; a brand switch does not change which organization list is read.
  const keyOrganizationId =
    target.kind === 'all' || target.kind === 'none'
      ? null
      : organizationId || null;

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
      userId ?? null,
      activeOnly,
      sort,
      target.kind,
      targetId,
      keyOrganizationId,
      page,
      limit,
    ],
    queryFn: async () => {
      if (!autoLoad || !hasAuthenticatedSession) {
        return EMPTY_ACTIVITIES;
      }

      const paginationParams = {
        limit,
        page,
        ...(activeOnly ? { activeOnly } : {}),
        ...(sort ? { sort } : {}),
      };

      switch (target.kind) {
        case 'organization': {
          const service = await getOrganizationsService();
          return service.findOrganizationActivities(
            target.id,
            paginationParams,
          );
        }
        case 'brand': {
          const service = await getBrandsService();
          return service.findBrandActivities(target.id, paginationParams);
        }
        case 'all': {
          const service = await getActivitiesService();
          return service.findAll(paginationParams);
        }
        case 'none':
          return EMPTY_ACTIVITIES;
      }
    },
    enabled:
      autoLoad &&
      isAuthReady &&
      hasAuthenticatedSession &&
      // The platform-wide list is only readable once the super-admin flag is
      // known; until then the target would be the organization list.
      !(scope === PageScope.SUPERADMIN && isAccessStateLoading),
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
