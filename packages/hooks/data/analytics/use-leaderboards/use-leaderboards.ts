'use client';

import type { DateRange } from '@cloud/interfaces';
import { AnalyticsMetric } from '@genfeedai/enums';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  AnalyticsService,
  type IBrandWithStats,
  type ILeaderboardQueryParams,
  type IOrgLeaderboardItem,
} from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import { PageScope } from '@ui-constants/misc.constant';
import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

export interface UseLeaderboardsOptions {
  scope: PageScope;
  dateRange: DateRange;
  initialBrandsLeaderboard?: IBrandWithStats[];
  initialOrgsLeaderboard?: IOrgLeaderboardItem[];
  initialCachedAt?: string | null;
  revalidateOnMount?: boolean;
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

export function useLeaderboards(
  options: UseLeaderboardsOptions,
): UseLeaderboardsReturn {
  const { scope, dateRange } = options;

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const [orgsLeaderboard, setOrgsLeaderboard] = useState<IOrgLeaderboardItem[]>(
    options.initialOrgsLeaderboard ?? [],
  );
  const [brandsLeaderboard, setBrandsLeaderboard] = useState<IBrandWithStats[]>(
    options.initialBrandsLeaderboard ?? [],
  );
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(
    options.revalidateOnMount ?? options.initialBrandsLeaderboard == null,
  );
  const [leaderboardCachedAt, setLeaderboardCachedAt] = useState<string | null>(
    options.initialCachedAt ?? null,
  );
  const [isLeaderboardUsingCache, setIsLeaderboardUsingCache] = useState(false);

  const startDateKey = useMemo(
    () =>
      dateRange.startDate ? format(dateRange.startDate, 'yyyy-MM-dd') : null,
    [dateRange.startDate],
  );
  const endDateKey = useMemo(
    () => (dateRange.endDate ? format(dateRange.endDate, 'yyyy-MM-dd') : null),
    [dateRange.endDate],
  );

  const orgsCacheKey = useMemo(
    () =>
      createCacheKey(
        'leaderboard:orgs',
        scope,
        startDateKey ?? 'none',
        endDateKey ?? 'none',
      ),
    [scope, startDateKey, endDateKey],
  );

  const brandsCacheKey = useMemo(
    () =>
      createCacheKey(
        'leaderboard:brands',
        scope,
        startDateKey ?? 'none',
        endDateKey ?? 'none',
      ),
    [scope, startDateKey, endDateKey],
  );

  const fetchLeaderboards = useCallback(async () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      return;
    }

    try {
      setIsLeaderboardLoading(true);

      const service = await getAnalyticsService();
      const query: ILeaderboardQueryParams = {
        endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
        limit: 5,
        sort: AnalyticsMetric.ENGAGEMENT,
        startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
      };

      const [orgsData, brandsData] = await Promise.all([
        scope === PageScope.SUPERADMIN
          ? service.getOrganizationsLeaderboard(query)
          : Promise.resolve([]),
        service.getBrandsLeaderboard(query),
      ]);

      setOrgsLeaderboard(orgsData);
      setBrandsLeaderboard(brandsData);

      if (ORGS_LEADERBOARD_CACHE && ORGS_LEADERBOARD_CACHE_META) {
        ORGS_LEADERBOARD_CACHE.set(
          orgsCacheKey,
          orgsData,
          LEADERBOARD_CACHE_TTL_MS,
        );
        ORGS_LEADERBOARD_CACHE_META.set(
          orgsCacheKey,
          new Date().toISOString(),
          LEADERBOARD_CACHE_TTL_MS,
        );
      }

      if (BRANDS_LEADERBOARD_CACHE && BRANDS_LEADERBOARD_CACHE_META) {
        BRANDS_LEADERBOARD_CACHE.set(
          brandsCacheKey,
          brandsData,
          LEADERBOARD_CACHE_TTL_MS,
        );
        BRANDS_LEADERBOARD_CACHE_META.set(
          brandsCacheKey,
          new Date().toISOString(),
          LEADERBOARD_CACHE_TTL_MS,
        );
      }

      setIsLeaderboardUsingCache(false);
      setLeaderboardCachedAt(null);
    } catch (error) {
      logger.error('Failed to fetch leaderboards', error);

      const cachedOrgs = ORGS_LEADERBOARD_CACHE?.get(orgsCacheKey) ?? [];
      const cachedBrands = BRANDS_LEADERBOARD_CACHE?.get(brandsCacheKey) ?? [];
      const cachedOrgsAt =
        ORGS_LEADERBOARD_CACHE_META?.get(orgsCacheKey) ?? null;
      const cachedBrandsAt =
        BRANDS_LEADERBOARD_CACHE_META?.get(brandsCacheKey) ?? null;

      if (cachedOrgs.length > 0 || cachedBrands.length > 0) {
        setOrgsLeaderboard(cachedOrgs);
        setBrandsLeaderboard(cachedBrands);
        setIsLeaderboardUsingCache(true);
        setLeaderboardCachedAt(cachedBrandsAt ?? cachedOrgsAt);
      } else {
        setIsLeaderboardUsingCache(false);
        setLeaderboardCachedAt(null);
      }
    } finally {
      setIsLeaderboardLoading(false);
    }
  }, [brandsCacheKey, dateRange, getAnalyticsService, orgsCacheKey]);

  useEffect(() => {
    if (
      (options.initialBrandsLeaderboard || options.initialOrgsLeaderboard) &&
      options.revalidateOnMount === false
    ) {
      return;
    }

    fetchLeaderboards();
  }, [
    fetchLeaderboards,
    options.initialBrandsLeaderboard,
    options.initialOrgsLeaderboard,
    options.revalidateOnMount,
  ]);

  return {
    brandsLeaderboard,
    fetchLeaderboards,
    isLeaderboardLoading,
    isLeaderboardUsingCache,
    leaderboardCachedAt,
    orgsLeaderboard,
  };
}
