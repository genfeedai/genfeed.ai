vi.mock(
  '@api/shared/utils/circuit-breaker/circuit-breaker.util',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@api/shared/utils/circuit-breaker/circuit-breaker.util')
      >();
    return {
      ...actual,
      createProcessorCircuitBreaker: vi.fn(() => ({
        execute: vi.fn((fn: () => Promise<unknown>) => fn()),
      })),
    };
  },
);

import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import {
  AnalyticsYouTubeProcessor,
  type YouTubeAnalyticsJobData,
} from '@api/queues/analytics-youtube/analytics-youtube.processor';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { BrokenCircuitError } from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';

function makeJob(data: YouTubeAnalyticsJobData): Job<YouTubeAnalyticsJobData> {
  return {
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<YouTubeAnalyticsJobData>;
}

describe('AnalyticsYouTubeProcessor', () => {
  let processor: AnalyticsYouTubeProcessor;
  let youtubeService: {
    getMediaAnalyticsBatch: ReturnType<typeof vi.fn>;
  };
  let postAnalyticsService: {
    processYouTubeAnalytics: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const orgId = 'org-abc-123';
  const brandId = 'brand-xyz-456';

  const makePosts = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      _id: `post-${i}`,
      brand: brandId,
      externalId: `vid-${i}`,
      organization: orgId,
    }));

  beforeEach(async () => {
    vi.clearAllMocks();

    youtubeService = {
      getMediaAnalyticsBatch: vi.fn(),
    };

    postAnalyticsService = {
      processYouTubeAnalytics: vi.fn().mockResolvedValue(undefined),
    };

    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsYouTubeProcessor,
        { provide: YoutubeService, useValue: youtubeService },
        { provide: PostAnalyticsService, useValue: postAnalyticsService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    processor = module.get(AnalyticsYouTubeProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('processes a batch of posts and updates analytics', async () => {
      const posts = makePosts(3);
      const analyticsMap = new Map([
        ['vid-0', { likes: 5, views: 100 }],
        ['vid-1', { likes: 10, views: 200 }],
        ['vid-2', { likes: 2, views: 50 }],
      ]);
      youtubeService.getMediaAnalyticsBatch.mockResolvedValue(analyticsMap);

      const job = makeJob({ brandId, organizationId: orgId, posts });
      await processor.process(job);

      expect(youtubeService.getMediaAnalyticsBatch).toHaveBeenCalledWith(
        orgId,
        brandId,
        ['vid-0', 'vid-1', 'vid-2'],
      );
      expect(
        postAnalyticsService.processYouTubeAnalytics,
      ).toHaveBeenCalledTimes(3);
      expect(postAnalyticsService.processYouTubeAnalytics).toHaveBeenCalledWith(
        'post-0',
        { likes: 5, views: 100 },
      );
      expect(job.updateProgress).toHaveBeenCalledWith(10);
      expect(job.updateProgress).toHaveBeenCalledWith(50);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('returns early and warns when posts array is empty', async () => {
      const job = makeJob({ brandId, organizationId: orgId, posts: [] });
      await processor.process(job);

      expect(youtubeService.getMediaAnalyticsBatch).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No posts provided'),
      );
    });

    it('logs warning for posts with no analytics in the returned map', async () => {
      const posts = makePosts(2);
      // Only vid-0 has analytics, vid-1 is missing
      const analyticsMap = new Map([['vid-0', { views: 999 }]]);
      youtubeService.getMediaAnalyticsBatch.mockResolvedValue(analyticsMap);

      const job = makeJob({ brandId, organizationId: orgId, posts });
      await processor.process(job);

      expect(
        postAnalyticsService.processYouTubeAnalytics,
      ).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No analytics found for video vid-1'),
      );
    });

    it('throws and logs error when getMediaAnalyticsBatch fails', async () => {
      youtubeService.getMediaAnalyticsBatch.mockRejectedValue(
        new Error('API quota exceeded'),
      );

      const job = makeJob({
        brandId,
        organizationId: orgId,
        posts: makePosts(1),
      });

      await expect(processor.process(job)).rejects.toThrow(
        'API quota exceeded',
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process YouTube analytics batch'),
        expect.any(Error),
      );
    });

    it('throws BrokenCircuitError when circuit breaker is open', async () => {
      const { createProcessorCircuitBreaker } = await import(
        '@api/shared/utils/circuit-breaker/circuit-breaker.util'
      );
      const circuitErr = new BrokenCircuitError('analytics-youtube', 5);
      (
        createProcessorCircuitBreaker as ReturnType<typeof vi.fn>
      ).mockReturnValueOnce({
        execute: vi.fn().mockRejectedValue(circuitErr),
      });

      const freshModule = await Test.createTestingModule({
        providers: [
          AnalyticsYouTubeProcessor,
          { provide: YoutubeService, useValue: youtubeService },
          { provide: PostAnalyticsService, useValue: postAnalyticsService },
          { provide: LoggerService, useValue: logger },
        ],
      }).compile();

      const freshProcessor = freshModule.get(AnalyticsYouTubeProcessor);
      const job = makeJob({
        brandId,
        organizationId: orgId,
        posts: makePosts(1),
      });

      await expect(freshProcessor.process(job)).rejects.toBeInstanceOf(
        BrokenCircuitError,
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker open'),
      );
    });

    it('processes a single post batch correctly', async () => {
      const posts = makePosts(1);
      const analyticsMap = new Map([['vid-0', { likes: 1, views: 42 }]]);
      youtubeService.getMediaAnalyticsBatch.mockResolvedValue(analyticsMap);

      const job = makeJob({ brandId, organizationId: orgId, posts });
      await processor.process(job);

      expect(
        postAnalyticsService.processYouTubeAnalytics,
      ).toHaveBeenCalledTimes(1);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('processed 1/1 posts'),
      );
    });

    it('logs completion with processed count', async () => {
      const posts = makePosts(4);
      // Only 2 of 4 have analytics
      const analyticsMap = new Map([
        ['vid-0', { views: 10 }],
        ['vid-2', { views: 20 }],
      ]);
      youtubeService.getMediaAnalyticsBatch.mockResolvedValue(analyticsMap);

      const job = makeJob({ brandId, organizationId: orgId, posts });
      await processor.process(job);

      expect(
        postAnalyticsService.processYouTubeAnalytics,
      ).toHaveBeenCalledTimes(2);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('processed 2/4 posts'),
      );
    });
  });
});
