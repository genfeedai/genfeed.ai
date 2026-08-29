import 'server-only';

import {
  getServerAuthToken,
  hasUsableServerAuthToken,
  isDesktopServerRequest,
  shouldSkipCloudBootstrap,
} from '@app-server/protected-bootstrap.server';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import { AuthService } from '@services/auth/auth.service';
import { logger } from '@services/core/logger.service';
import { cache } from 'react';

export interface OverviewPageData {
  analytics: Awaited<
    ReturnType<AuthService['getOverviewBootstrap']>
  >['analytics'];
  reviewInbox: Awaited<
    ReturnType<AuthService['getOverviewBootstrap']>
  >['reviewInbox'];
  timeSeriesData: PlatformTimeSeriesDataPoint[];
}

export const loadOverviewPageData = cache(
  async (): Promise<OverviewPageData> => {
    const token = await getServerAuthToken();

    if (shouldSkipCloudBootstrap(token, await isDesktopServerRequest())) {
      return {
        analytics: {},
        reviewInbox: {
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        },
        timeSeriesData: [],
      };
    }

    if (!hasUsableServerAuthToken(token)) {
      return {
        analytics: {},
        reviewInbox: {
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        },
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
        analytics: {},
        reviewInbox: {
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        },
        timeSeriesData: [],
      };
    }

    return {
      analytics: overview.analytics,
      reviewInbox: overview.reviewInbox,
      timeSeriesData: overview.timeSeries as PlatformTimeSeriesDataPoint[],
    };
  },
);
