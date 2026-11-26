import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { PageScope } from '@genfeedai/contracts';
import { EMPTY_PAGE_TOTALS } from '@genfeedai/contracts/constants';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

const EMPTY_ACTIVITIES: IActivity[] = [];

/** The API accepts this many ids in one bulk read-state change. */
const BULK_PATCH_MAX_IDS = 100;

/**
 * Sends read state in API-sized chunks. `onWritten` runs after every chunk the
 * API accepted, so a later chunk that fails still refreshes what was saved.
 */
async function bulkPatchReadState(
  service: Pick<ActivitiesService, 'bulkPatch'>,
  ids: string[],
  isRead: boolean,
  onWritten: () => void,
) {
  let last: Awaited<ReturnType<ActivitiesService['bulkPatch']>> | undefined;
  for (let start = 0; start < ids.length; start += BULK_PATCH_MAX_IDS) {
    last = await service.bulkPatch({
      ids: ids.slice(start, start + BULK_PATCH_MAX_IDS),
      isRead,
      type: 'activity-bulk-patch',
    });
    onWritten();
  }
  return last;
}

/**
 * A post row stands for every activity folded into it, so a read-state change
 * on the row reaches all of them.
 */
function expandActivityIds(
  activities: readonly IActivity[],
  ids: readonly string[],
): string[] {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  return [
    ...new Set(ids.flatMap((id) => byId.get(id)?.postGroup?.eventIds ?? [id])),
  ];
}

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
  search,
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
  const queryClient = useQueryClient();

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
      search ?? null,
      target.kind,
      targetId,
      keyOrganizationId,
      page,
      limit,
    ],
    queryFn: async () => {
      if (!autoLoad || !hasAuthenticatedSession) {
        return null;
      }

      const paginationParams = {
        limit,
        page,
        ...(activeOnly ? { activeOnly } : {}),
        ...(sort ? { sort } : {}),
        ...(search ? { search } : {}),
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
          return service.findAllPage(paginationParams);
        }
        case 'none':
          return null;
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

  const activities = activitiesData?.items ?? EMPTY_ACTIVITIES;

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

  // A read-state change also moves the dot on the Activity menu item.
  const refetchAfterReadChange = useCallback(() => {
    void refetch();
    void queryClient.invalidateQueries({
      queryKey: ['activities', userId ?? null, 'unread-count'],
    });
  }, [queryClient, refetch, userId]);

  const patchActivities = useCallback(
    async (activityIds: string[]) => {
      if (activityIds.length === 0) {
        return;
      }

      let isWritten = false;
      try {
        await withSilentOperation({
          errorMessage: 'Failed to mark activities as read',
          operation: async () =>
            await bulkPatchReadState(
              await getActivitiesService(),
              activityIds,
              true,
              () => {
                isWritten = true;
              },
            ),
          url: `PATCH /activities/bulk [${activityIds.length} activities]`,
        });
      } finally {
        // Chunks already saved stay saved, so the list and the dot follow them.
        if (isWritten) refetchAfterReadChange();
      }
    },
    [getActivitiesService, refetchAfterReadChange],
  );

  const clearCompletedActivities = useCallback(
    async (activityIds: string[]) => {
      if (activityIds.length === 0) {
        return;
      }

      await withSilentOperation({
        errorMessage: 'Failed to clear completed activities',
        onSuccess: refetchAfterReadChange,
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
    [getActivitiesService, refetchAfterReadChange],
  );

  const markActivitiesAsRead = useCallback(
    async (activityIds?: string[]) => {
      let idsToMark: string[];

      if (activityIds && activityIds.length > 0) {
        idsToMark = activityIds;
      } else {
        idsToMark = activities.filter((a) => !a.isRead).map((a) => a.id);
      }

      await patchActivities(expandActivityIds(activities, idsToMark));
    },
    [activities, patchActivities],
  );

  const toggleActivityRead = useCallback(
    async (activityId: string) => {
      const activity = activities.find((a) => a.id === activityId);
      if (!activity) {
        return;
      }

      let isWritten = false;
      try {
        await withSilentOperation({
          errorMessage: 'Failed to update activity status',
          operation: async () => {
            const service = await getActivitiesService();
            if (activity.postGroup) {
              return await bulkPatchReadState(
                service,
                activity.postGroup.eventIds,
                !activity.isRead,
                () => {
                  isWritten = true;
                },
              );
            }
            const patched = await service.patch(activityId, {
              id: activityId,
              isRead: !activity.isRead,
            });
            isWritten = true;
            return patched;
          },
          url: `PATCH /activities/${activityId} [toggle read]`,
        });
      } finally {
        if (isWritten) refetchAfterReadChange();
      }
    },
    [activities, getActivitiesService, refetchAfterReadChange],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    activities,
    pageTotals: activitiesData
      ? {
          totalDocs: activitiesData.total,
          totalPages: activitiesData.totalPages,
        }
      : EMPTY_PAGE_TOTALS,
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
