import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ApifyTikTokComment,
  ApifyTikTokTrend,
  ApifyTikTokVideo,
} from '../../interfaces/apify.interfaces';
import { ApifyBaseService } from './apify-base.service';
import { ApifyTikTokService } from './apify-tiktok.service';

vi.mock('./apify-base.service');

const makeTikTokTrend = (
  overrides: Partial<ApifyTikTokTrend> = {},
): ApifyTikTokTrend =>
  ({
    coverUrl: 'https://p16.tiktokcdn.com/cover.jpg',
    hashtag: '#trending',
    title: 'Trending Challenge',
    videoCount: 50000,
    viewCount: 10000000,
    ...overrides,
  }) as ApifyTikTokTrend;

const makeTikTokVideo = (
  overrides: Partial<ApifyTikTokVideo> = {},
): ApifyTikTokVideo =>
  ({
    authorMeta: { id: 'user1', name: 'testuser', nickname: 'Test User' },
    commentCount: 200,
    createTime: Math.floor(Date.now() / 1000),
    desc: 'Check this out! #viral',
    diggCount: 5000,
    hashtags: [{ name: 'viral' }, { name: 'fyp' }],
    id: 'video123',
    musicMeta: { musicId: 'sound1', musicName: 'Trending Sound' },
    playCount: 100000,
    shareCount: 1000,
    videoMeta: { duration: 30 },
    webVideoUrl: 'https://tiktok.com/@testuser/video/123',
    ...overrides,
  }) as ApifyTikTokVideo;

const makeTikTokComment = (
  overrides: Partial<ApifyTikTokComment> = {},
): ApifyTikTokComment =>
  ({
    cid: 'comment1',
    createTime: Math.floor(Date.now() / 1000),
    diggCount: 50,
    id: 'comment1',
    replyCommentTotal: 3,
    text: 'Great video!',
    user: {
      avatarThumb: 'https://p16.tiktokcdn.com/avatar.jpg',
      id: 'user2',
      nickname: 'Commenter',
      uniqueId: 'commenter123',
      verified: false,
    },
    videoId: 'video123',
    ...overrides,
  }) as ApifyTikTokComment;

describe('ApifyTikTokService', () => {
  let service: ApifyTikTokService;

  const mockBaseService = {
    ACTORS: {
      TIKTOK_COMMENT_SCRAPER: 'clockworks/tiktok-comments-scraper',
      TIKTOK_SCRAPER: 'clockworks/tiktok-scraper',
      TIKTOK_TRENDS: 'clockworks/tiktok-trends-scraper',
    },
    calculateEngagementMetrics: vi.fn().mockReturnValue({
      engagementRate: 0.06,
      velocity: 15,
      viralScore: 90,
    }),
    calculateGrowthRate: vi.fn().mockReturnValue(20),
    calculateViralityScore: vi.fn().mockReturnValue(85),
    loggerService: {
      error: vi.fn(),
    },
    runActor: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApifyTikTokService,
        {
          provide: ApifyBaseService,
          useValue: mockBaseService,
        },
      ],
    }).compile();

    service = module.get<ApifyTikTokService>(ApifyTikTokService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTikTokTrends()', () => {
    it('should return normalized trend data', async () => {
      const trends = [
        makeTikTokTrend(),
        makeTikTokTrend({ hashtag: '#dance' }),
      ];
      mockBaseService.runActor.mockResolvedValue(trends);

      const result = await service.getTikTokTrends();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        growthRate: 20,
        mentions: 50000,
        platform: 'tiktok',
        topic: '#trending',
        viralityScore: 85,
      });
    });

    it('should use default limit of 20 and region US', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getTikTokTrends();

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'clockworks/tiktok-trends-scraper',
        expect.objectContaining({ maxItems: 20, region: 'US' }),
      );
    });

    it('should respect custom limit and region', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getTikTokTrends({ limit: 5, region: 'GB' });

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'clockworks/tiktok-trends-scraper',
        expect.objectContaining({ maxItems: 5, region: 'GB' }),
      );
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('API error'));

      const result = await service.getTikTokTrends();

      expect(result).toEqual([]);
      expect(mockBaseService.loggerService.error).toHaveBeenCalled();
    });

    it('should normalize metadata with hashtags and view counts', async () => {
      const trend = makeTikTokTrend({
        hashtag: '#cooking',
        videoCount: 10000,
        viewCount: 5000000,
      });
      mockBaseService.runActor.mockResolvedValue([trend]);

      const result = await service.getTikTokTrends();

      expect(result[0].metadata).toMatchObject({
        hashtags: ['#cooking'],
        source: 'apify',
        trendType: 'hashtag',
        videoCount: 10000,
        viewCount: 5000000,
      });
    });

    it('should handle trends with missing hashtag using title fallback', async () => {
      const trend = makeTikTokTrend({
        hashtag: undefined,
        title: 'Dance Trend',
      });
      mockBaseService.runActor.mockResolvedValue([trend]);

      const result = await service.getTikTokTrends();

      expect(result[0].topic).toBe('Dance Trend');
    });

    it('should fall back to Unknown when hashtag and title are both missing', async () => {
      const trend = makeTikTokTrend({ hashtag: undefined, title: undefined });
      mockBaseService.runActor.mockResolvedValue([trend]);

      const result = await service.getTikTokTrends();

      expect(result[0].topic).toBe('Unknown');
    });
  });

  describe('getTikTokVideos()', () => {
    it('should return normalized video data', async () => {
      mockBaseService.runActor.mockResolvedValue([makeTikTokVideo()]);

      const result = await service.getTikTokVideos();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        commentCount: 200,
        creatorHandle: 'testuser',
        externalId: 'video123',
        likeCount: 5000,
        platform: 'tiktok',
        shareCount: 1000,
        soundId: 'sound1',
        soundName: 'Trending Sound',
        viewCount: 100000,
      });
    });

    it('should use default limit of 50', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getTikTokVideos();

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'clockworks/tiktok-scraper',
        expect.objectContaining({ maxItems: 50 }),
      );
    });

    it('should respect custom limit', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getTikTokVideos(10);

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'clockworks/tiktok-scraper',
        expect.objectContaining({ maxItems: 10 }),
      );
    });

    it('should extract hashtags from video', async () => {
      mockBaseService.runActor.mockResolvedValue([makeTikTokVideo()]);

      const result = await service.getTikTokVideos();

      expect(result[0].hashtags).toEqual(['viral', 'fyp']);
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('network error'));

      const result = await service.getTikTokVideos();

      expect(result).toEqual([]);
      expect(mockBaseService.loggerService.error).toHaveBeenCalled();
    });

    it('should handle videos with missing authorMeta', async () => {
      const video = makeTikTokVideo({ authorMeta: undefined });
      mockBaseService.runActor.mockResolvedValue([video]);

      const result = await service.getTikTokVideos();

      expect(result[0].creatorHandle).toBe('unknown');
    });
  });

  describe('getTikTokSounds()', () => {
    it('should extract unique sounds from videos', async () => {
      const videos = [
        makeTikTokVideo({ musicMeta: { musicId: 's1', musicName: 'Sound 1' } }),
        makeTikTokVideo({ musicMeta: { musicId: 's2', musicName: 'Sound 2' } }),
        makeTikTokVideo({ musicMeta: { musicId: 's1', musicName: 'Sound 1' } }),
      ];
      mockBaseService.runActor.mockResolvedValue(videos);

      const result = await service.getTikTokSounds(10);

      expect(result).toHaveLength(2);
      // s1 appears twice so should have usageCount of 2
      const sound1 = result.find((s) => s.soundId === 's1');
      expect(sound1?.usageCount).toBe(2);
    });

    it('should sort sounds by usage count descending', async () => {
      const videos = [
        makeTikTokVideo({ musicMeta: { musicId: 's1', musicName: 'Sound 1' } }),
        makeTikTokVideo({ musicMeta: { musicId: 's2', musicName: 'Sound 2' } }),
        makeTikTokVideo({ musicMeta: { musicId: 's2', musicName: 'Sound 2' } }),
        makeTikTokVideo({ musicMeta: { musicId: 's2', musicName: 'Sound 2' } }),
      ];
      mockBaseService.runActor.mockResolvedValue(videos);

      const result = await service.getTikTokSounds(10);

      expect(result[0].soundId).toBe('s2');
      expect(result[0].usageCount).toBe(3);
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('timeout'));

      const result = await service.getTikTokSounds();

      expect(result).toEqual([]);
      expect(mockBaseService.loggerService.error).toHaveBeenCalled();
    });

    it('should limit results to requested count', async () => {
      const videos = Array.from({ length: 20 }, (_, i) =>
        makeTikTokVideo({
          musicMeta: { musicId: `s${i}`, musicName: `Sound ${i}` },
        }),
      );
      mockBaseService.runActor.mockResolvedValue(videos);

      const result = await service.getTikTokSounds(5);

      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getTikTokVideoComments()', () => {
    it('should return normalized comments', async () => {
      const comments = [makeTikTokComment()];
      mockBaseService.runActor.mockResolvedValue(comments);

      const result = await service.getTikTokVideoComments(
        'https://tiktok.com/@user/video/123',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        authorUsername: 'commenter123',
        id: 'comment1',
        text: 'Great video!',
        videoId: 'video123',
      });
    });

    it('should use the TIKTOK_COMMENT_SCRAPER actor', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getTikTokVideoComments(
        'https://tiktok.com/@user/video/123',
      );

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'clockworks/tiktok-comments-scraper',
        expect.objectContaining({
          postURLs: ['https://tiktok.com/@user/video/123'],
        }),
      );
    });

    it('should default to limit 50', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getTikTokVideoComments(
        'https://tiktok.com/@user/video/123',
      );

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxComments: 50 }),
      );
    });

    it('should respect custom limit', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getTikTokVideoComments(
        'https://tiktok.com/@user/video/123',
        { limit: 10 },
      );

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxComments: 10 }),
      );
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('rate limited'));

      const result = await service.getTikTokVideoComments(
        'https://tiktok.com/@user/video/123',
      );

      expect(result).toEqual([]);
      expect(mockBaseService.loggerService.error).toHaveBeenCalled();
    });

    it('should normalize comment metrics', async () => {
      const comment = makeTikTokComment({
        diggCount: 100,
        replyCommentTotal: 15,
      });
      mockBaseService.runActor.mockResolvedValue([comment]);

      const result = await service.getTikTokVideoComments(
        'https://tiktok.com/@user/video/123',
      );

      expect(result[0].metrics).toEqual({ likes: 100, replies: 15 });
    });
  });

  describe('getTikTokUserVideos()', () => {
    it('should query videos for the specified username', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getTikTokUserVideos('testcreator');

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'clockworks/tiktok-scraper',
        expect.objectContaining({ profiles: ['testcreator'] }),
      );
    });

    it('should default to limit 20', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getTikTokUserVideos('testcreator');

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ resultsPerPage: 20 }),
      );
    });

    it('should respect custom limit', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getTikTokUserVideos('testcreator', { limit: 5 });

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ resultsPerPage: 5 }),
      );
    });

    it('should return raw videos', async () => {
      const videos = [makeTikTokVideo()];
      mockBaseService.runActor.mockResolvedValue(videos);

      const result = await service.getTikTokUserVideos('testcreator');

      expect(result).toEqual(videos);
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('user not found'));

      const result = await service.getTikTokUserVideos('nonexistent');

      expect(result).toEqual([]);
      expect(mockBaseService.loggerService.error).toHaveBeenCalled();
    });
  });

  describe('searchTikTokByHashtag()', () => {
    it('should search by hashtag stripping the # prefix', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.searchTikTokByHashtag('#cooking');

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'clockworks/tiktok-scraper',
        expect.objectContaining({ hashtags: ['cooking'] }),
      );
    });

    it('should handle hashtag without # prefix', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.searchTikTokByHashtag('cooking');

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'clockworks/tiktok-scraper',
        expect.objectContaining({ hashtags: ['cooking'] }),
      );
    });

    it('should default to limit 50', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.searchTikTokByHashtag('viral');

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ resultsPerPage: 50 }),
      );
    });

    it('should respect custom limit', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.searchTikTokByHashtag('viral', { limit: 25 });

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ resultsPerPage: 25 }),
      );
    });

    it('should return raw videos', async () => {
      const videos = [makeTikTokVideo()];
      mockBaseService.runActor.mockResolvedValue(videos);

      const result = await service.searchTikTokByHashtag('viral');

      expect(result).toEqual(videos);
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('timeout'));

      const result = await service.searchTikTokByHashtag('viral');

      expect(result).toEqual([]);
      expect(mockBaseService.loggerService.error).toHaveBeenCalled();
    });
  });
});
