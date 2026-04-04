import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyInstagramService } from '@api/services/integrations/apify/services/modules/apify-instagram.service';
import { ApifyPinterestService } from '@api/services/integrations/apify/services/modules/apify-pinterest.service';
import { ApifyRedditService } from '@api/services/integrations/apify/services/modules/apify-reddit.service';
import { ApifyTikTokService } from '@api/services/integrations/apify/services/modules/apify-tiktok.service';
import { ApifyTwitterService } from '@api/services/integrations/apify/services/modules/apify-twitter.service';
import { ApifyYouTubeService } from '@api/services/integrations/apify/services/modules/apify-youtube.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ApifyService', () => {
  let service: ApifyService;
  let baseService: {
    runActor: ReturnType<typeof vi.fn>;
  };
  let tiktokService: {
    getTikTokTrends: ReturnType<typeof vi.fn>;
    getTikTokVideoComments: ReturnType<typeof vi.fn>;
    getTikTokUserVideos: ReturnType<typeof vi.fn>;
    searchTikTokByHashtag: ReturnType<typeof vi.fn>;
  };
  let instagramService: {
    getInstagramPostComments: ReturnType<typeof vi.fn>;
    getInstagramUserPosts: ReturnType<typeof vi.fn>;
    searchInstagramByHashtag: ReturnType<typeof vi.fn>;
  };
  let twitterService: {
    getTwitterMentions: ReturnType<typeof vi.fn>;
    getTwitterTrends: ReturnType<typeof vi.fn>;
    getTwitterTweetReplies: ReturnType<typeof vi.fn>;
    getTwitterUserTimeline: ReturnType<typeof vi.fn>;
    searchTwitterTweets: ReturnType<typeof vi.fn>;
  };
  let youtubeService: {
    getYouTubeChannelVideos: ReturnType<typeof vi.fn>;
    getYouTubeVideoComments: ReturnType<typeof vi.fn>;
    searchYouTubeVideos: ReturnType<typeof vi.fn>;
  };
  let redditService: {
    getRedditPostComments: ReturnType<typeof vi.fn>;
    getRedditUserPosts: ReturnType<typeof vi.fn>;
    getSubredditPosts: ReturnType<typeof vi.fn>;
    searchRedditPosts: ReturnType<typeof vi.fn>;
  };
  let pinterestService: {
    getPinterestTrends: ReturnType<typeof vi.fn>;
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
            loggerService: { error: vi.fn(), log: vi.fn() },
            parseDuration: vi.fn(),
            runActor: vi.fn(),
          },
        },
        {
          provide: ApifyTikTokService,
          useValue: {
            getTikTokSounds: vi.fn(),
            getTikTokTrends: vi.fn(),
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
            getInstagramUserPosts: vi.fn(),
            getInstagramVideos: vi.fn(),
            searchInstagramByHashtag: vi.fn(),
          },
        },
        {
          provide: ApifyTwitterService,
          useValue: {
            getTwitterMentions: vi.fn(),
            getTwitterTrends: vi.fn(),
            getTwitterTweetReplies: vi.fn(),
            getTwitterUserTimeline: vi.fn(),
            searchTwitterTweets: vi.fn(),
          },
        },
        {
          provide: ApifyYouTubeService,
          useValue: {
            getYouTubeChannelVideos: vi.fn(),
            getYouTubeTrends: vi.fn(),
            getYouTubeVideoComments: vi.fn(),
            getYouTubeVideos: vi.fn(),
            searchYouTubeVideos: vi.fn(),
          },
        },
        {
          provide: ApifyRedditService,
          useValue: {
            getRedditPostComments: vi.fn(),
            getRedditTrends: vi.fn(),
            getRedditUserPosts: vi.fn(),
            getRedditVideos: vi.fn(),
            getSubredditPosts: vi.fn(),
            searchRedditPosts: vi.fn(),
          },
        },
        {
          provide: ApifyPinterestService,
          useValue: {
            getPinterestTrends: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
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
    youtubeService = module.get(
      ApifyYouTubeService,
    ) as unknown as typeof youtubeService;
    redditService = module.get(
      ApifyRedditService,
    ) as unknown as typeof redditService;
    pinterestService = module.get(
      ApifyPinterestService,
    ) as unknown as typeof pinterestService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runActor', () => {
    it('should delegate to baseService.runActor', async () => {
      const mockResult = [{ id: '1' }];
      baseService.runActor.mockResolvedValue(mockResult);

      const result = await service.runActor('actor-id', { key: 'value' });

      expect(baseService.runActor).toHaveBeenCalledWith('actor-id', {
        key: 'value',
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('TikTok delegation', () => {
    it('should delegate getTikTokTrends to tiktokService', async () => {
      const mockTrends = [{ platform: 'tiktok', topic: 'test' }];
      tiktokService.getTikTokTrends.mockResolvedValue(mockTrends);

      const result = await service.getTikTokTrends({ limit: 10 });

      expect(tiktokService.getTikTokTrends).toHaveBeenCalledWith({
        limit: 10,
      });
      expect(result).toEqual(mockTrends);
    });

    it('should delegate getTikTokVideoComments to tiktokService', async () => {
      const mockComments = [{ id: 'c1', text: 'nice' }];
      tiktokService.getTikTokVideoComments.mockResolvedValue(mockComments);

      const result = await service.getTikTokVideoComments('video-url', {
        limit: 5,
      });

      expect(tiktokService.getTikTokVideoComments).toHaveBeenCalledWith(
        'video-url',
        { limit: 5 },
      );
      expect(result).toEqual(mockComments);
    });

    it('should delegate getTikTokUserVideos to tiktokService', async () => {
      tiktokService.getTikTokUserVideos.mockResolvedValue([]);

      await service.getTikTokUserVideos('username');

      expect(tiktokService.getTikTokUserVideos).toHaveBeenCalledWith(
        'username',
        undefined,
      );
    });

    it('should delegate searchTikTokByHashtag to tiktokService', async () => {
      tiktokService.searchTikTokByHashtag.mockResolvedValue([]);

      await service.searchTikTokByHashtag('#trending', { limit: 20 });

      expect(tiktokService.searchTikTokByHashtag).toHaveBeenCalledWith(
        '#trending',
        { limit: 20 },
      );
    });
  });

  describe('Instagram delegation', () => {
    it('should delegate getInstagramPostComments to instagramService', async () => {
      instagramService.getInstagramPostComments.mockResolvedValue([]);

      await service.getInstagramPostComments('post-url', { limit: 10 });

      expect(instagramService.getInstagramPostComments).toHaveBeenCalledWith(
        'post-url',
        { limit: 10 },
      );
    });

    it('should delegate getInstagramUserPosts to instagramService', async () => {
      const mockPosts = [{ caption: 'test', id: 'p1' }];
      instagramService.getInstagramUserPosts.mockResolvedValue(mockPosts);

      const result = await service.getInstagramUserPosts('username');

      expect(result).toEqual(mockPosts);
    });

    it('should delegate searchInstagramByHashtag to instagramService', async () => {
      instagramService.searchInstagramByHashtag.mockResolvedValue([]);

      await service.searchInstagramByHashtag('#travel', { limit: 30 });

      expect(instagramService.searchInstagramByHashtag).toHaveBeenCalledWith(
        '#travel',
        { limit: 30 },
      );
    });
  });

  describe('Twitter delegation', () => {
    it('should delegate getTwitterMentions to twitterService', async () => {
      const mockTweets = [{ id: 't1', text: 'mention' }];
      twitterService.getTwitterMentions.mockResolvedValue(mockTweets);

      const result = await service.getTwitterMentions('user', {
        limit: 50,
        sinceId: 'abc',
      });

      expect(twitterService.getTwitterMentions).toHaveBeenCalledWith('user', {
        limit: 50,
        sinceId: 'abc',
      });
      expect(result).toEqual(mockTweets);
    });

    it('should delegate getTwitterUserTimeline to twitterService', async () => {
      twitterService.getTwitterUserTimeline.mockResolvedValue([]);

      await service.getTwitterUserTimeline('user');

      expect(twitterService.getTwitterUserTimeline).toHaveBeenCalledWith(
        'user',
        undefined,
      );
    });

    it('should delegate getTwitterTweetReplies to twitterService', async () => {
      twitterService.getTwitterTweetReplies.mockResolvedValue([]);

      await service.getTwitterTweetReplies('tweet-id', { limit: 10 });

      expect(twitterService.getTwitterTweetReplies).toHaveBeenCalledWith(
        'tweet-id',
        { limit: 10 },
      );
    });

    it('should delegate searchTwitterTweets to twitterService', async () => {
      twitterService.searchTwitterTweets.mockResolvedValue([]);

      await service.searchTwitterTweets('query');

      expect(twitterService.searchTwitterTweets).toHaveBeenCalledWith(
        'query',
        undefined,
      );
    });
  });

  describe('YouTube delegation', () => {
    it('should delegate getYouTubeVideoComments to youtubeService', async () => {
      youtubeService.getYouTubeVideoComments.mockResolvedValue([]);

      await service.getYouTubeVideoComments('video-url', { limit: 25 });

      expect(youtubeService.getYouTubeVideoComments).toHaveBeenCalledWith(
        'video-url',
        { limit: 25 },
      );
    });

    it('should delegate getYouTubeChannelVideos to youtubeService', async () => {
      youtubeService.getYouTubeChannelVideos.mockResolvedValue([]);

      await service.getYouTubeChannelVideos('channel-url');

      expect(youtubeService.getYouTubeChannelVideos).toHaveBeenCalledWith(
        'channel-url',
        undefined,
      );
    });

    it('should delegate searchYouTubeVideos to youtubeService', async () => {
      youtubeService.searchYouTubeVideos.mockResolvedValue([]);

      await service.searchYouTubeVideos('search term');

      expect(youtubeService.searchYouTubeVideos).toHaveBeenCalledWith(
        'search term',
        undefined,
      );
    });
  });

  describe('Reddit delegation', () => {
    it('should delegate getRedditPostComments to redditService', async () => {
      redditService.getRedditPostComments.mockResolvedValue([]);

      await service.getRedditPostComments('post-url');

      expect(redditService.getRedditPostComments).toHaveBeenCalledWith(
        'post-url',
        undefined,
      );
    });

    it('should delegate getRedditUserPosts to redditService', async () => {
      redditService.getRedditUserPosts.mockResolvedValue([]);

      await service.getRedditUserPosts('user', { limit: 10 });

      expect(redditService.getRedditUserPosts).toHaveBeenCalledWith('user', {
        limit: 10,
      });
    });

    it('should delegate searchRedditPosts to redditService', async () => {
      redditService.searchRedditPosts.mockResolvedValue([]);

      await service.searchRedditPosts('query', { subreddit: 'test' });

      expect(redditService.searchRedditPosts).toHaveBeenCalledWith('query', {
        subreddit: 'test',
      });
    });

    it('should delegate getSubredditPosts to redditService', async () => {
      redditService.getSubredditPosts.mockResolvedValue([]);

      await service.getSubredditPosts('programming', { sort: 'hot' });

      expect(redditService.getSubredditPosts).toHaveBeenCalledWith(
        'programming',
        { sort: 'hot' },
      );
    });
  });

  describe('Pinterest delegation', () => {
    it('should delegate getPinterestTrends to pinterestService', async () => {
      pinterestService.getPinterestTrends.mockResolvedValue([]);

      await service.getPinterestTrends({ limit: 5 });

      expect(pinterestService.getPinterestTrends).toHaveBeenCalledWith({
        limit: 5,
      });
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
        growthRate: 2.5,
        hashtag: 'coding',
        platform: 'twitter',
        postCount: 1000,
        relatedHashtags: ['coding', 'dev'],
        viewCount: 50000,
        viralityScore: 0.8,
      });
    });

    it('should return empty array when trend fetcher throws', async () => {
      tiktokService.getTikTokTrends.mockRejectedValue(new Error('API error'));

      const result = await service.getTrendingHashtags('tiktok');

      expect(result).toEqual([]);
    });
  });

  describe('convertToUnifiedComment', () => {
    it('should convert a twitter tweet to unified format', () => {
      const tweet = {
        authorAvatarUrl: 'https://avatar.com/test.jpg',
        authorDisplayName: 'Test User',
        authorId: 'a1',
        authorUsername: 'testuser',
        conversationId: 'conv-1',
        createdAt: new Date('2024-01-01'),
        hashtags: ['test'],
        id: 't1',
        inReplyToTweetId: 'parent-1',
        metrics: { likes: 10, replies: 2, retweets: 5 },
        text: 'Hello world',
      };

      const result = service.convertToUnifiedComment(tweet as never, 'twitter');

      expect(result.platform).toBe('twitter');
      expect(result.contentType).toBe('tweet');
      expect(result.id).toBe('t1');
      expect(result.text).toBe('Hello world');
      expect(result.authorUsername).toBe('testuser');
      expect(result.contentId).toBe('conv-1');
      expect(result.inReplyToId).toBe('parent-1');
      expect(result.hashtags).toEqual(['test']);
      expect(result.contentUrl).toBe('https://x.com/testuser/status/t1');
    });

    it('should convert an instagram comment to unified format', () => {
      const comment = {
        authorAvatarUrl: 'https://avatar.com/ig.jpg',
        authorId: 'a2',
        authorUsername: 'iguser',
        createdAt: new Date('2024-01-01'),
        id: 'ig1',
        metrics: { likes: 5, replies: 1 },
        postId: 'post-1',
        postShortCode: 'ABC123',
        text: 'Nice post!',
      };

      const result = service.convertToUnifiedComment(
        comment as never,
        'instagram',
      );

      expect(result.platform).toBe('instagram');
      expect(result.contentType).toBe('post');
      expect(result.contentId).toBe('post-1');
      expect(result.contentUrl).toBe('https://instagram.com/p/ABC123');
    });

    it('should convert a tiktok comment to unified format', () => {
      const comment = {
        authorAvatarUrl: 'https://avatar.com/tt.jpg',
        authorDisplayName: 'TT User',
        authorId: 'a3',
        authorUsername: 'ttuser',
        createdAt: new Date('2024-01-01'),
        id: 'tt1',
        metrics: { likes: 20, replies: 3 },
        text: 'Great video!',
        videoId: 'vid-1',
      };

      const result = service.convertToUnifiedComment(
        comment as never,
        'tiktok',
      );

      expect(result.platform).toBe('tiktok');
      expect(result.contentType).toBe('video');
      expect(result.contentId).toBe('vid-1');
      expect(result.authorDisplayName).toBe('TT User');
    });

    it('should convert a youtube comment to unified format', () => {
      const comment = {
        authorAvatarUrl: 'https://avatar.com/yt.jpg',
        authorDisplayName: 'YT User',
        authorId: 'a4',
        createdAt: new Date('2024-01-01'),
        id: 'yt1',
        metrics: { likes: 15, replies: 0 },
        text: 'Subscribed!',
        videoId: 'vid-yt-1',
      };

      const result = service.convertToUnifiedComment(
        comment as never,
        'youtube',
      );

      expect(result.platform).toBe('youtube');
      expect(result.contentType).toBe('video');
      expect(result.contentId).toBe('vid-yt-1');
      expect(result.contentUrl).toBe('https://youtube.com/watch?v=vid-yt-1');
      expect(result.authorUsername).toBe('a4');
    });
  });
});
