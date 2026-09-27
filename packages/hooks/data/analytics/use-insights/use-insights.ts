'use client';

import { useAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import type { Insight } from '@genfeedai/props/analytics/insights.props';
import { InsightsService } from '@genfeedai/services/analytics/insights.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

interface UseInsightsOptions {
  brandId?: string;
  enabled?: boolean;
}

type InsightsStatus = 'available' | 'empty' | 'unavailable';

interface UseInsightsReturn {
  insights: Insight[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  status: InsightsStatus;
  unavailableReason: string | null;
  refresh: () => Promise<void>;
  markInsightRead: (id: string) => Promise<void>;
  dismissInsight: (id: string) => Promise<void>;
}

/**
 * AI-generated insights for the current organization, backed by the real
 * `GET /insights` / `PATCH /insights/:id` routes on `InsightsController`.
 */
export function useInsights({
  brandId,
  enabled = true,
}: UseInsightsOptions = {}): UseInsightsReturn {
  const { refreshTrigger } = useAnalyticsContext();

  const getInsightsService = useAuthedService((token: string) =>
    InsightsService.getInstance(token),
  );

  // `GET /insights` is org-scoped only (no brand filter), so brandId is not
  // sent to the service — it's kept in the cache key so switching brands
  // still invalidates a stale render, matching the enabled gate below.
  const insightsQueryKey = ['insights', brandId, refreshTrigger];

  const {
    data: insights = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<Insight[]>({
    enabled,
    queryFn: async ({ signal }) => {
      const service = await getInsightsService();
      return service.getInsights(undefined, signal);
    },
    queryKey: insightsQueryKey,
  });

  const isRefreshing = isFetching && !isLoading;
  const status: InsightsStatus =
    error !== null
      ? 'unavailable'
      : insights.length > 0
        ? 'available'
        : 'empty';
  const unavailableReason = error instanceof Error ? error.message : null;

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const markInsightRead = useCallback(
    async (id: string) => {
      try {
        const service = await getInsightsService();
        await service.markAsRead(id);
        await refetch();
      } catch (err) {
        logger.error('Failed to mark insight as read', { error: err, id });
      }
    },
    [getInsightsService, refetch],
  );

  const dismissInsight = useCallback(
    async (id: string) => {
      try {
        const service = await getInsightsService();
        await service.markAsDismissed(id);
        await refetch();
      } catch (err) {
        logger.error('Failed to dismiss insight', { error: err, id });
      }
    },
    [getInsightsService, refetch],
  );

  return {
    dismissInsight,
    error: error as Error | null,
    insights,
    isLoading,
    isRefreshing,
    markInsightRead,
    refresh,
    status,
    unavailableReason,
  };
}
