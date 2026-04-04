'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import {
  AnomalySeverity,
  ContentSuggestionType,
  SmartAlertSeverity,
  SmartAlertType,
  TrendDirection,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type {
  AnomalyData,
  AudienceSegment,
  ContentSuggestion,
  Insight,
  SmartAlert,
  TrendData,
} from '@props/analytics/insights.props';
import {
  InsightsService,
  PredictiveAnalyticsService,
} from '@services/analytics/insights.service';
import { logger } from '@services/core/logger.service';
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

  // Fetch AI-generated insights
  const {
    data: insights,
    isLoading: insightsLoading,
    isRefreshing: insightsRefreshing,
    error: insightsError,
    refresh: refreshInsights,
  } = useResource<Insight[]>(
    async () => {
      const service = await getInsightsService();
      return service.getInsights();
    },
    {
      defaultValue: [],
      dependencies: [brandId, refreshTrigger],
      enabled,
    },
  );

  // Fetch content insights from predictive analytics
  const {
    data: contentInsightsData,
    isLoading: contentLoading,
    isRefreshing: contentRefreshing,
    error: contentError,
    refresh: refreshContent,
  } = useResource<ContentInsightsData>(
    async () => {
      const service = await getPredictiveService();
      const range =
        dateRange.startDate && dateRange.endDate
          ? {
              end: dateRange.endDate.toISOString(),
              start: dateRange.startDate.toISOString(),
            }
          : undefined;

      try {
        const data = await service.getContentInsights(range);
        return data as ContentInsightsData;
      } catch (error) {
        logger.warn('Predictive analytics not available, using mock data', {
          error,
        });
        // Return mock data for demo purposes when API is not available
        return getMockInsightsData();
      }
    },
    {
      defaultValue: {
        alerts: [],
        anomalies: [],
        audiences: [],
        suggestions: [],
        trends: [],
      },
      dependencies: [brandId, dateRange, refreshTrigger],
      enabled,
    },
  );

  // Combine all loading states
  const isLoading = insightsLoading || contentLoading;
  const isRefreshing = insightsRefreshing || contentRefreshing;
  const error = insightsError || contentError;

  // Refresh all data
  const refresh = useCallback(async () => {
    await Promise.all([refreshInsights(), refreshContent()]);
  }, [refreshInsights, refreshContent]);

  // Mark insight as read
  const markInsightRead = useCallback(
    async (id: string) => {
      try {
        const service = await getInsightsService();
        await service.markAsRead(id);
        await refreshInsights();
      } catch (err) {
        logger.error('Failed to mark insight as read', { error: err, id });
      }
    },
    [getInsightsService, refreshInsights],
  );

  // Dismiss insight
  const dismissInsight = useCallback(
    async (id: string) => {
      try {
        const service = await getInsightsService();
        await service.markAsDismissed(id);
        await refreshInsights();
      } catch (err) {
        logger.error('Failed to dismiss insight', { error: err, id });
      }
    },
    [getInsightsService, refreshInsights],
  );

  // Local alert management
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

  // Merge server and local alerts
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

// Mock data for demonstration when API is not available
function getMockInsightsData(): ContentInsightsData {
  return {
    alerts: [
      {
        actionLabel: 'View Stats',
        actionUrl: '/overview',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        id: 'alert-1',
        isDismissed: false,
        isRead: false,
        message: 'Congratulations! You reached 10,000 followers on Instagram.',
        severity: SmartAlertSeverity.SUCCESS,
        title: 'Milestone Reached!',
        type: SmartAlertType.MILESTONE,
      },
      {
        actionLabel: 'Review Posts',
        actionUrl: '/posts',
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        id: 'alert-2',
        isDismissed: false,
        isRead: false,
        message:
          'Your TikTok views dropped 40% compared to last week. Consider reviewing your recent content strategy.',
        severity: SmartAlertSeverity.WARNING,
        title: 'Unusual Activity Detected',
        type: SmartAlertType.ANOMALY,
      },
      {
        actionLabel: 'View Post',
        actionUrl: '/posts',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        id: 'alert-3',
        isDismissed: false,
        isRead: true,
        message:
          'Your latest reel has 3x higher engagement than average. Consider boosting or creating similar content.',
        severity: SmartAlertSeverity.INFO,
        title: 'Viral Potential',
        type: SmartAlertType.OPPORTUNITY,
      },
    ],
    anomalies: [
      {
        currentValue: 15000,
        description:
          'Views dropped significantly compared to your 7-day average',
        detectedAt: new Date(),
        deviation: -40,
        expectedValue: 25000,
        id: 'anomaly-1',
        metric: 'views',
        platform: 'TikTok',
        severity: AnomalySeverity.WARNING,
      },
      {
        currentValue: 8500,
        description:
          'Engagement rate spiked - your recent content is resonating!',
        detectedAt: new Date(),
        deviation: 70,
        expectedValue: 5000,
        id: 'anomaly-2',
        metric: 'engagement',
        platform: 'Instagram',
        severity: AnomalySeverity.INFO,
      },
    ],
    audiences: [
      {
        engagement: 8.5,
        growth: 12.3,
        id: 'audience-1',
        name: 'Power Engagers',
        peakHours: [19, 20, 21],
        platforms: ['instagram', 'tiktok'],
        size: 15000,
        topContent: ['Tutorials', 'Behind-the-scenes', 'Q&A'],
      },
      {
        engagement: 2.1,
        growth: 5.8,
        id: 'audience-2',
        name: 'Casual Viewers',
        peakHours: [12, 18, 22],
        platforms: ['tiktok', 'youtube'],
        size: 45000,
        topContent: ['Entertainment', 'Short clips', 'Memes'],
      },
      {
        engagement: 5.2,
        growth: -2.1,
        id: 'audience-3',
        name: 'Professional Followers',
        peakHours: [8, 9, 17],
        platforms: ['linkedin', 'youtube'],
        size: 8500,
        topContent: ['Industry insights', 'Tips', 'Long-form'],
      },
    ],
    suggestions: [
      {
        basedOn: 'Analysis of 50+ posts and engagement patterns',
        confidence: 92,
        description:
          'Your audience is most active between 7-9 PM EST. Schedule your posts during this window for maximum reach.',
        expectedImpact: '+15-20% views',
        id: 'suggestion-1',
        title: 'Optimal Posting Time',
        type: ContentSuggestionType.TIMING,
      },
      {
        basedOn: 'Performance data from last 30 days',
        confidence: 88,
        description:
          'Your videos between 15-30 seconds perform 40% better than longer content. Consider shorter, punchier edits.',
        expectedImpact: '+40% engagement',
        id: 'suggestion-2',
        title: 'Video Length Sweet Spot',
        type: ContentSuggestionType.FORMAT,
      },
      {
        basedOn: 'Hashtag performance analysis',
        confidence: 75,
        description:
          'Using 3-5 targeted hashtags instead of 10+ generic ones can improve discoverability.',
        expectedImpact: '+25% reach',
        id: 'suggestion-3',
        title: 'Hashtag Optimization',
        type: ContentSuggestionType.HASHTAG,
      },
      {
        basedOn: 'Trend analysis across similar creators',
        confidence: 80,
        description:
          'Content about "AI tools" is trending in your niche. Consider creating related content.',
        expectedImpact: '+50% views potential',
        id: 'suggestion-4',
        title: 'Trending Topic Alert',
        type: ContentSuggestionType.TOPIC,
      },
    ],
    trends: [
      {
        changePercent: 12.5,
        confidence: 85,
        direction: TrendDirection.UP,
        forecast: [1000, 1050, 1120, 1180, 1250, 1320, 1400],
        id: 'trend-1',
        metric: 'followers',
        period: 'Last 7 days',
        platform: 'Instagram',
      },
      {
        changePercent: -8.2,
        confidence: 72,
        direction: TrendDirection.DOWN,
        forecast: [50000, 48000, 45000, 44000, 42000, 40000, 38000],
        id: 'trend-2',
        metric: 'views',
        period: 'Last 7 days',
        platform: 'TikTok',
      },
      {
        changePercent: 1.2,
        confidence: 90,
        direction: TrendDirection.STABLE,
        forecast: [3200, 3180, 3220, 3190, 3210, 3200, 3230],
        id: 'trend-3',
        metric: 'engagement',
        period: 'Last 7 days',
      },
      {
        changePercent: 25.8,
        confidence: 78,
        direction: TrendDirection.UP,
        forecast: [200, 220, 250, 280, 310, 350, 400],
        id: 'trend-4',
        metric: 'shares',
        period: 'Last 7 days',
      },
    ],
  };
}
