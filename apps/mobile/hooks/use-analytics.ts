import {
  isRecord,
  readNonBlankStringOrNull,
} from '@genfeedai/contracts/constants/type-guards.constant';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMobileAuth } from '@/contexts/auth-context';
import { useAsyncList } from '@/hooks/use-async-data';
import {
  type AnalyticsQueryOptions,
  analyticsService,
} from '@/services/api/analytics.service';
import { loadRequestScope } from '@/services/api/request-scope';

interface AnalyticsOverviewView {
  avgEngagementRate: number;
  engagementGrowth: number;
  totalEngagement: number;
  totalPosts: number;
  totalViews: number;
  viewsGrowth: number;
}

interface TopPostView {
  label: string;
  platform: string;
  postId: string;
  totalViews: number;
}

interface PlatformStatView {
  engagementRate: number;
  platform: string;
  postCount: number;
  views: number;
}

interface EngagementView {
  comments: number;
  commentsPercentage: number;
  likes: number;
  likesPercentage: number;
  saves: number;
  savesPercentage: number;
  shares: number;
  sharesPercentage: number;
}

interface AnalyticsData {
  engagement: EngagementView | null;
  overview: AnalyticsOverviewView | null;
  platformStats: PlatformStatView[];
  topContent: TopPostView[];
}

const INITIAL_DATA: AnalyticsData = {
  engagement: null,
  overview: null,
  platformStats: [],
  topContent: [],
};

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readOverview(attributes: unknown): AnalyticsOverviewView {
  const record = isRecord(attributes) ? attributes : {};
  const growth = isRecord(record.growth) ? record.growth : {};

  return {
    avgEngagementRate: readNumber(record.avgEngagementRate),
    engagementGrowth: readNumber(growth.engagement),
    totalEngagement: readNumber(record.totalEngagement),
    totalPosts: readNumber(record.totalPosts),
    totalViews: readNumber(record.totalViews),
    viewsGrowth: readNumber(growth.views),
  };
}

function readTopPost(attributes: unknown): TopPostView {
  const record = isRecord(attributes) ? attributes : {};

  return {
    label: readNonBlankStringOrNull(record.label) ?? 'Untitled',
    platform: readNonBlankStringOrNull(record.platform) ?? '',
    postId: readNonBlankStringOrNull(record.postId) ?? '',
    totalViews: readNumber(record.totalViews),
  };
}

function readTopPosts(resources: { attributes?: unknown }[]): TopPostView[] {
  return resources.map((resource) => readTopPost(resource.attributes));
}

function readPlatforms(
  resources: { attributes?: unknown }[],
): PlatformStatView[] {
  return resources.flatMap((resource) => {
    const record = isRecord(resource.attributes) ? resource.attributes : null;
    const platform = record ? readNonBlankStringOrNull(record.platform) : null;
    if (!record || !platform) {
      return [];
    }

    return [
      {
        engagementRate: readNumber(record.engagementRate),
        platform,
        postCount: readNumber(record.postCount),
        views: readNumber(record.views),
      },
    ];
  });
}

function readEngagement(attributes: unknown): EngagementView {
  const record = isRecord(attributes) ? attributes : {};
  const percentages = isRecord(record.percentages) ? record.percentages : {};

  return {
    comments: readNumber(record.comments),
    commentsPercentage: readNumber(percentages.comments),
    likes: readNumber(record.likes),
    likesPercentage: readNumber(percentages.likes),
    saves: readNumber(record.saves),
    savesPercentage: readNumber(percentages.saves),
    shares: readNumber(record.shares),
    sharesPercentage: readNumber(percentages.shares),
  };
}

export function useAnalytics(options?: AnalyticsQueryOptions) {
  const { getToken } = useMobileAuth();
  const [data, setData] = useState<AnalyticsData>(INITIAL_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const token = await getToken();
    if (!token) {
      setError(new Error('Not authenticated'));
      setIsLoading(false);
      return;
    }

    try {
      const scope = await loadRequestScope(token);
      const opts = optionsRef.current;
      const [overviewRes, topContentRes, platformRes, engagementRes] =
        await Promise.all([
          analyticsService.getOverview(token, scope, opts),
          analyticsService.getTopContent(token, scope, { ...opts, limit: 5 }),
          analyticsService.getPlatformStats(token, scope, opts),
          analyticsService.getEngagement(token, scope, opts),
        ]);

      setData({
        engagement: engagementRes.data
          ? readEngagement(engagementRes.data.attributes)
          : null,
        overview: overviewRes.data
          ? readOverview(overviewRes.data.attributes)
          : null,
        platformStats: readPlatforms(platformRes.data ?? []),
        topContent: readTopPosts(topContentRes.data ?? []),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to fetch analytics'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    data,
    error,
    isLoading,
    refetch: fetchAnalytics,
  };
}

export function useTopContent(options?: AnalyticsQueryOptions) {
  const fetchTop = useCallback(
    async (token: string, opts?: AnalyticsQueryOptions) => {
      const scope = await loadRequestScope(token);
      const response = await analyticsService.getTopContent(token, scope, opts);
      return { data: readTopPosts(response.data ?? []) };
    },
    [],
  );

  const result = useAsyncList<TopPostView, AnalyticsQueryOptions>(
    fetchTop,
    'topContent',
    { options },
  );

  return {
    error: result.error,
    isLoading: result.isLoading,
    refetch: result.refetch,
    topContent: result.data,
  };
}
