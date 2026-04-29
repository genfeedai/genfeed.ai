import 'server-only';

import {
  getServerAuthToken,
  hasUsableServerAuthToken,
  shouldSkipCloudBootstrap,
} from '@app-server/protected-bootstrap.server';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import { AuthService } from '@services/auth/auth.service';
import { logger } from '@services/core/logger.service';
import { cache } from 'react';

export interface OverviewPageData {
  activeRuns: Awaited<
    ReturnType<AuthService['getOverviewBootstrap']>
  >['activeRuns'];
  analytics: Awaited<
    ReturnType<AuthService['getOverviewBootstrap']>
  >['analytics'];
  reviewInbox: Awaited<
    ReturnType<AuthService['getOverviewBootstrap']>
  >['reviewInbox'];
  runs: Awaited<ReturnType<AuthService['getOverviewBootstrap']>>['runs'];
  stats: Awaited<ReturnType<AuthService['getOverviewBootstrap']>>['stats'];
  timeSeriesData: PlatformTimeSeriesDataPoint[];
}

export const loadOverviewPageData = cache(
  async (): Promise<OverviewPageData> => {
    const token = await getServerAuthToken();

    if (shouldSkipCloudBootstrap(token)) {
      return {
        activeRuns: [],
        analytics: {},
        reviewInbox: {
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        },
        runs: [],
        stats: null,
        timeSeriesData: [],
      };
    }

    if (!hasUsableServerAuthToken(token)) {
      return {
        activeRuns: [],
        analytics: {},
        reviewInbox: {
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        },
        runs: [],
        stats: null,
        timeSeriesData: [],
      };
    }

    const authService = AuthService.getInstance(token);
    const overview = await authService.getOverviewBootstrap().catch((error) => {
      logger.error('Failed to load overview bootstrap', error);
      return null;
    });

    if (!overview) {
      return {
        activeRuns: [],
        analytics: {},
        reviewInbox: {
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        },
        runs: [],
        stats: null,
        timeSeriesData: [],
      };
    }

    return {
      activeRuns: overview.activeRuns,
      analytics: overview.analytics,
      reviewInbox: overview.reviewInbox,
      runs: overview.runs,
      stats: overview.stats,
      timeSeriesData: overview.timeSeries as PlatformTimeSeriesDataPoint[],
    };
  },
);
