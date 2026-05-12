'use client';

import { useBrandId } from '@genfeedai/contexts/user/brand-context/brand-context';
import type {
  TrendItem,
  TrendsResponse,
  TrendsSummary,
} from '@genfeedai/props/trends/trends-page.props';
import { TrendsService } from '@genfeedai/services/social/trends.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

const EMPTY_SUMMARY: TrendsSummary = {
  connectedPlatforms: [],
  lockedPlatforms: [],
  totalTrends: 0,
};

export interface UseTrendsReturn {
  trends: TrendItem[];
  summary: TrendsSummary;
  selectedPlatform: string;
  setSelectedPlatform: (platform: string) => void;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  refreshTrends: () => Promise<void>;
}

export function useTrends(initialPlatform: string = 'all'): UseTrendsReturn {
  const [selectedPlatform, setSelectedPlatform] =
    useState<string>(initialPlatform);
  const brandId = useBrandId();
  const queryClient = useQueryClient();

  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const platformParam =
    selectedPlatform === 'all' ? undefined : selectedPlatform;

  useEffect(() => {
    setSelectedPlatform(initialPlatform);
  }, [initialPlatform]);

  const queryKey = useMemo(
    () => ['trends', platformParam, brandId],
    [platformParam, brandId],
  );

  const {
    data: response = { summary: EMPTY_SUMMARY, trends: [] } as TrendsResponse,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<TrendsResponse>({
    queryFn: async () => {
      const service = await getTrendsService();
      return service.getTrendsDiscovery({ platform: platformParam });
    },
    queryKey,
  });

  const isRefreshing = isFetching && !isLoading;

  const trends = useMemo(() => response.trends || [], [response.trends]);
  const summary = useMemo(
    () => response.summary || EMPTY_SUMMARY,
    [response.summary],
  );

  const refresh = async () => {
    await refetch();
  };

  const refreshTrends = useCallback(async () => {
    const service = await getTrendsService();
    await service.refreshTrends();
    const freshData = await service.getTrendsDiscovery({
      platform: platformParam,
    });
    queryClient.setQueryData(queryKey, freshData);
  }, [getTrendsService, platformParam, queryClient, queryKey]);

  return {
    error,
    isLoading,
    isRefreshing,
    refresh,
    refreshTrends,
    selectedPlatform,
    setSelectedPlatform,
    summary,
    trends,
  };
}
