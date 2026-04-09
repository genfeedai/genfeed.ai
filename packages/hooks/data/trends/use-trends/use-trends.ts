'use client';

import { useBrandId } from '@genfeedai/contexts/user/brand-context/brand-context';
import type {
  TrendItem,
  TrendsResponse,
  TrendsSummary,
} from '@genfeedai/props/trends/trends-page.props';
import { TrendsService } from '@genfeedai/services/social/trends.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
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

  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const platformParam =
    selectedPlatform === 'all' ? undefined : selectedPlatform;

  useEffect(() => {
    setSelectedPlatform(initialPlatform);
  }, [initialPlatform]);

  const {
    data: response,
    isLoading,
    isRefreshing,
    error,
    refresh,
    mutate,
  } = useResource<TrendsResponse>(
    async () => {
      const service = await getTrendsService();
      return service.getTrendsDiscovery({ platform: platformParam });
    },
    {
      defaultValue: { summary: EMPTY_SUMMARY, trends: [] },
      dependencies: [platformParam, brandId],
    },
  );

  const trends = useMemo(() => response.trends || [], [response.trends]);
  const summary = useMemo(
    () => response.summary || EMPTY_SUMMARY,
    [response.summary],
  );

  const refreshTrends = useCallback(async () => {
    const service = await getTrendsService();
    await service.refreshTrends();
    // Re-fetch after refresh
    const freshData = await service.getTrendsDiscovery({
      platform: platformParam,
    });
    mutate(freshData);
  }, [getTrendsService, platformParam, mutate]);

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
