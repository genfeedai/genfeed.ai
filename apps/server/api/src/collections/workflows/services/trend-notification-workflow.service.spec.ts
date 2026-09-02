import { TrendNotificationWorkflowService } from '@api/collections/workflows/services/trend-notification-workflow.service';
import { describe, expect, it, vi } from 'vitest';

type DigestItem = Record<string, unknown>;

function readTrends(result: Record<string, unknown>): DigestItem[] {
  return result.trends as DigestItem[];
}

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
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    return {
      cache,
      logger,
      service: new TrendNotificationWorkflowService(
        {} as never,
        trends as never,
        cache as never,
        {} as never,
        logger as never,
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
  /**
   * The ingest stores `viewCount` / `videoUrl`; the digest used to read
   * `views` / `url` and rendered nameless, countless, linkless rows. The
   * mapping now lives in `buildTrendDigestItems` — assert it still reaches
   * the digest through the read action.
   */
  it('maps the field names the trend ingest actually stores', async () => {
    const { service, trends } = buildService();
    trends.getViralVideos.mockResolvedValue([
      {
        platform: 'tiktok',
        title: 'Fast video',
        videoUrl: 'https://example.com/video',
        viewCount: 1000000,
        viralScore: 91,
      },
    ]);

    const result = await service.readTrendSummaryVideos({
      state: { minViralScore: 70, status: 'prepared' },
    });

    expect(readTrends(result)[0]).toMatchObject({
      topic: 'Fast video',
      url: 'https://example.com/video',
      usageCount: 1000000,
    });
  });

  it('drops trends the ingest could not name rather than shipping placeholders', async () => {
    const { service, trends } = buildService();
    trends.getViralVideos.mockResolvedValue([
      { platform: 'tiktok', viewCount: 1000000, viralScore: 91 },
    ]);

    const result = await service.readTrendSummaryVideos({
      state: { minViralScore: 70, status: 'prepared' },
    });

    expect(readTrends(result)).toHaveLength(0);
  });

  /**
   * Sounds were gated on a raw `usageCount >= 10000` the ingest can never
   * satisfy — it counts sound reuse within one scraped batch. The score gate
   * is the only gate now.
   */
  it('keeps trending sounds that clear the score threshold', async () => {
    const { service, trends } = buildService();
    trends.getTrendingSounds.mockResolvedValue([
      {
        playUrl: 'https://example.com/sound',
        soundName: 'Viral sound',
        usageCount: 42,
        viralityScore: 88,
      },
    ]);

    const result = await service.readTrendSummarySounds({
      state: { minViralScore: 70, status: 'prepared' },
    });

    expect(readTrends(result)).toHaveLength(1);
    expect(readTrends(result)[0]).toMatchObject({
      topic: 'Viral sound',
      type: 'sound',
      url: 'https://example.com/sound',
    });
  });

  it('survives a dead trend source without losing the others', async () => {
    const { logger, service, trends } = buildService();
    trends.getViralVideos.mockRejectedValue(new Error('trends unavailable'));

    const result = await service.readTrendSummaryVideos({
      state: { minViralScore: 70, status: 'prepared' },
    });

    expect(readTrends(result)).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });
});
