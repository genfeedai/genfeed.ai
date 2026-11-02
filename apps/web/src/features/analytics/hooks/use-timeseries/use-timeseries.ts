'use client';

import { PageScope } from '@genfeedai/contracts';
import type {
  DateRange,
  ITimeSeriesApiDataPoint,
} from '@genfeedai/contracts/interfaces';
import { AnalyticsService } from '@genfeedai/services/analytics/analytics.service';
import { logger } from '@genfeedai/services/core/logger.service';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import {
  getDateRangeKeys,
  getDateRangeWithDefaults,
} from '@helpers/utils/date-range.util';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useCallback, useMemo } from 'react';
import type { PlatformTimeSeriesDataPoint } from '@/props/analytics/charts.props';

const TIMESERIES_CACHE_TTL_MS = 15 * 60 * 1000;

const TIMESERIES_CACHE =
  typeof window !== 'undefined'
    ? createLocalStorageCache<PlatformTimeSeriesDataPoint[]>({
        prefix: 'analytics:timeseries:',
      })
    : null;

const TIMESERIES_CACHE_META =
  typeof window !== 'undefined'
    ? createLocalStorageCache<string>({
        prefix: 'analytics:timeseries:meta:',
      })
    : null;

const NO_POINTS: PlatformTimeSeriesDataPoint[] = [];

export interface UseTimeseriesOptions {
  scope: PageScope;
  dateRange: DateRange;
  /** Changes on the analytics Refresh: re-reads in the background. */
  refreshTrigger?: number;
}

export interface UseTimeseriesReturn {
  timeseriesData: PlatformTimeSeriesDataPoint[];
  isTimeseriesLoading: boolean;
  isTimeseriesUsingCache: boolean;
  timeseriesCachedAt: string | null;
  fetchTimeseries: () => Promise<void>;
}

/** One read. When the API fails, the last saved copy stands in for it. */
interface TimeseriesRead {
  cachedAt: string | null;
  isSavedCopy: boolean;
  points: PlatformTimeSeriesDataPoint[];
}

function toPlatformPoints(data: unknown): PlatformTimeSeriesDataPoint[] {
  const items = Array.isArray(data) ? (data as ITimeSeriesApiDataPoint[]) : [];
  return items.map((item) => ({
    date: item.date,
    facebook: item.facebook?.views ?? 0,
    instagram: item.instagram?.views ?? 0,
    linkedin: item.linkedin?.views ?? 0,
    medium: item.medium?.views ?? 0,
    pinterest: item.pinterest?.views ?? 0,
    reddit: item.reddit?.views ?? 0,
    tiktok: item.tiktok?.views ?? 0,
    twitter: item.twitter?.views ?? 0,
    youtube: item.youtube?.views ?? 0,
  }));
}

export function useTimeseries({
  dateRange,
  refreshTrigger,
  scope,
}: UseTimeseriesOptions): UseTimeseriesReturn {
  const { brandId, organizationId } = useCollectionScope();
  const scopedBrandId = scope === PageScope.BRAND ? brandId : undefined;

  const { endDateKey, startDateKey } = useMemo(
    () => getDateRangeKeys(dateRange),
    [dateRange],
  );

  const savedCopyKey = createCacheKey(
    'timeseries',
    organizationId ?? 'none',
    scope,
    brandId ?? 'none',
    startDateKey ?? 'none',
    endDateKey ?? 'none',
  );

  const query = useAuthedQuery({
    queryFn: async (service: AnalyticsService): Promise<TimeseriesRead> => {
      try {
        const { startDate, endDate } = getDateRangeWithDefaults(
          dateRange.startDate ?? undefined,
          dateRange.endDate ?? undefined,
        );
        const points = toPlatformPoints(
          await service.getTimeSeries({
            ...(scopedBrandId ? { brandId: scopedBrandId } : {}),
            endDate,
            startDate,
          }),
        );
        TIMESERIES_CACHE?.set(savedCopyKey, points, TIMESERIES_CACHE_TTL_MS);
        TIMESERIES_CACHE_META?.set(
          savedCopyKey,
          new Date().toISOString(),
          TIMESERIES_CACHE_TTL_MS,
        );
        return { cachedAt: null, isSavedCopy: false, points };
      } catch (error) {
        logger.error('Failed to fetch timeseries', error);
        const saved = TIMESERIES_CACHE?.get(savedCopyKey) ?? [];
        if (saved.length === 0) {
          return { cachedAt: null, isSavedCopy: false, points: NO_POINTS };
        }
        return {
          cachedAt: TIMESERIES_CACHE_META?.get(savedCopyKey) ?? null,
          isSavedCopy: true,
          points: saved,
        };
      }
    },
    queryKey: [
      'analytics',
      'timeseries',
      organizationId ?? null,
      scope,
      scopedBrandId ?? null,
      startDateKey,
      endDateKey,
    ],
    refreshKey: refreshTrigger,
    service: (token: string) => AnalyticsService.getInstance(token),
  });

  const { refetch } = query;
  const fetchTimeseries = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    fetchTimeseries,
    isTimeseriesLoading: query.isLoading,
    isTimeseriesUsingCache: query.data?.isSavedCopy ?? false,
    timeseriesCachedAt: query.data?.cachedAt ?? null,
    timeseriesData: query.data?.points ?? NO_POINTS,
  };
}
