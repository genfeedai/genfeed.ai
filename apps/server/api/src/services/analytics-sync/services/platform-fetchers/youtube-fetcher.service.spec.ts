import {
  type PlatformMetrics,
  YouTubeFetcherService,
} from '@api/services/analytics-sync/services/platform-fetchers/youtube-fetcher.service';
import { YoutubeAnalyticsService } from '@api/services/integrations/youtube/services/modules/youtube-analytics.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('YouTubeFetcherService', () => {
  let service: YouTubeFetcherService;
  let youtubeAnalyticsService: vi.Mocked<YoutubeAnalyticsService>;
  let logger: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YouTubeFetcherService,
        {
          provide: YoutubeAnalyticsService,
          useValue: {
            getMediaAnalytics: vi.fn(),
            getMediaAnalyticsBatch: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<YouTubeFetcherService>(YouTubeFetcherService);
    youtubeAnalyticsService = module.get(YoutubeAnalyticsService);
    logger = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('fetchMetrics', () => {
    it('should return empty array for empty posts', async () => {
      const result = await service.fetchMetrics('org-1', 'brand-1', []);

      expect(result).toEqual([]);
      expect(
        youtubeAnalyticsService.getMediaAnalyticsBatch,
      ).not.toHaveBeenCalled();
    });

    it('should fetch metrics for a single post', async () => {
      const metricsMap = new Map<
        string,
        { views: number; likes: number; comments: number }
      >();
      metricsMap.set('yt-video-1', {
        comments: 5,
        likes: 100,
        views: 1000,
      });
      youtubeAnalyticsService.getMediaAnalyticsBatch.mockResolvedValue(
        metricsMap,
      );

      const posts = [{ externalId: 'yt-video-1', postId: 'post-1' }];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        externalId: 'yt-video-1',
        metrics: {
          totalComments: 5,
          totalLikes: 100,
          totalSaves: 0,
          totalShares: 0,
          totalViews: 1000,
        },
        postId: 'post-1',
      });
    });

    it('should fetch metrics for multiple posts in one batch', async () => {
      const metricsMap = new Map<
        string,
        { views: number; likes: number; comments: number }
      >();
      metricsMap.set('yt-1', { comments: 2, likes: 10, views: 100 });
      metricsMap.set('yt-2', { comments: 8, likes: 50, views: 500 });
      youtubeAnalyticsService.getMediaAnalyticsBatch.mockResolvedValue(
        metricsMap,
      );

      const posts = [
        { externalId: 'yt-1', postId: 'post-1' },
        { externalId: 'yt-2', postId: 'post-2' },
      ];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(2);
      expect(result[0].metrics?.totalViews).toBe(100);
      expect(result[1].metrics?.totalViews).toBe(500);
    });

    it('should return error result for posts with no stats returned', async () => {
      const metricsMap = new Map<
        string,
        { views: number; likes: number; comments: number }
      >();
      metricsMap.set('yt-1', { comments: 2, likes: 10, views: 100 });
      // yt-2 is NOT in the map — simulates no stats returned
      youtubeAnalyticsService.getMediaAnalyticsBatch.mockResolvedValue(
        metricsMap,
      );

      const posts = [
        { externalId: 'yt-1', postId: 'post-1' },
        { externalId: 'yt-2', postId: 'post-2' },
      ];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(2);
      expect(result[0].metrics).not.toBeNull();
      expect(result[1].metrics).toBeNull();
      expect(result[1].error).toBe('No stats returned');
    });

    it('should batch posts in groups of 50', async () => {
      // Create 75 posts to trigger two batches
      const posts = Array.from({ length: 75 }, (_, i) => ({
        externalId: `yt-${i}`,
        postId: `post-${i}`,
      }));

      const createMetricsMap = (ids: string[]) => {
        const map = new Map<
          string,
          { views: number; likes: number; comments: number }
        >();
        for (const id of ids) {
          map.set(id, { comments: 1, likes: 5, views: 50 });
        }
        return map;
      };

      youtubeAnalyticsService.getMediaAnalyticsBatch
        .mockResolvedValueOnce(
          createMetricsMap(posts.slice(0, 50).map((p) => p.externalId)),
        )
        .mockResolvedValueOnce(
          createMetricsMap(posts.slice(50).map((p) => p.externalId)),
        );

      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(
        youtubeAnalyticsService.getMediaAnalyticsBatch,
      ).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(75);
      // First batch should have 50 video IDs
      expect(
        youtubeAnalyticsService.getMediaAnalyticsBatch.mock.calls[0][2],
      ).toHaveLength(50);
      // Second batch should have 25 video IDs
      expect(
        youtubeAnalyticsService.getMediaAnalyticsBatch.mock.calls[1][2],
      ).toHaveLength(25);
    });

    it('should pass organizationId and brandId to analytics service', async () => {
      youtubeAnalyticsService.getMediaAnalyticsBatch.mockResolvedValue(
        new Map(),
      );

      const posts = [{ externalId: 'yt-1', postId: 'post-1' }];
      await service.fetchMetrics('org-abc', 'brand-xyz', posts);

      expect(
        youtubeAnalyticsService.getMediaAnalyticsBatch,
      ).toHaveBeenCalledWith('org-abc', 'brand-xyz', ['yt-1']);
    });

    it('should handle errors and return error results for remaining posts', async () => {
      youtubeAnalyticsService.getMediaAnalyticsBatch.mockRejectedValue(
        new Error('YouTube API quota exceeded'),
      );

      const posts = [
        { externalId: 'yt-1', postId: 'post-1' },
        { externalId: 'yt-2', postId: 'post-2' },
      ];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        error: 'YouTube API quota exceeded',
        externalId: 'yt-1',
        metrics: null,
        postId: 'post-1',
      });
      expect(result[1]).toEqual({
        error: 'YouTube API quota exceeded',
        externalId: 'yt-2',
        metrics: null,
        postId: 'post-2',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'YouTubeFetcherService fetchMetrics failed',
        expect.any(Error),
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      youtubeAnalyticsService.getMediaAnalyticsBatch.mockRejectedValue(
        'string error',
      );

      const posts = [{ externalId: 'yt-1', postId: 'post-1' }];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(1);
      expect(result[0].error).toBe('Unknown error');
    });

    it('should not duplicate results for posts already processed before error', async () => {
      // First batch succeeds, second batch fails
      const metricsMap = new Map<
        string,
        { views: number; likes: number; comments: number }
      >();
      metricsMap.set('yt-0', { comments: 1, likes: 5, views: 50 });

      // Create 51 posts (one batch of 50 + one of 1)
      const posts = Array.from({ length: 51 }, (_, i) => ({
        externalId: `yt-${i}`,
        postId: `post-${i}`,
      }));

      const firstBatchMap = new Map<
        string,
        { views: number; likes: number; comments: number }
      >();
      for (let i = 0; i < 50; i++) {
        firstBatchMap.set(`yt-${i}`, { comments: 1, likes: 5, views: 50 });
      }

      youtubeAnalyticsService.getMediaAnalyticsBatch
        .mockResolvedValueOnce(firstBatchMap)
        .mockRejectedValueOnce(new Error('API down'));

      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      // 50 success from batch 1, plus 1 error for post-50
      expect(result).toHaveLength(51);
      // First 50 should have metrics
      expect(result[0].metrics).not.toBeNull();
      expect(result[49].metrics).not.toBeNull();
      // Last one should have error
      expect(result[50].metrics).toBeNull();
      expect(result[50].error).toBe('API down');
    });

    it('should always set totalSaves and totalShares to 0', async () => {
      const metricsMap = new Map<
        string,
        { views: number; likes: number; comments: number }
      >();
      metricsMap.set('yt-1', { comments: 10, likes: 200, views: 5000 });
      youtubeAnalyticsService.getMediaAnalyticsBatch.mockResolvedValue(
        metricsMap,
      );

      const posts = [{ externalId: 'yt-1', postId: 'post-1' }];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      const metrics = result[0].metrics as PlatformMetrics;
      expect(metrics.totalSaves).toBe(0);
      expect(metrics.totalShares).toBe(0);
    });
  });
});
