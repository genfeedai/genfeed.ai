import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApifyRedditPost } from '../../interfaces/apify.interfaces';
import { ApifyBaseService } from './apify-base.service';
import { ApifyRedditService } from './apify-reddit.service';

vi.mock('./apify-base.service');

const makeRedditPost = (
  overrides: Partial<ApifyRedditPost> = {},
): ApifyRedditPost =>
  ({
    author: 'testuser',
    createdUtc: Math.floor(Date.now() / 1000),
    id: 'abc123',
    isVideo: false,
    numComments: 50,
    score: 1000,
    subreddit: 'all',
    title: 'Test trending post',
    upvoteRatio: 0.95,
    url: 'https://reddit.com/r/all/test',
    ...overrides,
  }) as ApifyRedditPost;

describe('ApifyRedditService', () => {
  let service: ApifyRedditService;

  const mockBaseService = {
    ACTORS: {
      REDDIT_COMMENT_SCRAPER: 'reddit-comment-scraper',
      REDDIT_SCRAPER: 'reddit-scraper',
    },
    calculateEngagementMetrics: vi.fn().mockReturnValue({
      engagementRate: 0.05,
      velocity: 10,
      viralScore: 80,
    }),
    calculateViralityScore: vi.fn().mockReturnValue(75),
    loggerService: {
      error: vi.fn(),
    },
    runActor: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApifyRedditService,
        {
          provide: ApifyBaseService,
          useValue: mockBaseService,
        },
      ],
    }).compile();

    service = module.get<ApifyRedditService>(ApifyRedditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRedditTrends()', () => {
    it('should return normalized trend data from reddit posts', async () => {
      const posts = [
        makeRedditPost(),
        makeRedditPost({ title: 'Second post' }),
      ];
      mockBaseService.runActor.mockResolvedValue(posts);

      const result = await service.getRedditTrends();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        platform: 'reddit',
        topic: expect.any(String),
        viralityScore: expect.any(Number),
      });
    });

    it('should use default limit of 20', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getRedditTrends();

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'reddit-scraper',
        expect.objectContaining({ maxItems: 20 }),
      );
    });

    it('should respect custom limit in options', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getRedditTrends({ limit: 5 });

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'reddit-scraper',
        expect.objectContaining({ maxItems: 5 }),
      );
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('API error'));

      const result = await service.getRedditTrends();

      expect(result).toEqual([]);
      expect(mockBaseService.loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getRedditVideos()', () => {
    it('should filter to only video posts', async () => {
      const posts = [
        makeRedditPost({ isVideo: true }),
        makeRedditPost({ isVideo: false }),
        makeRedditPost({ isVideo: true }),
      ];
      mockBaseService.runActor.mockResolvedValue(posts);

      const result = await service.getRedditVideos();

      expect(result).toHaveLength(2);
    });

    it('should normalize video data', async () => {
      mockBaseService.runActor.mockResolvedValue([
        makeRedditPost({ isVideo: true, title: 'Funny video' }),
      ]);

      const result = await service.getRedditVideos();

      expect(result[0]).toMatchObject({
        platform: 'reddit',
        title: 'Funny video',
        viewCount: expect.any(Number),
      });
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('network error'));

      const result = await service.getRedditVideos();

      expect(result).toEqual([]);
    });
  });

  describe('getRedditPostComments()', () => {
    it('should call REDDIT_COMMENT_SCRAPER actor', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getRedditPostComments('https://reddit.com/r/test/abc');

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'reddit-comment-scraper',
        expect.objectContaining({ type: 'comments' }),
      );
    });

    it('should return raw comments', async () => {
      const comments = [makeRedditPost(), makeRedditPost()];
      mockBaseService.runActor.mockResolvedValue(comments);

      const result = await service.getRedditPostComments(
        'https://reddit.com/r/test/abc',
      );

      expect(result).toEqual(comments);
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('timeout'));

      const result = await service.getRedditPostComments(
        'https://reddit.com/r/test/abc',
      );

      expect(result).toEqual([]);
    });
  });

  describe('getSubredditPosts()', () => {
    it('should query the specified subreddit', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getSubredditPosts('gaming');

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'reddit-scraper',
        expect.objectContaining({ subreddits: ['gaming'] }),
      );
    });

    it('should default to sort=new', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getSubredditPosts('gaming');

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'reddit-scraper',
        expect.objectContaining({ sort: 'new' }),
      );
    });

    it('should respect custom sort option', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getSubredditPosts('gaming', { sort: 'hot' });

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'reddit-scraper',
        expect.objectContaining({ sort: 'hot' }),
      );
    });
  });

  describe('searchRedditPosts()', () => {
    it('should encode query in search URL', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.searchRedditPosts('AI content creation');

      const [, input] = mockBaseService.runActor.mock.calls[0];
      expect(input.startUrls[0].url).toContain(
        encodeURIComponent('AI content creation'),
      );
    });

    it('should scope to subreddit when provided', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.searchRedditPosts('test', { subreddit: 'marketing' });

      const [, input] = mockBaseService.runActor.mock.calls[0];
      expect(input.startUrls[0].url).toContain('/r/marketing/search');
    });

    it('should use global search URL when no subreddit provided', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.searchRedditPosts('test');

      const [, input] = mockBaseService.runActor.mock.calls[0];
      expect(input.startUrls[0].url).toContain('reddit.com/search');
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('rate limited'));

      const result = await service.searchRedditPosts('viral');

      expect(result).toEqual([]);
    });
  });
});
