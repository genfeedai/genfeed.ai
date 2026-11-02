import { PageScope } from '@genfeedai/contracts';
import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import type { ContentScope } from '@genfeedai/contracts/interfaces/common/content-scope.interface';
import type {
  AnalyticsCacheEntry,
  AnalyticsScopedOptions,
  AnalyticsScopedReturn,
} from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { AnalyticsService } from '@genfeedai/services/analytics/analytics.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { BrandsService } from '@genfeedai/services/social/brands.service';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

const ANALYTICS_CACHE_TTL_MS = 15 * 60 * 1000;

interface UseAnalyticsOptions extends AnalyticsScopedOptions {
  endDate?: string;
  startDate?: string;
}

/** One read. When the API fails, the last saved copy stands in for it. */
interface AnalyticsRead {
  cachedAt: string | null;
  data: Partial<IAnalytics>;
  isSavedCopy: boolean;
}

export function useAnalytics({
  scope,
  scopeId: providedScopeId,
  autoLoad = true,
  startDate,
  endDate,
}: UseAnalyticsOptions): AnalyticsScopedReturn {
  const { brandId, organizationId } = useCollectionScope();

  const actualScopeId = useMemo(() => {
    if (providedScopeId) {
      return providedScopeId;
    }

    switch (scope) {
      case PageScope.SUPERADMIN:
        return undefined;
      case PageScope.ORGANIZATION:
        return organizationId;
      case PageScope.BRAND:
        return brandId;
      default:
        return undefined;
    }
  }, [providedScopeId, scope, organizationId, brandId]);

  const [selection, setSelection] = useState({
    sourceScope: scope,
    sourceScopeId: actualScopeId,
    scope,
    scopeId: actualScopeId,
  });
  const isCurrentSource =
    selection.sourceScope === scope &&
    selection.sourceScopeId === actualScopeId;
  const selectedScope = isCurrentSource ? selection.scope : scope;
  const selectedScopeId = isCurrentSource ? selection.scopeId : actualScopeId;
  if (!isCurrentSource) {
    setSelection({
      sourceScope: scope,
      sourceScopeId: actualScopeId,
      scope,
      scopeId: actualScopeId,
    });
  }
  const setSelectedScope = useCallback((nextScope: ContentScope) => {
    setSelection((previous) => ({ ...previous, scope: nextScope }));
  }, []);
  const setSelectedScopeId = useCallback((nextScopeId: string | undefined) => {
    setSelection((previous) => ({ ...previous, scopeId: nextScopeId }));
  }, []);

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const defaultAnalytics: Partial<IAnalytics> = useMemo(
    () => ({
      activePlatforms: [],
      avgEngagementRate: 0,
      engagementGrowth: 0,
      monthlyGrowth: 0,
      totalBrands: 0,
      totalCredentialsConnected: 0,
      totalEngagement: 0,
      totalPosts: 0,
      totalSubscriptions: 0,
      totalUsers: 0,
      totalViews: 0,
      viewsGrowth: 0,
    }),
    [],
  );

  const cacheKey = useMemo(
    () =>
      createCacheKey(
        'analytics',
        selectedScope,
        selectedScopeId ?? 'all',
        startDate ?? 'default',
        endDate ?? 'default',
      ),
    [selectedScope, selectedScopeId, startDate, endDate],
  );

  const analyticsCache = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return createLocalStorageCache<AnalyticsCacheEntry>({
      prefix: 'analytics:scoped:',
    });
  }, []);

  const {
    data: analyticsRead,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [
      'analytics',
      'scoped',
      autoLoad,
      selectedScope,
      selectedScopeId,
      startDate,
      endDate,
    ],
    queryFn: async (): Promise<AnalyticsRead> => {
      if (
        !autoLoad ||
        (selectedScope !== PageScope.SUPERADMIN && !selectedScopeId)
      ) {
        return { cachedAt: null, data: defaultAnalytics, isSavedCopy: false };
      }

      let data: Partial<IAnalytics> = {};
      const scopedQuery =
        startDate || endDate
          ? {
              ...(startDate ? { startDate } : {}),
              ...(endDate ? { endDate } : {}),
            }
          : undefined;

      try {
        switch (selectedScope) {
          case PageScope.SUPERADMIN: {
            const superadminService = await getAnalyticsService();
            data = await superadminService.findAll();
            break;
          }

          case PageScope.ORGANIZATION:
            if (selectedScopeId) {
              const orgService = await getOrganizationsService();
              data = await orgService.findOrganizationAnalytics(
                selectedScopeId,
                scopedQuery,
              );
            }
            break;

          case PageScope.BRAND:
            if (selectedScopeId) {
              const brandService = await getBrandsService();
              data = await brandService.findBrandAnalytics(
                selectedScopeId,
                scopedQuery,
              );
            }
            break;
        }

        if (analyticsCache) {
          analyticsCache.set(
            cacheKey,
            {
              cachedAt: new Date().toISOString(),
              data,
            },
            ANALYTICS_CACHE_TTL_MS,
          );
        }
      } catch (fetchError) {
        const cached = analyticsCache?.get(cacheKey);
        if (cached?.data) {
          return {
            cachedAt: cached.cachedAt,
            data: cached.data,
            isSavedCopy: true,
          };
        }

        throw fetchError;
      }

      return { cachedAt: null, data, isSavedCopy: false };
    },
    enabled: autoLoad,
  });

  const analytics = useMemo(
    () => analyticsRead?.data ?? defaultAnalytics,
    [analyticsRead, defaultAnalytics],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    analytics,
    cachedAt: analyticsRead?.cachedAt ?? null,
    error,
    isLoading,
    isRefreshing: isFetching && !isLoading,
    isUsingCache: analyticsRead?.isSavedCopy ?? false,
    refresh,
    scope,
    scopeId: actualScopeId,
    selectedScope,
    selectedScopeId,
    setSelectedScope,
    setSelectedScopeId,
  };
}
