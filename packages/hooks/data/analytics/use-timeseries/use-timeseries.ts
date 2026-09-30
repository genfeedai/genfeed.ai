'use client';

import { PageScope } from '@genfeedai/contracts';
import type {
  DateRange,
  ITimeSeriesApiDataPoint,
} from '@genfeedai/contracts/interfaces';
import type { PlatformTimeSeriesDataPoint } from '@genfeedai/props/analytics/charts.props';
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
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

export interface UseTimeseriesOptions {
  scope: PageScope;
  dateRange: DateRange;
  initialData?: PlatformTimeSeriesDataPoint[];
  initialCachedAt?: string | null;
  revalidateOnMount?: boolean;
  refreshTrigger?: number;
}

export interface UseTimeseriesReturn {
  timeseriesData: PlatformTimeSeriesDataPoint[];
  isTimeseriesLoading: boolean;
  isTimeseriesUsingCache: boolean;
  timeseriesCachedAt: string | null;
  fetchTimeseries: () => Promise<void>;
}

export function useTimeseries(
  options: UseTimeseriesOptions,
): UseTimeseriesReturn {
  const { scope, dateRange } = options;
  const { brandId, organizationId } = useCollectionScope();

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const [timeseriesData, setTimeseriesData] = useState<
    PlatformTimeSeriesDataPoint[]
  >(options.initialData ?? []);
  const [isTimeseriesLoading, setIsTimeseriesLoading] = useState(
    options.revalidateOnMount ?? options.initialData == null,
  );
  const [timeseriesCachedAt, setTimeseriesCachedAt] = useState<string | null>(
    options.initialCachedAt ?? null,
  );
  const [isTimeseriesUsingCache, setIsTimeseriesUsingCache] = useState(false);

  const { endDateKey, startDateKey } = useMemo(
    () => getDateRangeKeys(dateRange),
    [dateRange],
  );

  const timeseriesCacheKey = useMemo(
    () =>
      createCacheKey(
        'timeseries',
        organizationId ?? 'none',
        scope,
        brandId ?? 'none',
        startDateKey ?? 'none',
        endDateKey ?? 'none',
      ),
    [brandId, organizationId, scope, startDateKey, endDateKey],
  );

  const hydrationKey = JSON.stringify([
    timeseriesCacheKey,
    options.refreshTrigger,
  ]);
  const [hydration] = useState(() => ({
    key: hydrationKey,
    hasData: options.initialData != null,
  }));
  const skipInitialFetch =
    hydration.hasData &&
    hydration.key === hydrationKey &&
    (options.revalidateOnMount ?? false) === false;
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  const fetchTimeseries = useCallback(
    async (signal?: AbortSignal) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const isCancelled = () =>
        controller.signal.aborted || Boolean(signal?.aborted);
      try {
        setIsTimeseriesLoading(true);
        const service = await getAnalyticsService();
        const { startDate, endDate } = getDateRangeWithDefaults(
          dateRange?.startDate ?? undefined,
          dateRange?.endDate ?? undefined,
        );
        const data = await service.getTimeSeries({
          ...(scope === PageScope.BRAND && brandId ? { brandId } : {}),
          endDate,
          startDate,
        });

        const dataArray = Array.isArray(data) ? data : [];

        const transformedData: PlatformTimeSeriesDataPoint[] = (
          dataArray as ITimeSeriesApiDataPoint[]
        ).map((item) => ({
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

        if (isCancelled()) {
          return;
        }

        setTimeseriesData(transformedData);

        if (TIMESERIES_CACHE && TIMESERIES_CACHE_META) {
          TIMESERIES_CACHE.set(
            timeseriesCacheKey,
            transformedData,
            TIMESERIES_CACHE_TTL_MS,
          );
          TIMESERIES_CACHE_META.set(
            timeseriesCacheKey,
            new Date().toISOString(),
            TIMESERIES_CACHE_TTL_MS,
          );
        }

        setIsTimeseriesUsingCache(false);
        setTimeseriesCachedAt(null);
      } catch (error) {
        if (isCancelled()) {
          return;
        }
        logger.error('Failed to fetch timeseries', error);
        const cachedTimeseries =
          TIMESERIES_CACHE?.get(timeseriesCacheKey) ?? [];
        const cachedAt = TIMESERIES_CACHE_META?.get(timeseriesCacheKey) ?? null;

        if (cachedTimeseries.length > 0) {
          setTimeseriesData(cachedTimeseries);
          setIsTimeseriesUsingCache(true);
          setTimeseriesCachedAt(cachedAt);
        } else {
          setTimeseriesData([]);
          setIsTimeseriesUsingCache(false);
          setTimeseriesCachedAt(null);
        }
      } finally {
        if (!isCancelled()) {
          setIsTimeseriesLoading(false);
        }
      }
    },
    [brandId, dateRange, getAnalyticsService, scope, timeseriesCacheKey],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: The key includes explicit refresh events that restart the request.
  useEffect(() => {
    if (skipInitialFetch) {
      return;
    }

    const controller = new AbortController();
    void fetchTimeseries(controller.signal);
    return () => controller.abort();
  }, [fetchTimeseries, skipInitialFetch, hydrationKey]);

  return {
    fetchTimeseries,
    isTimeseriesLoading,
    isTimeseriesUsingCache,
    timeseriesCachedAt,
    timeseriesData,
  };
}
