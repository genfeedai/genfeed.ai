import { useAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import { AnalyticsMetric } from '@genfeedai/enums';
import { AnalyticsService } from '@genfeedai/services/analytics/analytics.service';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo, useRef, useState } from 'react';

export interface TopPostData {
  postId: string;
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
}

export interface UseTopPostsOptions {
  limit?: number;
  initialCachedAt?: string | null;
  initialData?: TopPostData[];
  metric?:
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.LIKES;
  brandId?: string;
  platform?: string;
  revalidateOnMount?: boolean;
}

const TOP_POSTS_CACHE_TTL_MS = 15 * 60 * 1000;

export function useTopPosts(options: UseTopPostsOptions = {}) {
  const {
    limit = 10,
    metric = AnalyticsMetric.VIEWS,
    brandId,
    platform,
    initialData,
    initialCachedAt = null,
    revalidateOnMount,
  } = options;
  const { dateRange, refreshTrigger } = useAnalyticsContext();

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const [cachedAt, setCachedAt] = useState<string | null>(initialCachedAt);
  const [isUsingCache, setIsUsingCache] = useState(false);
  const isMountedRef = useRef(true);

  const startDateKey = dateRange.startDate
    ? format(dateRange.startDate, 'yyyy-MM-dd')
    : null;
  const endDateKey = dateRange.endDate
    ? format(dateRange.endDate, 'yyyy-MM-dd')
    : null;

  const lsCacheKey = useMemo(
    () =>
      createCacheKey(
        'top-posts',
        limit,
        metric,
        brandId ?? 'all',
        platform ?? 'all',
        startDateKey ?? 'none',
        endDateKey ?? 'none',
      ),
    [limit, metric, brandId, platform, startDateKey, endDateKey],
  );

  const topPostsCache = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return createLocalStorageCache<TopPostData[]>({
      prefix: 'analytics:top-posts:',
    });
  }, []);

  const topPostsCacheMeta = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return createLocalStorageCache<string>({
      prefix: 'analytics:top-posts:meta:',
    });
  }, []);

  const {
    data: topPosts = [] as TopPostData[],
    error,
    isLoading,
    refetch,
  } = useQuery({
    enabled: Boolean(startDateKey && endDateKey),
    initialData: initialData ?? undefined,
    initialDataUpdatedAt:
      revalidateOnMount === false && initialData ? Date.now() : 0,
    queryFn: async () => {
      try {
        const service = await getAnalyticsService();
        const data = (await service.getTopContent({
          endDate: endDateKey!,
          limit,
          metric,
          startDate: startDateKey!,
          ...(brandId && { brand: brandId }),
          ...(platform && { platform }),
        })) as TopPostData[];

        if (topPostsCache && topPostsCacheMeta) {
          topPostsCache.set(lsCacheKey, data || [], TOP_POSTS_CACHE_TTL_MS);
          topPostsCacheMeta.set(
            lsCacheKey,
            new Date().toISOString(),
            TOP_POSTS_CACHE_TTL_MS,
          );
        }

        if (isMountedRef.current) {
          setIsUsingCache(false);
          setCachedAt(null);
        }

        return data || [];
      } catch (fetchError) {
        if (topPostsCache) {
          const cached = topPostsCache.get(lsCacheKey);
          if (cached && cached.length > 0) {
            if (isMountedRef.current) {
              setIsUsingCache(true);
              setCachedAt(topPostsCacheMeta?.get(lsCacheKey) ?? null);
            }
            return cached;
          }
        }

        throw fetchError;
      }
    },
    queryKey: [
      'top-posts',
      startDateKey,
      endDateKey,
      limit,
      metric,
      brandId,
      platform,
      refreshTrigger,
    ],
  });

  const refetchTopPosts = async () => {
    await refetch();
  };

  return {
    cachedAt,
    error,
    isLoading,
    isUsingCache,
    refetch: refetchTopPosts,
    topPosts,
  };
}
