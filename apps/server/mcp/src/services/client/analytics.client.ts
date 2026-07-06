import type {
  Analytics,
  OrganizationAnalytics,
} from '@mcp/shared/interfaces/analytics.interface';
import type { BaseApiClient } from './base-api-client';

/**
 * Read-only analytics rollups. Unlike most client methods, these never throw —
 * on error they log and return an empty-but-shaped result so dashboards degrade
 * gracefully.
 */
export class AnalyticsClient {
  constructor(private readonly base: BaseApiClient) {}

  getVideoAnalytics(
    videoId?: string,
    timeRange: string = '7d',
  ): Promise<Analytics> {
    this.base.logger.debug(
      `Getting video analytics: videoId=${videoId}, timeRange=${timeRange}`,
    );

    const emptyAnalytics: Analytics = {
      averageWatchTime: 0,
      comments: 0,
      engagement: 0,
      likes: 0,
      shares: 0,
      timeRange,
      videoId: videoId || 'all',
      views: 0,
    };

    return this.base.request<Analytics>(
      'getting video analytics',
      async (http) => {
        // Per-content performance lives on the content-performance collection
        // (`@Controller('content-performance')`): `GET /aggregate/:generationId`
        // for a single item's rolled-up metrics, `GET /` for the org-wide list.
        // There is no `/analytics/videos*` route. This method fails open, so a
        // shape gap degrades to the zeroed `emptyAnalytics` rather than throwing.
        const endpoint = videoId
          ? `/content-performance/aggregate/${videoId}`
          : '/content-performance';
        const response = await http.get(endpoint, {
          params: { timeRange },
        });
        const data =
          response.data?.data?.attributes || response.data?.data || {};

        return {
          ...emptyAnalytics,
          averageWatchTime: data.averageWatchTime || 0,
          comments: data.comments || 0,
          engagement: data.engagement || 0,
          likes: data.likes || 0,
          shares: data.shares || 0,
          views: data.views || 0,
        };
      },
      () => emptyAnalytics,
    );
  }

  getOrganizationAnalytics(): Promise<OrganizationAnalytics> {
    this.base.logger.debug('Getting organization analytics');

    const emptyOrgAnalytics: OrganizationAnalytics = {
      activeUsers: 0,
      averageVideoLength: 0,
      growthRate: 0,
      topPerformingVideos: [],
      totalEngagement: 0,
      totalVideos: 0,
      totalViews: 0,
    };

    return this.base.request<OrganizationAnalytics>(
      'getting organization analytics',
      async (http) => {
        const response = await http.get('/analytics/organizations');
        const data = response.data?.data?.attributes || {};

        return {
          ...emptyOrgAnalytics,
          activeUsers: data.activeUsers || 0,
          averageVideoLength: data.averageVideoLength || 0,
          growthRate: data.growthRate || 0,
          topPerformingVideos: data.topPerformingVideos || [],
          totalEngagement: data.totalEngagement || 0,
          totalVideos: data.totalVideos || 0,
          totalViews: data.totalViews || 0,
        };
      },
      () => emptyOrgAnalytics,
    );
  }
}
