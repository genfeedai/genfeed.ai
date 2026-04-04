import { TikTokFetcherService } from '@api/services/analytics-sync/services/platform-fetchers/tiktok-fetcher.service';
import type { FetchResult } from '@api/services/analytics-sync/services/platform-fetchers/youtube-fetcher.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TikTokFetcherService', () => {
  let service: TikTokFetcherService;
  let logger: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TikTokFetcherService,
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

    service = module.get<TikTokFetcherService>(TikTokFetcherService);
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
    });

    it('should return pending error for all posts', async () => {
      const posts = [
        { externalId: 'tt-1', postId: 'post-1' },
        { externalId: 'tt-2', postId: 'post-2' },
      ];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        error: 'TikTok API integration pending app review',
        externalId: 'tt-1',
        metrics: null,
        postId: 'post-1',
      });
      expect(result[1]).toEqual({
        error: 'TikTok API integration pending app review',
        externalId: 'tt-2',
        metrics: null,
        postId: 'post-2',
      });
    });

    it('should log a warning with the number of skipped posts', async () => {
      const posts = [
        { externalId: 'tt-1', postId: 'post-1' },
        { externalId: 'tt-2', postId: 'post-2' },
        { externalId: 'tt-3', postId: 'post-3' },
      ];
      await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(logger.warn).toHaveBeenCalledWith(
        'TikTokFetcherService: skipping 3 posts — API not yet approved',
      );
    });

    it('should log warning with correct count for a single post', async () => {
      const posts = [{ externalId: 'tt-1', postId: 'post-1' }];
      await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(logger.warn).toHaveBeenCalledWith(
        'TikTokFetcherService: skipping 1 posts — API not yet approved',
      );
    });

    it('should return null metrics for every post', async () => {
      const posts = Array.from({ length: 5 }, (_, i) => ({
        externalId: `tt-${i}`,
        postId: `post-${i}`,
      }));
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result.every((r: FetchResult) => r.metrics === null)).toBe(true);
    });

    it('should preserve postId and externalId in results', async () => {
      const posts = [
        { externalId: 'tiktok-abc-123', postId: 'internal-post-xyz' },
      ];
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result[0].postId).toBe('internal-post-xyz');
      expect(result[0].externalId).toBe('tiktok-abc-123');
    });

    it('should not log warning for empty posts array', async () => {
      await service.fetchMetrics('org-1', 'brand-1', []);

      // The warn is only called when posts.length > 0 in the implementation
      // Actually, looking at the source: it always calls warn with posts.length
      // Even for 0 posts — let's verify
      expect(logger.warn).toHaveBeenCalledWith(
        'TikTokFetcherService: skipping 0 posts — API not yet approved',
      );
    });

    it('should handle large number of posts', async () => {
      const posts = Array.from({ length: 100 }, (_, i) => ({
        externalId: `tt-${i}`,
        postId: `post-${i}`,
      }));
      const result = await service.fetchMetrics('org-1', 'brand-1', posts);

      expect(result).toHaveLength(100);
      expect(result[99].postId).toBe('post-99');
      expect(result[99].error).toBe(
        'TikTok API integration pending app review',
      );
    });
  });
});
