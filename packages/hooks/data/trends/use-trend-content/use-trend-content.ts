'use client';

import { useBrandId } from '@genfeedai/contexts/user/brand-context/brand-context';
import type {
  TrendContentItem,
  TrendContentResponse,
  TrendsSummary,
} from '@genfeedai/props/trends/trends-page.props';
import { TrendsService } from '@genfeedai/services/social/trends.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
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

  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const {
    data: response,
    error,
    isLoading,
    isRefreshing,
    mutate,
  } = useResource<TrendContentResponse>(
    async () => {
      const service = await getTrendsService();
      return service.getTrendContent({ platform });
    },
    {
      defaultValue: {
        items: [],
        summary: EMPTY_SUMMARY,
      },
      dependencies: [brandId, platform],
    },
  );

  const refreshTrendContent = useCallback(async () => {
    const service = await getTrendsService();
    const refreshed = await service.getTrendContent({
      platform,
      refresh: true,
    });
    mutate(refreshed);
  }, [getTrendsService, mutate, platform]);

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
