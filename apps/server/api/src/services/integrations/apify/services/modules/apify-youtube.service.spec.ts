/**
 * @fileoverview Tests for ApifyYouTubeService
 */

import type {
  ApifyYouTubeComment,
  ApifyYouTubeVideo,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyYouTubeService } from '@api/services/integrations/apify/services/modules/apify-youtube.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ApifyYouTubeService', () => {
  let service: ApifyYouTubeService;
  let baseService: vi.Mocked<ApifyBaseService>;

  const mockBaseMetrics = {
    engagementRate: 0.05,
    velocity: 1000,
    viralScore: 75,
  };

  const mockRawVideo: ApifyYouTubeVideo = {
    channelId: 'UC-channel-1',
    channelName: 'TestChannel',
    commentCount: 200,
    description: 'Test #trending #viral',
    duration: 'PT5M30S',
    id: 'vid-001',
    likeCount: 500,
    publishedAt: new Date().toISOString(),
    thumbnailUrl: 'https://img.youtube.com/vi/vid-001/hqdefault.jpg',
    title: 'Test Video Title',
    url: 'https://youtube.com/watch?v=vid-001',
    viewCount: 10000,
  } as unknown as ApifyYouTubeVideo;

  const mockRawComment: ApifyYouTubeComment = {
    authorChannelId: 'channel-author-1',
    authorDisplayName: 'TestUser',
    authorProfileImageUrl: 'https://example.com/avatar.jpg',
    commentId: 'comment-001',
    id: 'comment-001',
    likeCount: 10,
    publishedAt: new Date().toISOString(),
    replyCount: 2,
    text: 'Great video!',
    videoId: 'vid-001',
    videoTitle: 'Test Video Title',
  } as unknown as ApifyYouTubeComment;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApifyYouTubeService,
        {
          provide: ApifyBaseService,
          useValue: {
            ACTORS: {
              YOUTUBE_CHANNEL_SCRAPER: 'streamers/youtube-channel-scraper',
              YOUTUBE_COMMENT_SCRAPER: 'bernardo/youtube-comment-scraper',
              YOUTUBE_SCRAPER: 'streamers/youtube-scraper',
            },
            calculateEngagementMetrics: vi.fn(() => mockBaseMetrics),
            extractHashtags: vi.fn((text: string) =>
              (text.match(/#\w+/g) || []).map((t) => t.slice(1)),
            ),
            loggerService: {
              error: vi.fn(),
              log: vi.fn(),
              warn: vi.fn(),
            },
            parseDuration: vi.fn(() => 330),
            runActor: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ApifyYouTubeService>(ApifyYouTubeService);
    baseService = module.get(ApifyBaseService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getYouTubeVideos', () => {
    it('should fetch and normalize videos from Apify actor', async () => {
      baseService.runActor.mockResolvedValue([mockRawVideo]);

      const result = await service.getYouTubeVideos(10);

      expect(baseService.runActor).toHaveBeenCalledWith(
        baseService.ACTORS.YOUTUBE_SCRAPER,
        expect.objectContaining({ maxResults: 10 }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        externalId: 'vid-001',
        platform: 'youtube',
        title: 'Test Video Title',
        viewCount: 10000,
      });
    });

    it('should use default limit of 50 when none provided', async () => {
      baseService.runActor.mockResolvedValue([]);

      await service.getYouTubeVideos();

      expect(baseService.runActor).toHaveBeenCalledWith(
        baseService.ACTORS.YOUTUBE_SCRAPER,
        expect.objectContaining({ maxResults: 50 }),
      );
    });

    it('should return empty array on actor error', async () => {
      baseService.runActor.mockRejectedValue(new Error('Apify error'));

      const result = await service.getYouTubeVideos(5);

      expect(result).toEqual([]);
      expect(baseService.loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getYouTubeTrends', () => {
    it('should convert videos to trend format', async () => {
      baseService.runActor.mockResolvedValue([mockRawVideo]);

      const result = await service.getYouTubeTrends({ limit: 5 });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        metadata: expect.objectContaining({
          source: 'apify',
          trendType: 'video',
        }),
        platform: 'youtube',
        topic: 'Test Video Title',
      });
    });

    it('should use default limit of 20 when options not provided', async () => {
      baseService.runActor.mockResolvedValue([]);

      await service.getYouTubeTrends();

      expect(baseService.runActor).toHaveBeenCalledWith(
        baseService.ACTORS.YOUTUBE_SCRAPER,
        expect.objectContaining({ maxResults: 20 }),
      );
    });

    it('should clamp growthRate to 100', async () => {
      const highVelocityVideo = { ...mockRawVideo, viewCount: 10000 };
      baseService.calculateEngagementMetrics.mockReturnValue({
        ...mockBaseMetrics,
        velocity: 15000, // velocity / 100 = 150 → clamped to 100
      } as never);
      baseService.runActor.mockResolvedValue([highVelocityVideo]);

      const result = await service.getYouTubeTrends();

      expect(result[0].growthRate).toBeLessThanOrEqual(100);
    });

    it('should return empty array on error', async () => {
      baseService.runActor.mockRejectedValue(new Error('Failed'));

      const result = await service.getYouTubeTrends();

      expect(result).toEqual([]);
    });
  });

  describe('getYouTubeVideoComments', () => {
    it('should fetch and normalize comments for a video URL', async () => {
      baseService.runActor.mockResolvedValue([mockRawComment]);

      const result = await service.getYouTubeVideoComments(
        'https://youtube.com/watch?v=vid-001',
        { limit: 10 },
      );

      expect(baseService.runActor).toHaveBeenCalledWith(
        baseService.ACTORS.YOUTUBE_COMMENT_SCRAPER,
        expect.objectContaining({
          maxComments: 10,
          startUrls: [{ url: 'https://youtube.com/watch?v=vid-001' }],
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        authorDisplayName: 'TestUser',
        text: 'Great video!',
        videoId: 'vid-001',
      });
    });

    it('should use default limit of 50 when none provided', async () => {
      baseService.runActor.mockResolvedValue([]);

      await service.getYouTubeVideoComments('https://youtube.com/watch?v=xyz');

      expect(baseService.runActor).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxComments: 50 }),
      );
    });

    it('should return empty array on error', async () => {
      baseService.runActor.mockRejectedValue(new Error('Timeout'));

      const result = await service.getYouTubeVideoComments(
        'https://youtube.com/watch?v=xyz',
      );

      expect(result).toEqual([]);
    });
  });

  describe('getYouTubeChannelVideos', () => {
    it('should return raw channel videos without normalization', async () => {
      baseService.runActor.mockResolvedValue([mockRawVideo]);

      const result = await service.getYouTubeChannelVideos(
        'https://youtube.com/@TestChannel',
        { limit: 5 },
      );

      expect(result).toEqual([mockRawVideo]);
      expect(baseService.runActor).toHaveBeenCalledWith(
        baseService.ACTORS.YOUTUBE_CHANNEL_SCRAPER,
        expect.objectContaining({
          maxResults: 5,
          startUrls: [{ url: 'https://youtube.com/@TestChannel' }],
        }),
      );
    });

    it('should return empty array on error', async () => {
      baseService.runActor.mockRejectedValue(new Error('Actor failed'));

      const result = await service.getYouTubeChannelVideos(
        'https://youtube.com/@Chan',
      );

      expect(result).toEqual([]);
    });
  });

  describe('searchYouTubeVideos', () => {
    it('should search videos using query keyword', async () => {
      baseService.runActor.mockResolvedValue([mockRawVideo]);

      const result = await service.searchYouTubeVideos('cats', { limit: 25 });

      expect(baseService.runActor).toHaveBeenCalledWith(
        baseService.ACTORS.YOUTUBE_SCRAPER,
        expect.objectContaining({
          maxResults: 25,
          searchKeywords: 'cats',
        }),
      );
      expect(result).toEqual([mockRawVideo]);
    });

    it('should return empty array on error', async () => {
      baseService.runActor.mockRejectedValue(new Error('Rate limited'));

      const result = await service.searchYouTubeVideos('dogs');

      expect(result).toEqual([]);
    });
  });
});
