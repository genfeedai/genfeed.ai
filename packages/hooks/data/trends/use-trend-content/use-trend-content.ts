'use client';

import { useBrandId } from '@genfeedai/contexts/user/brand-context/brand-context';
import type {
  TrendContentItem,
  TrendContentResponse,
  TrendsSummary,
} from '@genfeedai/props/trends/trends-page.props';
import { TrendsService } from '@genfeedai/services/social/trends.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

const EMPTY_SUMMARY: TrendsSummary = {
  connectedPlatforms: [],
  lockedPlatforms: [],
  totalItems: 0,
  totalTrends: 0,
};

export interface UseTrendContentReturn {
  items: TrendContentItem[];
  summary: TrendsSummary;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refreshTrendContent: () => Promise<void>;
}

export function useTrendContent(platform?: string): UseTrendContentReturn {
  const brandId = useBrandId();
  const queryClient = useQueryClient();

  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const queryKey = useMemo(
    () => ['trend-content', brandId, platform],
    [brandId, platform],
  );

  const {
    data: response = {
      items: [],
      summary: EMPTY_SUMMARY,
    } as TrendContentResponse,
    error,
    isLoading,
    isFetching,
  } = useQuery<TrendContentResponse>({
    queryFn: async () => {
      const service = await getTrendsService();
      return service.getTrendContent({ platform });
    },
    queryKey,
  });

  const isRefreshing = isFetching && !isLoading;

  const refreshTrendContent = useCallback(async () => {
    const service = await getTrendsService();
    const refreshed = await service.getTrendContent({
      platform,
      refresh: true,
    });
    queryClient.setQueryData(queryKey, refreshed);
  }, [getTrendsService, queryClient, queryKey, platform]);

  const items = useMemo(() => response.items || [], [response.items]);
  const summary = useMemo(
    () => response.summary || EMPTY_SUMMARY,
    [response.summary],
  );

  return {
    error,
    isLoading,
    isRefreshing,
    items,
    refreshTrendContent,
    summary,
  };
}
