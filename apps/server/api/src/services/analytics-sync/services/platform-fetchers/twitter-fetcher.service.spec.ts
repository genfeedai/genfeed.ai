import { TwitterFetcherService } from '@api/services/analytics-sync/services/platform-fetchers/twitter-fetcher.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TwitterFetcherService', () => {
  let service: TwitterFetcherService;
  let twitterService: vi.Mocked<TwitterService>;
  let logger: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterFetcherService,
        {
          provide: TwitterService,
          useValue: {
            getMediaAnalytics: vi.fn(),
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

    service = module.get<TwitterFetcherService>(TwitterFetcherService);
    twitterService = module.get(TwitterService);
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
      expect(twitterService.getMediaAnalytics).not.toHaveBeenCalled();
    });

    it('should fetch metrics for a single post', async () => {
      twitterService.getMediaAnalytics.mockResolvedValue({
        comments: 12,
        likes: 150,
        views: 3000,
      });

      const posts = [{ externalId: 'tweet-1', postId: 'post-1' }];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        externalId: 'tweet-1',
        metrics: {
          totalComments: 12,
          totalLikes: 150,
          totalSaves: 0,
          totalShares: 0,
          totalViews: 3000,
        },
        postId: 'post-1',
      });
      expect(twitterService.getMediaAnalytics).toHaveBeenCalledWith('tweet-1');
    });

    it('should fetch metrics for multiple posts individually', async () => {
      twitterService.getMediaAnalytics
        .mockResolvedValueOnce({ comments: 5, likes: 50, views: 500 })
        .mockResolvedValueOnce({ comments: 20, likes: 200, views: 2000 });

      const posts = [
        { externalId: 'tweet-1', postId: 'post-1' },
        { externalId: 'tweet-2', postId: 'post-2' },
      ];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(2);
      expect(result[0].metrics?.totalViews).toBe(500);
      expect(result[1].metrics?.totalViews).toBe(2000);
      expect(twitterService.getMediaAnalytics).toHaveBeenCalledTimes(2);
    });

    it('should handle per-post errors without affecting other posts', async () => {
      twitterService.getMediaAnalytics
        .mockResolvedValueOnce({ comments: 5, likes: 50, views: 500 })
        .mockRejectedValueOnce(new Error('Rate limited'))
        .mockResolvedValueOnce({ comments: 10, likes: 80, views: 800 });

      const posts = [
        { externalId: 'tweet-1', postId: 'post-1' },
        { externalId: 'tweet-2', postId: 'post-2' },
        { externalId: 'tweet-3', postId: 'post-3' },
      ];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(3);
      expect(result[0].metrics).not.toBeNull();
      expect(result[1].metrics).toBeNull();
      expect(result[1].error).toBe('Rate limited');
      expect(result[2].metrics).not.toBeNull();
    });

    it('should log errors for failed posts', async () => {
      twitterService.getMediaAnalytics.mockRejectedValue(
        new Error('Forbidden'),
      );

      const posts = [{ externalId: 'tweet-1', postId: 'post-1' }];
      await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(logger.error).toHaveBeenCalledWith(
        'TwitterFetcherService failed for post post-1',
        expect.any(Error),
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      twitterService.getMediaAnalytics.mockRejectedValue(
        'unexpected string error',
      );

      const posts = [{ externalId: 'tweet-1', postId: 'post-1' }];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result[0].error).toBe('Unknown error');
      expect(result[0].metrics).toBeNull();
    });

    it('should always set totalSaves and totalShares to 0', async () => {
      twitterService.getMediaAnalytics.mockResolvedValue({
        comments: 3,
        likes: 30,
        views: 300,
      });

      const posts = [{ externalId: 'tweet-1', postId: 'post-1' }];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result[0].metrics?.totalSaves).toBe(0);
      expect(result[0].metrics?.totalShares).toBe(0);
    });

    it('should not use organizationId or brandId (unused parameters)', async () => {
      twitterService.getMediaAnalytics.mockResolvedValue({
        comments: 1,
        likes: 10,
        views: 100,
      });

      const posts = [{ externalId: 'tweet-1', postId: 'post-1' }];

      // Call with different org/brand values — should not affect the result
      const result1 = await service.fetchMetrics('org-a', 'brand-a', posts);
      const result2 = await service.fetchMetrics('org-b', 'brand-b', posts);

      // Both should call getMediaAnalytics with only the externalId
      expect(twitterService.getMediaAnalytics).toHaveBeenCalledWith('tweet-1');
      expect(result1[0].metrics?.totalViews).toBe(100);
      expect(result2[0].metrics?.totalViews).toBe(100);
    });

    it('should correctly map externalId to each call', async () => {
      twitterService.getMediaAnalytics.mockResolvedValue({
        comments: 0,
        likes: 0,
        views: 0,
      });

      const posts = [
        { externalId: 'tweet-abc', postId: 'post-1' },
        { externalId: 'tweet-def', postId: 'post-2' },
      ];
      await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(twitterService.getMediaAnalytics).toHaveBeenNthCalledWith(
        1,
        'tweet-abc',
      );
      expect(twitterService.getMediaAnalytics).toHaveBeenNthCalledWith(
        2,
        'tweet-def',
      );
    });
  });
});
