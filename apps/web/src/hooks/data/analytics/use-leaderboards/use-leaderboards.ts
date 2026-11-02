'use client';

import { AnalyticsMetric, PageScope } from '@genfeedai/contracts';
import type { DateRange } from '@genfeedai/contracts/interfaces';
import {
  AnalyticsService,
  type IBrandWithStats,
  type ILeaderboardQueryParams,
  type IOrgLeaderboardItem,
} from '@genfeedai/services/analytics/analytics.service';
import { logger } from '@genfeedai/services/core/logger.service';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { getDateRangeKeys } from '@helpers/utils/date-range.util';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useCallback, useMemo } from 'react';

const LEADERBOARD_CACHE_TTL_MS = 15 * 60 * 1000;

const ORGS_LEADERBOARD_CACHE =
  typeof window !== 'undefined'
    ? createLocalStorageCache<IOrgLeaderboardItem[]>({
        prefix: 'analytics:leaderboards:orgs:',
      })
    : null;

const ORGS_LEADERBOARD_CACHE_META =
  typeof window !== 'undefined'
    ? createLocalStorageCache<string>({
        prefix: 'analytics:leaderboards:orgs:meta:',
      })
    : null;

const BRANDS_LEADERBOARD_CACHE =
  typeof window !== 'undefined'
    ? createLocalStorageCache<IBrandWithStats[]>({
        prefix: 'analytics:leaderboards:brands:',
      })
    : null;

const BRANDS_LEADERBOARD_CACHE_META =
  typeof window !== 'undefined'
    ? createLocalStorageCache<string>({
        prefix: 'analytics:leaderboards:brands:meta:',
      })
    : null;

const NO_ORGS: IOrgLeaderboardItem[] = [];
const NO_BRANDS: IBrandWithStats[] = [];

export interface UseLeaderboardsOptions {
  scope: PageScope;
  dateRange: DateRange;
  /** Changes on the analytics Refresh: re-reads in the background. */
  refreshTrigger?: number;
}

export interface UseLeaderboardsReturn {
  orgsLeaderboard: IOrgLeaderboardItem[];
  brandsLeaderboard: IBrandWithStats[];
  isLeaderboardLoading: boolean;
  isLeaderboardUsingCache: boolean;
  leaderboardCachedAt: string | null;
  fetchLeaderboards: () => Promise<void>;
}

/** One read. When the API fails, the last saved copy stands in for it. */
interface LeaderboardsRead {
  brands: IBrandWithStats[];
  cachedAt: string | null;
  isSavedCopy: boolean;
  orgs: IOrgLeaderboardItem[];
}

export function useLeaderboards({
  dateRange,
  refreshTrigger,
  scope,
}: UseLeaderboardsOptions): UseLeaderboardsReturn {
  const { endDateKey, startDateKey } = useMemo(
    () => getDateRangeKeys(dateRange),
    [dateRange],
  );
  const hasDates = Boolean(startDateKey && endDateKey);

  const orgsCacheKey = createCacheKey(
    'leaderboard:orgs',
    scope,
    startDateKey ?? 'none',
    endDateKey ?? 'none',
  );
  const brandsCacheKey = createCacheKey(
    'leaderboard:brands',
    scope,
    startDateKey ?? 'none',
    endDateKey ?? 'none',
  );

  const query = useAuthedQuery({
    enabled: hasDates,
    queryFn: async (service: AnalyticsService): Promise<LeaderboardsRead> => {
      try {
        const leaderboardQuery: ILeaderboardQueryParams = {
          endDate: endDateKey ?? undefined,
          limit: 5,
          sort: AnalyticsMetric.ENGAGEMENT,
          startDate: startDateKey ?? undefined,
        };
        const [orgs, brands] = await Promise.all([
          scope === PageScope.SUPERADMIN
            ? service.getOrganizationsLeaderboard(leaderboardQuery)
            : Promise.resolve(NO_ORGS),
          service.getBrandsLeaderboard(leaderboardQuery),
        ]);
        const savedAt = new Date().toISOString();
        ORGS_LEADERBOARD_CACHE?.set(
          orgsCacheKey,
          orgs,
          LEADERBOARD_CACHE_TTL_MS,
        );
        ORGS_LEADERBOARD_CACHE_META?.set(
          orgsCacheKey,
          savedAt,
          LEADERBOARD_CACHE_TTL_MS,
        );
        BRANDS_LEADERBOARD_CACHE?.set(
          brandsCacheKey,
          brands,
          LEADERBOARD_CACHE_TTL_MS,
        );
        BRANDS_LEADERBOARD_CACHE_META?.set(
          brandsCacheKey,
          savedAt,
          LEADERBOARD_CACHE_TTL_MS,
        );
        return { brands, cachedAt: null, isSavedCopy: false, orgs };
      } catch (error) {
        logger.error('Failed to fetch leaderboards', error);
        const savedOrgs = ORGS_LEADERBOARD_CACHE?.get(orgsCacheKey) ?? [];
        const savedBrands = BRANDS_LEADERBOARD_CACHE?.get(brandsCacheKey) ?? [];
        if (savedOrgs.length === 0 && savedBrands.length === 0) {
          return {
            brands: NO_BRANDS,
            cachedAt: null,
            isSavedCopy: false,
            orgs: NO_ORGS,
          };
        }
        return {
          brands: savedBrands,
          cachedAt:
            BRANDS_LEADERBOARD_CACHE_META?.get(brandsCacheKey) ??
            ORGS_LEADERBOARD_CACHE_META?.get(orgsCacheKey) ??
            null,
          isSavedCopy: true,
          orgs: savedOrgs,
        };
      }
    },
    queryKey: ['analytics', 'leaderboards', scope, startDateKey, endDateKey],
    refreshKey: refreshTrigger,
    service: (token: string) => AnalyticsService.getInstance(token),
  });

  const { refetch } = query;
  const fetchLeaderboards = useCallback(async () => {
    // refetch() ignores `enabled`; without a date range there is nothing to rank.
    if (hasDates) {
      await refetch();
    }
  }, [hasDates, refetch]);

  return {
    brandsLeaderboard: query.data?.brands ?? NO_BRANDS,
    fetchLeaderboards,
    isLeaderboardLoading: query.isLoading,
    isLeaderboardUsingCache: query.data?.isSavedCopy ?? false,
    leaderboardCachedAt: query.data?.cachedAt ?? null,
    orgsLeaderboard: query.data?.orgs ?? NO_ORGS,
  };
}
