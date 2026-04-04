import { InstagramFetcherService } from '@api/services/analytics-sync/services/platform-fetchers/instagram-fetcher.service';
import type { FetchResult } from '@api/services/analytics-sync/services/platform-fetchers/youtube-fetcher.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('InstagramFetcherService', () => {
  let service: InstagramFetcherService;
  let instagramService: vi.Mocked<InstagramService>;
  let logger: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstagramFetcherService,
        {
          provide: InstagramService,
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

    service = module.get<InstagramFetcherService>(InstagramFetcherService);
    instagramService = module.get(InstagramService);
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
      expect(instagramService.getMediaAnalytics).not.toHaveBeenCalled();
    });

    it('should fetch metrics for a single post', async () => {
      instagramService.getMediaAnalytics.mockResolvedValue({
        comments: 25,
        likes: 300,
        views: 5000,
      });

      const posts = [{ externalId: 'ig-media-1', postId: 'post-1' }];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        externalId: 'ig-media-1',
        metrics: {
          totalComments: 25,
          totalLikes: 300,
          totalSaves: 0,
          totalShares: 0,
          totalViews: 5000,
        },
        postId: 'post-1',
      });
    });

    it('should pass organizationId, brandId, and externalId to instagram service', async () => {
      instagramService.getMediaAnalytics.mockResolvedValue({
        comments: 0,
        likes: 0,
        views: 0,
      });

      const posts = [{ externalId: 'ig-media-1', postId: 'post-1' }];
      await service.fetchMetrics('org-abc', 'brand-xyz', posts);

      expect(instagramService.getMediaAnalytics).toHaveBeenCalledWith(
        'org-abc',
        'brand-xyz',
        'ig-media-1',
      );
    });

    it('should fetch metrics for multiple posts individually', async () => {
      instagramService.getMediaAnalytics
        .mockResolvedValueOnce({ comments: 10, likes: 100, views: 1000 })
        .mockResolvedValueOnce({ comments: 50, likes: 500, views: 8000 })
        .mockResolvedValueOnce({ comments: 5, likes: 30, views: 200 });

      const posts = [
        { externalId: 'ig-1', postId: 'post-1' },
        { externalId: 'ig-2', postId: 'post-2' },
        { externalId: 'ig-3', postId: 'post-3' },
      ];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(3);
      expect(result[0].metrics?.totalViews).toBe(1000);
      expect(result[1].metrics?.totalViews).toBe(8000);
      expect(result[2].metrics?.totalViews).toBe(200);
      expect(instagramService.getMediaAnalytics).toHaveBeenCalledTimes(3);
    });

    it('should handle per-post errors without affecting other posts', async () => {
      instagramService.getMediaAnalytics
        .mockResolvedValueOnce({ comments: 10, likes: 100, views: 1000 })
        .mockRejectedValueOnce(new Error('Token expired'))
        .mockResolvedValueOnce({ comments: 5, likes: 30, views: 200 });

      const posts = [
        { externalId: 'ig-1', postId: 'post-1' },
        { externalId: 'ig-2', postId: 'post-2' },
        { externalId: 'ig-3', postId: 'post-3' },
      ];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(3);
      expect(result[0].metrics).not.toBeNull();
      expect(result[0].metrics?.totalViews).toBe(1000);
      expect(result[1].metrics).toBeNull();
      expect(result[1].error).toBe('Token expired');
      expect(result[2].metrics).not.toBeNull();
      expect(result[2].metrics?.totalViews).toBe(200);
    });

    it('should log errors for failed posts', async () => {
      const error = new Error('Instagram API unavailable');
      instagramService.getMediaAnalytics.mockRejectedValue(error);

      const posts = [{ externalId: 'ig-1', postId: 'post-42' }];
      await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(logger.error).toHaveBeenCalledWith(
        'InstagramFetcherService failed for post post-42',
        error,
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      instagramService.getMediaAnalytics.mockRejectedValue(42);

      const posts = [{ externalId: 'ig-1', postId: 'post-1' }];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result[0].error).toBe('Unknown error');
      expect(result[0].metrics).toBeNull();
    });

    it('should always set totalSaves and totalShares to 0', async () => {
      instagramService.getMediaAnalytics.mockResolvedValue({
        comments: 7,
        likes: 70,
        views: 700,
      });

      const posts = [{ externalId: 'ig-1', postId: 'post-1' }];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result[0].metrics?.totalSaves).toBe(0);
      expect(result[0].metrics?.totalShares).toBe(0);
    });

    it('should handle all posts failing', async () => {
      instagramService.getMediaAnalytics.mockRejectedValue(
        new Error('Service down'),
      );

      const posts = [
        { externalId: 'ig-1', postId: 'post-1' },
        { externalId: 'ig-2', postId: 'post-2' },
      ];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(2);
      expect(result.every((r: FetchResult) => r.metrics === null)).toBe(true);
      expect(result.every((r: FetchResult) => r.error === 'Service down')).toBe(
        true,
      );
      expect(logger.error).toHaveBeenCalledTimes(2);
    });

    it('should correctly map each post externalId in order', async () => {
      instagramService.getMediaAnalytics.mockResolvedValue({
        comments: 0,
        likes: 0,
        views: 0,
      });

      const posts = [
        { externalId: 'ig-alpha', postId: 'post-1' },
        { externalId: 'ig-beta', postId: 'post-2' },
      ];
      await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(instagramService.getMediaAnalytics).toHaveBeenNthCalledWith(
        1,
        'org-1',
        'brand-1',
        'ig-alpha',
      );
      expect(instagramService.getMediaAnalytics).toHaveBeenNthCalledWith(
        2,
        'org-1',
        'brand-1',
        'ig-beta',
      );
    });
  });
});
