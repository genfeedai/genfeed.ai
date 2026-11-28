import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyInstagramService } from '@api/services/integrations/apify/services/modules/apify-instagram.service';
import { ApifyLinkedInService } from '@api/services/integrations/apify/services/modules/apify-linkedin.service';
import { ApifyTikTokService } from '@api/services/integrations/apify/services/modules/apify-tiktok.service';
import { ApifyTwitterService } from '@api/services/integrations/apify/services/modules/apify-twitter.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ApifyService', () => {
  let service: ApifyService;
  let baseService: {
    runActor: ReturnType<typeof vi.fn>;
  };
  let tiktokService: {
    getTikTokVideoComments: ReturnType<typeof vi.fn>;
    getTikTokVideoByUrl: ReturnType<typeof vi.fn>;
    getTikTokUserVideos: ReturnType<typeof vi.fn>;
    searchTikTokByHashtag: ReturnType<typeof vi.fn>;
  };
  let instagramService: {
    getInstagramPostComments: ReturnType<typeof vi.fn>;
    getInstagramTrends: ReturnType<typeof vi.fn>;
    getInstagramPostByUrl: ReturnType<typeof vi.fn>;
    getInstagramUserPosts: ReturnType<typeof vi.fn>;
    searchInstagramByHashtag: ReturnType<typeof vi.fn>;
  };
  let twitterService: {
    getTwitterTrends: ReturnType<typeof vi.fn>;
  };
  let linkedinService: {
    getLinkedInProfilePosts: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApifyService,
        {
          provide: ApifyBaseService,
          useValue: {
            ACTORS: {},
            calculateEngagementMetrics: vi.fn(),
            calculateGrowthRate: vi.fn(),
            calculateViralityScore: vi.fn(),
            extractHashtags: vi.fn(),
            getApiToken: vi.fn(),
            logFailure: vi.fn(),
            loggerService: { error: vi.fn(), log: vi.fn() },
            parseDuration: vi.fn(),
            runActor: vi.fn(),
          },
        },
        {
          provide: ApifyTikTokService,
          useValue: {
            getTikTokSounds: vi.fn(),
            getTikTokVideoByUrl: vi.fn(),
            getTikTokUserVideos: vi.fn(),
            getTikTokVideoComments: vi.fn(),
            getTikTokVideos: vi.fn(),
            searchTikTokByHashtag: vi.fn(),
          },
        },
        {
          provide: ApifyInstagramService,
          useValue: {
            getInstagramPostComments: vi.fn(),
            getInstagramTrends: vi.fn(),
            getInstagramPostByUrl: vi.fn(),
            getInstagramUserPosts: vi.fn(),
            searchInstagramByHashtag: vi.fn(),
          },
        },
        {
          provide: ApifyTwitterService,
          useValue: {
            getTwitterTrends: vi.fn(),
          },
        },
        {
          provide: ApifyLinkedInService,
          useValue: {
            getLinkedInProfilePosts: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ApifyService>(ApifyService);
    baseService = module.get(ApifyBaseService) as unknown as typeof baseService;
    tiktokService = module.get(
      ApifyTikTokService,
    ) as unknown as typeof tiktokService;
    instagramService = module.get(
      ApifyInstagramService,
    ) as unknown as typeof instagramService;
    twitterService = module.get(
      ApifyTwitterService,
    ) as unknown as typeof twitterService;
    linkedinService = module.get(
      ApifyLinkedInService,
    ) as unknown as typeof linkedinService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runActor', () => {
    it('returns the actor result from the base service', async () => {
      baseService.runActor.mockResolvedValue([{ id: '1' }]);

      await expect(
        service.runActor('actor-id', { key: 'value' }),
      ).resolves.toEqual([{ id: '1' }]);
    });
  });

  describe('platform delegation', () => {
    // Each platform module answers with the arguments it received, so the
    // result shows what the facade forwarded.
    const echo =
      () =>
      (...args: unknown[]) =>
        Promise.resolve(args);

    it('forwards TikTok calls and returns their results', async () => {
      tiktokService.getTikTokVideoComments.mockImplementation(echo());
      tiktokService.getTikTokUserVideos.mockImplementation(echo());
      tiktokService.searchTikTokByHashtag.mockImplementation(echo());

      await expect(
        service.getTikTokVideoComments('video-url', { limit: 5 }),
      ).resolves.toEqual(['video-url', { limit: 5 }]);
      await expect(service.getTikTokUserVideos('username')).resolves.toEqual([
        'username',
        undefined,
        undefined,
      ]);
      await expect(
        service.searchTikTokByHashtag('#trending', { limit: 20 }),
      ).resolves.toEqual(['#trending', { limit: 20 }]);
    });

    it('forwards Instagram calls and returns their results', async () => {
      instagramService.getInstagramPostComments.mockImplementation(echo());
      instagramService.getInstagramUserPosts.mockResolvedValue([
        { caption: 'test', id: 'p1' },
      ]);
      instagramService.searchInstagramByHashtag.mockImplementation(echo());

      await expect(
        service.getInstagramPostComments('post-url', { limit: 10 }),
      ).resolves.toEqual(['post-url', { limit: 10 }]);
      await expect(service.getInstagramUserPosts('username')).resolves.toEqual([
        { caption: 'test', id: 'p1' },
      ]);
      await expect(
        service.searchInstagramByHashtag('#travel', { limit: 30 }),
      ).resolves.toEqual(['#travel', { limit: 30 }]);
    });

    it('forwards LinkedIn calls and returns their results', async () => {
      linkedinService.getLinkedInProfilePosts.mockImplementation(echo());

      await expect(
        service.getLinkedInProfilePosts('profile-url', { limit: 20 }),
      ).resolves.toEqual(['profile-url', { limit: 20 }, undefined]);
    });
  });

  describe('getTrendingHashtags', () => {
    it('should return empty array for unsupported platform', async () => {
      const result = await service.getTrendingHashtags('linkedin');

      expect(result).toEqual([]);
    });

    it('should filter trends to hashtag type and transform to hashtag data', async () => {
      const mockTrends = [
        {
          growthRate: 2.5,
          mentions: 1000,
          metadata: {
            hashtags: ['coding', 'dev'],
            trendType: 'hashtag',
            viewCount: 50000,
          },
          platform: 'twitter',
          topic: '#coding',
          viralityScore: 0.8,
        },
        {
          growthRate: 1.0,
          mentions: 500,
          metadata: { trendType: 'topic' },
          platform: 'twitter',
          topic: 'Just a topic',
          viralityScore: 0.3,
        },
      ];

      twitterService.getTwitterTrends.mockResolvedValue(mockTrends);

      const result = await service.getTrendingHashtags('twitter', 50);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        growthMeasured: false,
        growthRate: 2.5,
        hashtag: 'coding',
        platform: 'twitter',
        postCount: 1000,
        postCountScope: 'platform',
        relatedHashtags: ['coding', 'dev'],
        viewCount: 50000,
        viralityScore: 0.8,
      });
    });

    it('should return empty array for TikTok, which has no trend actor', async () => {
      const result = await service.getTrendingHashtags('tiktok');

      expect(result).toEqual([]);
    });

    it('should rethrow when the trend fetcher throws', async () => {
      instagramService.getInstagramTrends.mockRejectedValue(
        new Error('API error'),
      );

      await expect(service.getTrendingHashtags('instagram')).rejects.toThrow(
        'API error',
      );
    });
  });

  it('forwards governed context through all three timelines and two posts', async () => {
    const context = {
      organizationId: 'org-1',
      origin: 'social-source' as const,
    };
    const echo = (...args: unknown[]) => Promise.resolve(args);
    instagramService.getInstagramUserPosts.mockImplementation(echo);
    tiktokService.getTikTokUserVideos.mockImplementation(echo);
    linkedinService.getLinkedInProfilePosts.mockImplementation(echo);
    instagramService.getInstagramPostByUrl.mockImplementation(echo);
    tiktokService.getTikTokVideoByUrl.mockImplementation(echo);

    const timelines = await Promise.all([
      service.getInstagramUserPosts('creator', {}, context),
      service.getTikTokUserVideos('creator', {}, context),
      service.getLinkedInProfilePosts('profile', {}, context),
    ]);
    const posts = await Promise.all([
      service.getInstagramPostByUrl('url', context),
      service.getTikTokVideoByUrl('url', context),
    ]);

    expect(timelines.map((args) => (args as unknown[]).at(-1))).toEqual([
      context,
      context,
      context,
    ]);
    expect(posts).toEqual([
      ['url', context],
      ['url', context],
    ]);
  });
});
