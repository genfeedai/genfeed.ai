import { TrendNotificationWorkflowService } from '@server/collections/workflows/services/trend-notification-workflow.service';
import { describe, expect, it, vi } from 'vitest';

describe('TrendNotificationWorkflowService atomic actions', () => {
  function buildService() {
    const trends = {
      getTrendingHashtags: vi.fn().mockResolvedValue([]),
      getTrendingSounds: vi.fn().mockResolvedValue([]),
      getViralVideos: vi
        .fn()
        .mockResolvedValue([
          { platform: 'tiktok', title: 'Signal', viralScore: 90 },
        ]),
    };
    const cache = { acquireLock: vi.fn().mockResolvedValue(true) };
    return {
      cache,
      service: new TrendNotificationWorkflowService(
        {} as never,
        trends as never,
        cache as never,
        {} as never,
        {} as never,
        { get: vi.fn().mockReturnValue('https://app.genfeed.ai') } as never,
      ),
      trends,
    };
  }

  it('reads each trend source through its own action', async () => {
    const { service, trends } = buildService();
    const state = { minViralScore: 70, status: 'prepared' };

    const videos = await service.readTrendSummaryVideos({ state });
    await service.readTrendSummaryHashtags({ state });
    await service.readTrendSummarySounds({ state });

    expect(videos.trends).toHaveLength(1);
    expect(trends.getViralVideos).toHaveBeenCalledTimes(1);
    expect(trends.getTrendingHashtags).toHaveBeenCalledTimes(1);
    expect(trends.getTrendingSounds).toHaveBeenCalledTimes(1);
  });

  it('acquires the delivery-window marker only after source results exist', async () => {
    const { cache, service } = buildService();
    const result = await service.renderTrendSummaryNotifications({
      hashtags: { trends: [] },
      sounds: { trends: [] },
      state: {
        cadence: 'daily',
        markerKey: 'marker-1',
        markerTtlSeconds: 100,
        minViralScore: 70,
        status: 'prepared',
      },
      videos: {
        trends: [
          {
            platform: 'tiktok',
            topic: 'Signal',
            type: 'video',
            viralScore: 90,
          },
        ],
      },
    });

    expect(cache.acquireLock).toHaveBeenCalledWith('marker-1', 100);
    expect(result.status).toBe('rendered');
  });
});
