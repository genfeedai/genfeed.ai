'use client';

import { useAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import type {
  AnomalyData,
  AudienceSegment,
  ContentSuggestion,
  Insight,
  SmartAlert,
  TrendData,
} from '@genfeedai/props/analytics/insights.props';
import {
  InsightsService,
  PredictiveAnalyticsService,
} from '@genfeedai/services/analytics/insights.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

interface UseInsightsOptions {
  brandId?: string;
  enabled?: boolean;
}

interface UseInsightsReturn {
  insights: Insight[];
  anomalies: AnomalyData[];
  trends: TrendData[];
  suggestions: ContentSuggestion[];
  audiences: AudienceSegment[];
  alerts: SmartAlert[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  contentInsightsStatus: 'available' | 'empty' | 'unavailable';
  contentInsightsUnavailableReason: string | null;
  refresh: () => Promise<void>;
  markInsightRead: (id: string) => Promise<void>;
  dismissInsight: (id: string) => Promise<void>;
  markAlertRead: (id: string) => void;
  dismissAlert: (id: string) => void;
}

type ContentInsightsData = {
  anomalies: AnomalyData[];
  trends: TrendData[];
  suggestions: ContentSuggestion[];
  audiences: AudienceSegment[];
  alerts: SmartAlert[];
};

const defaultContentInsights: ContentInsightsData = {
  alerts: [],
  anomalies: [],
  audiences: [],
  suggestions: [],
  trends: [],
};

export function useInsights({
  brandId,
  enabled = true,
}: UseInsightsOptions = {}): UseInsightsReturn {
  const { dateRange, refreshTrigger } = useAnalyticsContext();

  const getInsightsService = useAuthedService((token: string) =>
    InsightsService.getInstance(token),
  );

  const getPredictiveService = useAuthedService((token: string) =>
    PredictiveAnalyticsService.getInstance(token),
  );

  const [localAlerts, setLocalAlerts] = useState<SmartAlert[]>([]);

  const insightsQueryKey = ['insights', brandId, refreshTrigger];
  const contentQueryKey = [
    'insights-content',
    brandId,
    dateRange,
    refreshTrigger,
  ];

  const {
    data: insights = [],
    isLoading: insightsLoading,
    isFetching: insightsFetching,
    error: insightsError,
    refetch: refetchInsights,
  } = useQuery<Insight[]>({
    queryKey: insightsQueryKey,
    queryFn: async ({ signal }) => {
      const service = await getInsightsService();
      return service.getInsights(undefined, signal);
    },
    enabled,
  });

  const {
    data: contentInsightsData = defaultContentInsights,
    isLoading: contentLoading,
    isFetching: contentFetching,
    error: contentError,
    refetch: refetchContent,
  } = useQuery<ContentInsightsData>({
    queryKey: contentQueryKey,
    queryFn: async ({ signal }) => {
      const service = await getPredictiveService();
      const range =
        dateRange.startDate && dateRange.endDate
          ? {
              end: dateRange.endDate.toISOString(),
              start: dateRange.startDate.toISOString(),
            }
          : undefined;

      return (await service.getContentInsights(
        range,
        signal,
      )) as ContentInsightsData;
    },
    enabled,
  });

  const isLoading = insightsLoading || contentLoading;
  const isRefreshing =
    (insightsFetching && !insightsLoading) ||
    (contentFetching && !contentLoading);
  const error = insightsError || contentError;
  const contentInsightsStatus =
    contentError !== null
      ? 'unavailable'
      : [
            contentInsightsData.alerts,
            contentInsightsData.anomalies,
            contentInsightsData.audiences,
            contentInsightsData.suggestions,
            contentInsightsData.trends,
          ].some((items) => (items?.length ?? 0) > 0)
        ? 'available'
        : 'empty';
  const contentInsightsUnavailableReason =
    contentError instanceof Error ? contentError.message : null;

  const refresh = useCallback(async () => {
    await Promise.all([refetchInsights(), refetchContent()]);
  }, [refetchInsights, refetchContent]);

  const markInsightRead = useCallback(
    async (id: string) => {
      try {
        const service = await getInsightsService();
        await service.markAsRead(id);
        await refetchInsights();
      } catch (err) {
        logger.error('Failed to mark insight as read', { error: err, id });
      }
    },
    [getInsightsService, refetchInsights],
  );

  const dismissInsight = useCallback(
    async (id: string) => {
      try {
        const service = await getInsightsService();
        await service.markAsDismissed(id);
        await refetchInsights();
      } catch (err) {
        logger.error('Failed to dismiss insight', { error: err, id });
      }
    },
    [getInsightsService, refetchInsights],
  );

  const markAlertRead = useCallback((id: string) => {
    setLocalAlerts((prev) =>
      prev.map((alert) =>
        alert.id === id ? { ...alert, isRead: true } : alert,
      ),
    );
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setLocalAlerts((prev) =>
      prev.map((alert) =>
        alert.id === id ? { ...alert, isDismissed: true } : alert,
      ),
    );
  }, []);

  const alerts = useMemo(() => {
    const serverAlerts = contentInsightsData.alerts || [];

    return serverAlerts.map((serverAlert) => {
      const localAlert = localAlerts.find((la) => la.id === serverAlert.id);
      if (localAlert) {
        return {
          ...serverAlert,
          isDismissed: localAlert.isDismissed,
          isRead: localAlert.isRead,
        };
      }
      return serverAlert;
    });
  }, [contentInsightsData.alerts, localAlerts]);

  return {
    alerts,
    anomalies: contentInsightsData.anomalies || [],
    audiences: contentInsightsData.audiences || [],
    contentInsightsStatus,
    contentInsightsUnavailableReason,
    dismissAlert,
    dismissInsight,
    error,
    insights,
    isLoading,
    isRefreshing,
    markAlertRead,
    markInsightRead,
    refresh,
    suggestions: contentInsightsData.suggestions || [],
    trends: contentInsightsData.trends || [],
  };
}
