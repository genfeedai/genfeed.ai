import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { AnalyticsMetric } from '@genfeedai/enums';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';

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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const startDateKey = dateRange.startDate
    ? format(dateRange.startDate, 'yyyy-MM-dd')
    : null;
  const endDateKey = dateRange.endDate
    ? format(dateRange.endDate, 'yyyy-MM-dd')
    : null;

  const cacheKey = useMemo(
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

  const resource = useResource(
    async (_signal: AbortSignal) => {
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
          topPostsCache.set(cacheKey, data || [], TOP_POSTS_CACHE_TTL_MS);
          topPostsCacheMeta.set(
            cacheKey,
            new Date().toISOString(),
            TOP_POSTS_CACHE_TTL_MS,
          );
        }

        if (isMountedRef.current) {
          setIsUsingCache(false);
          setCachedAt(null);
        }

        return data || [];
      } catch (error) {
        if (topPostsCache) {
          const cached = topPostsCache.get(cacheKey);
          if (cached && cached.length > 0) {
            if (isMountedRef.current) {
              setIsUsingCache(true);
              setCachedAt(topPostsCacheMeta?.get(cacheKey) ?? null);
            }
            return cached;
          }
        }

        throw error;
      }
    },
    {
      defaultValue: [] as TopPostData[],
      dependencies: [
        startDateKey,
        endDateKey,
        limit,
        metric,
        brandId,
        platform,
        refreshTrigger,
      ],
      enabled: Boolean(startDateKey && endDateKey),
      initialData,
      revalidateOnMount: revalidateOnMount ?? initialData == null,
    },
  );

  return {
    cachedAt,
    error: resource.error,
    isLoading: resource.isLoading,
    isUsingCache,
    refetch: resource.refresh,
    topPosts: resource.data,
  };
}
