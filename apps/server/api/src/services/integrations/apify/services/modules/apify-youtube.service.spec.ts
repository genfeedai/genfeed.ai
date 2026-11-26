import { ResearchCollectionRunner } from '@api/services/research-access/research-collection-runner.service';
/**
 * @fileoverview Tests for ApifyYouTubeService
 */

import type { ApifyYouTubeVideo } from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyYouTubeService } from '@api/services/integrations/apify/services/modules/apify-youtube.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ApifyYouTubeService', () => {
  const researchRunner = { run: vi.fn() };
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ResearchCollectionRunner, useValue: researchRunner },
        ApifyYouTubeService,
        {
          provide: ApifyBaseService,
          useValue: {
            ACTORS: {
              YOUTUBE_CHANNEL_SCRAPER: 'streamers/youtube-channel-scraper',
              YOUTUBE_SCRAPER: 'streamers/youtube-scraper',
            },
            calculateEngagementMetrics: vi.fn(() => mockBaseMetrics),
            extractHashtags: vi.fn((text: string) =>
              (text.match(/#\w+/g) || []).map((t) => t.slice(1)),
            ),
            getApiToken: vi.fn().mockReturnValue('test-token'),
            logFailure: vi.fn(),
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

  describe('getYouTubeChannelUploads', () => {
    it('should return raw channel uploads without normalization', async () => {
      baseService.runActor.mockResolvedValue([mockRawVideo]);

      const result = await service.getYouTubeChannelUploads(
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

    it('should throw when APIFY_API_TOKEN is not configured', async () => {
      baseService.getApiToken.mockReturnValue(null);

      await expect(
        service.getYouTubeChannelUploads('https://youtube.com/@TestChannel'),
      ).rejects.toThrow('APIFY_API_TOKEN is not configured');
    });

    it('should rethrow when the actor run fails', async () => {
      baseService.runActor.mockRejectedValue(new Error('Actor failed'));

      await expect(
        service.getYouTubeChannelUploads('https://youtube.com/@Chan'),
      ).rejects.toThrow('Actor failed');
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
          searchQueries: ['cats'],
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
  it('governs hosted timelines before legacy token admission with unchanged input', async () => {
    baseService.getApiToken.mockReturnValue(null);
    researchRunner.run.mockResolvedValue([]);
    await expect(
      service.getYouTubeChannelUploads(
        'https://youtube.com/@creator',
        { limit: 7 },
        { organizationId: 'org-1', origin: 'social-source' },
      ),
    ).resolves.toEqual([]);
    expect(researchRunner.run).toHaveBeenCalledWith(
      'org-1',
      baseService.ACTORS.YOUTUBE_CHANNEL_SCRAPER,
      { startUrls: [{ url: 'https://youtube.com/@creator' }], maxResults: 7 },
      { tokenMode: 'hosted-only', requestScope: 'social-source-hosted' },
    );
    expect(baseService.runActor).not.toHaveBeenCalled();
    expect(baseService.getApiToken).not.toHaveBeenCalled();
  });
});
