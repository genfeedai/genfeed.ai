import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { IAnalytics } from '@genfeedai/interfaces';
import type { ContentScope } from '@genfeedai/interfaces/common/content-scope.interface';
import type {
  AnalyticsCacheEntry,
  AnalyticsScopedOptions,
  AnalyticsScopedReturn,
} from '@genfeedai/interfaces/hooks/hooks.interface';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import { PageScope } from '@ui-constants/misc.constant';
import { useEffect, useMemo, useRef, useState } from 'react';

const ANALYTICS_CACHE_TTL_MS = 15 * 60 * 1000;

interface UseAnalyticsOptions extends AnalyticsScopedOptions {
  endDate?: string;
  initialCachedAt?: string | null;
  initialData?: Partial<IAnalytics>;
  revalidateOnMount?: boolean;
  startDate?: string;
}

export function useAnalytics({
  scope,
  scopeId: providedScopeId,
  autoLoad = true,
  startDate,
  endDate,
  initialData,
  initialCachedAt = null,
  revalidateOnMount,
}: UseAnalyticsOptions): AnalyticsScopedReturn {
  const { brandId, organizationId } = useBrand();

  // Determine the actual scopeId based on scope and context
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

  // State for selected scope (for dropdown selection in superadmin view)
  const [selectedScope, setSelectedScope] = useState<ContentScope>(scope);

  const [selectedScopeId, setSelectedScopeId] = useState<string | undefined>(
    actualScopeId,
  );

  const [cachedAt, setCachedAt] = useState<string | null>(initialCachedAt);
  const [isUsingCache, setIsUsingCache] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
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

  // Default analytics structure
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

  // Fetch analytics using useResource
  const {
    data: analyticsData,
    error,
    isLoading,
    isRefreshing,
    refresh,
  } = useResource(
    async (_signal: AbortSignal) => {
      if (!autoLoad) {
        if (isMountedRef.current) {
          setIsUsingCache(false);
          setCachedAt(null);
        }
        return defaultAnalytics;
      }

      // Validate scope requirements - return early if scopeId not ready yet
      if (selectedScope !== PageScope.SUPERADMIN && !selectedScopeId) {
        if (isMountedRef.current) {
          setIsUsingCache(false);
          setCachedAt(null);
        }
        return defaultAnalytics;
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

        if (isMountedRef.current) {
          setIsUsingCache(false);
          setCachedAt(null);
        }
      } catch (error) {
        if (analyticsCache) {
          const cached = analyticsCache.get(cacheKey);
          if (cached?.data) {
            if (isMountedRef.current) {
              setIsUsingCache(true);
              setCachedAt(cached.cachedAt);
            }
            return cached.data;
          }
        }

        throw error;
      }

      return data;
    },
    {
      dependencies: [
        autoLoad,
        selectedScope,
        selectedScopeId,
        startDate,
        endDate,
      ],
      initialData,
      revalidateOnMount: revalidateOnMount ?? initialData == null,
    },
  );

  const analytics = useMemo(
    () => analyticsData ?? defaultAnalytics,
    [analyticsData, defaultAnalytics],
  );

  return {
    analytics,
    cachedAt,
    error,
    isLoading,
    isRefreshing,
    isUsingCache,
    refresh,
    scope,
    scopeId: actualScopeId,
    selectedScope,
    selectedScopeId,
    setSelectedScope,
    setSelectedScopeId,
  };
}
