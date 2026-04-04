import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAsyncList } from '@/hooks/use-async-data';
import {
  type AnalyticsOverview,
  type AnalyticsQueryOptions,
  analyticsService,
  type EngagementBreakdown,
  type PlatformStats,
  type TopContent,
} from '@/services/api/analytics.service';

interface AnalyticsData {
  overview: AnalyticsOverview | null;
  topContent: TopContent[];
  platformStats: PlatformStats[];
  engagement: EngagementBreakdown | null;
}

const INITIAL_DATA: AnalyticsData = {
  engagement: null,
  overview: null,
  platformStats: [],
  topContent: [],
};

export function useAnalytics(options?: AnalyticsQueryOptions) {
  const { getToken } = useAuth();
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
      const opts = optionsRef.current;
      const [overviewRes, topContentRes, platformRes, engagementRes] =
        await Promise.all([
          analyticsService.getOverview(token, opts),
          analyticsService.getTopContent(token, { ...opts, limit: 5 }),
          analyticsService.getPlatformStats(token, opts),
          analyticsService.getEngagement(token, opts),
        ]);

      setData({
        engagement: engagementRes.data?.attributes || null,
        overview: overviewRes.data?.attributes || null,
        platformStats: platformRes.data?.map((item) => item.attributes) || [],
        topContent: topContentRes.data?.map((item) => item.attributes) || [],
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
  const result = useAsyncList<TopContent, AnalyticsQueryOptions>(
    async (token, opts) => {
      const response = await analyticsService.getTopContent(token, opts);
      return {
        data: response.data?.map((item) => item.attributes) || [],
      };
    },
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
