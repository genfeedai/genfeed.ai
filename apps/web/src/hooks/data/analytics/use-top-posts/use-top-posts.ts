import { useAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import { AnalyticsMetric, type PostVisibility } from '@genfeedai/contracts';
import { AnalyticsService } from '@genfeedai/services/analytics/analytics.service';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { getDateRangeKeys } from '@helpers/utils/date-range.util';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useCallback, useMemo } from 'react';

export interface TopPostData {
  postId: string;
  source?: string | null;
  metricsStatus?: 'pending' | 'unavailable' | 'collected';
  label?: string;
  description?: string;
  platform: string;
  brandName?: string;
  brandLogo?: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  totalEngagement: number;
  engagementRate: number;
  thumbnailUrl?: string;
  ingredientUrl?: string;
  isVideo?: boolean;
  /** Observed audience; null/absent when it was never observed. */
  visibility?: PostVisibility | null;
}

export interface UseTopPostsOptions {
  limit?: number;
  metric?:
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.LIKES;
  brandId?: string;
  platform?: string;
  /** Restrict to posts captured by the browser extension. */
  source?: 'extension';
}

const TOP_POSTS_CACHE_TTL_MS = 15 * 60 * 1000;

const TOP_POSTS_CACHE =
  typeof window !== 'undefined'
    ? createLocalStorageCache<TopPostData[]>({ prefix: 'analytics:top-posts:' })
    : null;

const TOP_POSTS_CACHE_META =
  typeof window !== 'undefined'
    ? createLocalStorageCache<string>({ prefix: 'analytics:top-posts:meta:' })
    : null;

const NO_POSTS: TopPostData[] = [];

/** One read. When the API fails, the last saved copy stands in for it. */
interface TopPostsRead {
  cachedAt: string | null;
  isSavedCopy: boolean;
  posts: TopPostData[];
}

export function useTopPosts(options: UseTopPostsOptions = {}) {
  const {
    limit = 10,
    metric = AnalyticsMetric.VIEWS,
    brandId,
    platform,
    source,
  } = options;
  const { dateRange, refreshTrigger } = useAnalyticsContext();

  const { endDateKey, startDateKey } = useMemo(
    () => getDateRangeKeys(dateRange),
    [dateRange],
  );
  const hasDates = Boolean(startDateKey && endDateKey);

  const savedCopyKey = createCacheKey(
    'top-posts',
    limit,
    metric,
    brandId ?? 'all',
    platform ?? 'all',
    source ?? 'all',
    startDateKey ?? 'none',
    endDateKey ?? 'none',
  );

  const query = useAuthedQuery({
    enabled: hasDates,
    queryFn: async (service: AnalyticsService): Promise<TopPostsRead> => {
      try {
        const posts =
          ((await service.getTopContent({
            endDate: endDateKey ?? undefined,
            limit,
            metric,
            startDate: startDateKey ?? undefined,
            ...(brandId && { brand: brandId }),
            ...(platform && { platform }),
            ...(source && { source }),
          })) as TopPostData[]) || NO_POSTS;
        TOP_POSTS_CACHE?.set(savedCopyKey, posts, TOP_POSTS_CACHE_TTL_MS);
        TOP_POSTS_CACHE_META?.set(
          savedCopyKey,
          new Date().toISOString(),
          TOP_POSTS_CACHE_TTL_MS,
        );
        return { cachedAt: null, isSavedCopy: false, posts };
      } catch (fetchError) {
        const saved = TOP_POSTS_CACHE?.get(savedCopyKey);
        if (!saved || saved.length === 0) {
          throw fetchError;
        }
        return {
          cachedAt: TOP_POSTS_CACHE_META?.get(savedCopyKey) ?? null,
          isSavedCopy: true,
          posts: saved,
        };
      }
    },
    queryKey: [
      'analytics',
      'top-posts',
      startDateKey,
      endDateKey,
      limit,
      metric,
      brandId ?? null,
      platform ?? null,
      source ?? null,
    ],
    refreshKey: refreshTrigger,
    service: (token: string) => AnalyticsService.getInstance(token),
  });

  const { refetch } = query;
  const refresh = useCallback(async () => {
    if (hasDates) {
      await refetch();
    }
  }, [hasDates, refetch]);

  return {
    cachedAt: query.data?.cachedAt ?? null,
    error: query.error,
    isLoading: query.isLoading,
    isUsingCache: query.data?.isSavedCopy ?? false,
    refetch: refresh,
    topPosts: query.data?.posts ?? NO_POSTS,
  };
}
