// Mock YouTube service to break circular dependency chain
// YoutubeService <-> YoutubeAnalyticsService creates circular imports
vi.mock('@api/services/integrations/youtube/services/youtube.service', () => ({
  YoutubeService: vi.fn().mockImplementation(() => ({
    exchangeCodeForTokens: vi.fn(),
    generateAuthUrl: vi.fn(),
    getChannelDetails: vi.fn(),
    getMediaAnalytics: vi.fn(),
    getMediaAnalyticsBatch: vi.fn(),
    getTrends: vi.fn(),
    getVideoMetadata: vi.fn(),
    getVideoStatus: vi.fn(),
    parseDuration: vi.fn(),
    postComment: vi.fn(),
    refreshToken: vi.fn(),
    uploadVideo: vi.fn(),
  })),
}));

import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoIdFactory } from '@test/factories/base.factory';
import {
  mockCacheService,
  mockConfigService,
  mockLoggerService,
} from '@test/mocks/service.mocks';

// Mock Accounts Service interface (service doesn't exist in codebase)
interface AccountsService {
  findOne: vi.Mock;
  refreshToken: vi.Mock;
  validateCredentials: vi.Mock;
  findByPlatform: vi.Mock;
}

// Mock Twitter Service interface (extends real service with test-only methods)
interface MockTwitterService extends Partial<TwitterService> {
  authenticate: vi.Mock;
  postTweet: vi.Mock;
  uploadMedia: vi.Mock;
  deleteTweet: vi.Mock;
  getTweet: vi.Mock;
  getMediaAnalytics: vi.Mock;
  getUserProfile: vi.Mock;
  scheduleTweet: vi.Mock;
}

// Mock Instagram Service interface (extends real service with test-only methods)
interface MockInstagramService extends Partial<InstagramService> {
  authenticate: vi.Mock;
  postPhoto: vi.Mock;
  postVideo: vi.Mock;
  postCarousel: vi.Mock;
  postStory: vi.Mock;
  postReel: vi.Mock;
  deletePost: vi.Mock;
  getMediaAnalytics: vi.Mock;
  getInsights: vi.Mock;
  schedulePost: vi.Mock;
}

// Mock TikTok Service interface (extends real service with test-only methods)
interface MockTiktokService extends Partial<TiktokService> {
  authenticate: vi.Mock;
  postVideo: vi.Mock;
  uploadVideo: vi.Mock;
  getVideoStatus: vi.Mock;
  deleteVideo: vi.Mock;
  getMediaAnalytics: vi.Mock;
  getUserProfile: vi.Mock;
  scheduleVideo: vi.Mock;
}

// Mock Facebook Service interface (extends real service with test-only methods)
interface MockFacebookService extends Partial<FacebookService> {
  authenticate: vi.Mock;
  postToPage: vi.Mock;
  postVideo: vi.Mock;
  postPhoto: vi.Mock;
  deletePost: vi.Mock;
  getPostInsights: vi.Mock;
  schedulePost: vi.Mock;
  getPageAccessToken: vi.Mock;
}

// Mock Post Analytics Service interface (extends real service with test-only methods)
interface MockPostAnalyticsService extends Partial<PostAnalyticsService> {
  fetchAnalytics: vi.Mock;
  storeAnalytics: vi.Mock;
  getAnalyticsByPost: vi.Mock;
  aggregateAnalytics: vi.Mock;
}

// Allow skipping this file when MongoDB memory server cannot run
// Set SKIP_MONGODB_MEMORY=true to skip all tests in this file
if (process.env.SKIP_MONGODB_MEMORY === 'true') {
  const g: any = global as any;
  const d: any = (global as any).describe;
  g.describe = ((name: string, fn: any) =>
    d?.skip ? d.skip(name, fn) : describe(name, fn)) as any;
  const i: any = (global as any).it;
  g.it = ((name: string, fn: any) =>
    i?.skip ? i.skip(name, fn) : it(name, fn)) as any;
  g.test = g.it;
}

describe('Social Media Publishing Integration Tests', () => {
  // Increase timeout for MongoDB memory server operations
  // vi timeout configured in vitest.config(30000);

  let app: INestApplication;
  let moduleRef: TestingModule;

  let twitterService: MockTwitterService;
  let instagramService: MockInstagramService;
  let tiktokService: MockTiktokService;
  let facebookService: MockFacebookService;
  let postsService: PostsService;
  let postAnalyticsService: MockPostAnalyticsService;
  let accountsService: AccountsService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        {
          provide: TwitterService,
          useValue: {
            authenticate: vi.fn(),
            deleteTweet: vi.fn(),
            getMediaAnalytics: vi.fn(),
            getTweet: vi.fn(),
            getUserProfile: vi.fn(),
            postTweet: vi.fn(),
            scheduleTweet: vi.fn(),
            uploadMedia: vi.fn(),
          },
        },
        {
          provide: InstagramService,
          useValue: {
            authenticate: vi.fn(),
            deletePost: vi.fn(),
            getInsights: vi.fn(),
            getMediaAnalytics: vi.fn(),
            postCarousel: vi.fn(),
            postPhoto: vi.fn(),
            postReel: vi.fn(),
            postStory: vi.fn(),
            postVideo: vi.fn(),
            schedulePost: vi.fn(),
          },
        },
        {
          provide: TiktokService,
          useValue: {
            authenticate: vi.fn(),
            deleteVideo: vi.fn(),
            getMediaAnalytics: vi.fn(),
            getUserProfile: vi.fn(),
            getVideoStatus: vi.fn(),
            postVideo: vi.fn(),
            scheduleVideo: vi.fn(),
            uploadVideo: vi.fn(),
          },
        },
        {
          provide: FacebookService,
          useValue: {
            authenticate: vi.fn(),
            deletePost: vi.fn(),
            getPageAccessToken: vi.fn(),
            getPostInsights: vi.fn(),
            postPhoto: vi.fn(),
            postToPage: vi.fn(),
            postVideo: vi.fn(),
            schedulePost: vi.fn(),
          },
        },
        {
          provide: PostsService,
          useValue: {
            create: vi.fn(),
            delete: vi.fn(),
            findByPlatform: vi.fn(),
            findByUser: vi.fn(),
            findOne: vi.fn(),
            update: vi.fn(),
            updateStatus: vi.fn(),
          },
        },
        {
          provide: PostAnalyticsService,
          useValue: {
            aggregateAnalytics: vi.fn(),
            fetchAnalytics: vi.fn(),
            getAnalyticsByPost: vi.fn(),
            storeAnalytics: vi.fn(),
          },
        },
        {
          provide: 'AccountsService',
          useValue: {
            findByPlatform: vi.fn(),
            findOne: vi.fn(),
            refreshToken: vi.fn(),
            validateCredentials: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService(),
        },
        {
          provide: ConfigService,
          useValue: mockConfigService({
            FACEBOOK_APP_ID: 'test-id',
            INSTAGRAM_CLIENT_ID: 'test-id',
            TIKTOK_CLIENT_KEY: 'test-key',
            TWITTER_API_KEY: 'test-key',
          }),
        },
        {
          provide: CacheService,
          useValue: mockCacheService(),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    twitterService = moduleRef.get<MockTwitterService>(TwitterService);
    instagramService = moduleRef.get<MockInstagramService>(InstagramService);
    tiktokService = moduleRef.get<MockTiktokService>(TiktokService);
    facebookService = moduleRef.get<MockFacebookService>(FacebookService);
    postsService = moduleRef.get<PostsService>(PostsService);
    postAnalyticsService =
      moduleRef.get<MockPostAnalyticsService>(PostAnalyticsService);
    accountsService = moduleRef.get<AccountsService>('AccountsService');
  });

  afterEach(() => {
    // Clear mocks between tests
    vi.clearAllMocks();
  });

  afterAll(async () => {
    // Ensure proper cleanup order: app -> module -> mongo
    try {
      if (app) {
        await app.close();
        app = null as any;
      }
    } catch {
      // Ignore close errors
    }

    try {
      if (moduleRef) {
        await moduleRef.close();
        moduleRef = null as any;
      }
    } catch {
      // Ignore close errors
    }

    // Allow event loop to clear pending handles
    await new Promise((resolve) => setImmediate(resolve));

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Multi-Platform Publishing Workflow', () => {
    it('should publish content to multiple platforms simultaneously', async () => {
      const userId = MongoIdFactory.createString();
      const organizationId = MongoIdFactory.createString();
      const content = {
        mediaUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
        text: 'Check out our latest video! #AI #VideoGeneration',
        thumbnail: 'https://s3.amazonaws.com/bucket/thumbnail.jpg',
      };

      // Mock platform responses
      const twitterResponse = {
        id: 'tweet_123',
        url: 'https://twitter.com/status/123',
      };
      const instagramResponse = {
        id: 'ig_123',
        url: 'https://instagram.com/p/123',
      };
      const tiktokResponse = {
        id: 'tt_123',
        share_url: 'https://tiktok.com/@user/video/123',
      };

      twitterService.postTweet.mockResolvedValue(twitterResponse);
      instagramService.postReel.mockResolvedValue(instagramResponse);
      tiktokService.postVideo.mockResolvedValue(tiktokResponse);

      // Publish to all platforms
      const results = await Promise.all([
        twitterService.postTweet(content.text, { media: content.thumbnail }),
        instagramService.postReel(content.mediaUrl, content.text),
        tiktokService.postVideo(content.mediaUrl, {
          description: content.text,
        }),
      ]);

      expect(results).toHaveLength(3);
      expect(twitterService.postTweet).toHaveBeenCalled();
      expect(instagramService.postReel).toHaveBeenCalled();
      expect(tiktokService.postVideo).toHaveBeenCalled();

      // Store post records
      for (const [index, platform] of [
        'twitter',
        'instagram',
        'tiktok',
      ].entries()) {
        (postsService.create as vi.Mock).mockResolvedValue({
          _id: MongoIdFactory.createString(),
          organization: organizationId,
          platform,
          platformPostId: results[index].id || results[index].share_url,
          status: 'published',
          user: userId,
        });
      }
    });

    it('should handle partial publishing failures', async () => {
      const content = {
        mediaUrl: 'https://example.com/video.mp4',
        text: 'Test post',
      };

      twitterService.postTweet.mockResolvedValue({
        id: 'tweet_success',
      });
      instagramService.postReel.mockRejectedValue(
        new Error('Instagram API error'),
      );
      tiktokService.postVideo.mockResolvedValue({
        id: 'tiktok_success',
      });

      const publishToAll = async () => {
        const results = await Promise.allSettled([
          twitterService.postTweet(content.text),
          instagramService.postReel(content.mediaUrl, content.text),
          tiktokService.postVideo(content.mediaUrl),
        ]);

        return results.map((result, index) => ({
          error: result.status === 'rejected' ? result.reason : null,
          platform: ['twitter', 'instagram', 'tiktok'][index],
          status: result.status,
          value: result.status === 'fulfilled' ? result.value : null,
        }));
      };

      const results = await publishToAll();

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
      expect(results[1].error.message).toBe('Instagram API error');
    });
  });

  describe('Twitter/X Publishing', () => {
    it('should post a tweet with media', async () => {
      const mediaId = 'media_123';
      const tweetText = 'Amazing AI-generated video! #AI #Innovation';

      twitterService.uploadMedia.mockResolvedValue({
        media_id_string: mediaId,
      });
      twitterService.postTweet.mockResolvedValue({
        id: 'tweet_123',
        media: { media_keys: [mediaId] },
        text: tweetText,
      });

      const media = await twitterService.uploadMedia(
        'https://example.com/video.mp4',
      );
      const tweet = await twitterService.postTweet(tweetText, {
        media_ids: [media.media_id_string],
      });

      expect(tweet.id).toBe('tweet_123');
      expect(tweet.text).toBe(tweetText);
    });

    it('should schedule a tweet for future posting', async () => {
      const scheduledTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      twitterService.scheduleTweet.mockResolvedValue({
        id: 'scheduled_123',
        scheduled_at: scheduledTime.toISOString(),
        status: 'scheduled',
      });

      const scheduled = await twitterService.scheduleTweet(
        'Future tweet content',
        scheduledTime,
      );

      expect(scheduled.status).toBe('scheduled');
      expect(new Date(scheduled.scheduled_at).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });
  });

  describe('Instagram Publishing', () => {
    it('should post a reel with caption and hashtags', async () => {
      const caption = 'Check this out! #Reels #AI #VideoContent #Trending';
      const videoUrl = 'https://example.com/reel.mp4';
      const coverImageUrl = 'https://example.com/cover.jpg';

      instagramService.postReel.mockResolvedValue({
        caption,
        id: 'reel_123',
        media_type: 'REELS',
        permalink: 'https://instagram.com/reel/123',
      });

      const reel = await instagramService.postReel(videoUrl, caption, {
        cover_image: coverImageUrl,
        share_to_feed: true,
      });

      expect(reel.media_type).toBe('REELS');
      expect(reel.caption).toContain('#Reels');
    });

    it('should post a carousel with multiple images', async () => {
      const images = [
        'https://example.com/img1.jpg',
        'https://example.com/img2.jpg',
        'https://example.com/img3.jpg',
      ];

      instagramService.postCarousel.mockResolvedValue({
        children: images.map((_, i) => ({ id: `child_${i}` })),
        id: 'carousel_123',
        media_type: 'CAROUSEL',
      });

      const carousel = await instagramService.postCarousel(
        images,
        'Swipe to see more →',
      );

      expect(carousel.media_type).toBe('CAROUSEL');
      expect(carousel.children).toHaveLength(3);
    });

    it('should post a story with link sticker', async () => {
      instagramService.postStory.mockResolvedValue({
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        id: 'story_123',
        media_type: 'STORY',
      });

      const story = await instagramService.postStory(
        'https://example.com/story.jpg',
        {
          link: 'https://mywebsite.com',
          link_text: 'Learn More',
        },
      );

      expect(story.media_type).toBe('STORY');
      expect(story.expires_at).toBeDefined();
    });
  });

  describe('TikTok Publishing', () => {
    it('should upload and publish a TikTok video', async () => {
      const videoPath = 'https://example.com/tiktok-video.mp4';
      const description = 'Amazing content #ForYou #FYP #Viral';

      // Step 1: Initialize upload
      tiktokService.uploadVideo.mockResolvedValue({
        upload_url: 'https://upload.tiktok.com/video/123',
        video_id: 'upload_123',
      });

      // Step 2: Post video
      tiktokService.postVideo.mockResolvedValue({
        description,
        id: 'tt_video_123',
        share_url: 'https://www.tiktok.com/@user/video/123',
        status: 'published',
      });

      const upload = await tiktokService.uploadVideo(videoPath);
      const video = await tiktokService.postVideo(upload.video_id, {
        description,
        duet_disabled: false,
        privacy_level: 'PUBLIC',
        stitch_disabled: false,
      });

      expect(video.share_url).toContain('tiktok.com');
      expect(video.description).toContain('#FYP');
    });

    it('should check video processing status', async () => {
      const videoId = 'tt_processing_123';

      // First check - processing
      tiktokService.getVideoStatus.mockResolvedValueOnce({
        id: videoId,
        progress: 75,
        status: IngredientStatus.PROCESSING,
      });

      // Second check - completed
      tiktokService.getVideoStatus.mockResolvedValueOnce({
        id: videoId,
        share_url: 'https://www.tiktok.com/@user/video/123',
        status: 'published',
      });

      const status1 = await tiktokService.getVideoStatus(videoId);
      expect(status1.status).toBe('processing');

      const status2 = await tiktokService.getVideoStatus(videoId);
      expect(status2.status).toBe('published');
    });
  });

  describe('Facebook Publishing', () => {
    it('should post to a Facebook page', async () => {
      const pageId = 'page_123';
      const pageAccessToken = 'page_token_123';

      facebookService.getPageAccessToken.mockResolvedValue(pageAccessToken);
      facebookService.postToPage.mockResolvedValue({
        id: 'post_123',
        permalink_url: 'https://facebook.com/page/posts/123',
      });

      const token = await facebookService.getPageAccessToken(pageId);
      const post = await facebookService.postToPage(pageId, {
        access_token: token,
        link: 'https://mywebsite.com',
        message: 'Check out our latest update!',
      });

      expect(post.permalink_url).toContain('facebook.com');
    });

    it('should post a video to Facebook', async () => {
      const pageId = 'page_123';
      const videoUrl = 'https://example.com/facebook-video.mp4';

      facebookService.postVideo.mockResolvedValue({
        id: 'video_123',
        permalink_url: 'https://facebook.com/page/videos/123',
        video_id: 'fb_video_123',
      });

      const video = await facebookService.postVideo(pageId, videoUrl, {
        description: 'Amazing video content!',
        title: 'Must Watch Video',
      });

      expect(video.video_id).toBe('fb_video_123');
    });
  });

  describe('Analytics and Insights', () => {
    it('should fetch analytics for published content', async () => {
      const postId = MongoIdFactory.createString();
      const platformPostId = 'post_123';

      // Mock analytics responses
      const twitterAnalytics = {
        engagements: 250,
        impressions: 5000,
        likes: 150,
        replies: 30,
        retweets: 50,
      };

      const instagramAnalytics = {
        comments: 65,
        impressions: 8000,
        likes: 450,
        reach: 6500,
        saves: 120,
        shares: 85,
      };

      twitterService.getMediaAnalytics.mockResolvedValue(twitterAnalytics);
      instagramService.getMediaAnalytics.mockResolvedValue(instagramAnalytics);

      const analytics = {
        instagram: await instagramService.getMediaAnalytics(platformPostId),
        twitter: await twitterService.getMediaAnalytics(platformPostId),
      };

      expect(analytics.twitter.impressions).toBe(5000);
      expect(analytics.instagram.reach).toBe(6500);

      // Store analytics
      postAnalyticsService.storeAnalytics.mockResolvedValue({
        fetchedAt: new Date(),
        metrics: twitterAnalytics,
        platform: 'twitter',
        publication: postId,
      });

      await postAnalyticsService.storeAnalytics(
        postId,
        'twitter',
        twitterAnalytics,
      );
    });

    it('should aggregate analytics across platforms', async () => {
      const userId = MongoIdFactory.createString();
      const dateRange = {
        end: new Date(),
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      };

      postAnalyticsService.aggregateAnalytics.mockResolvedValue({
        averageEngagementRate: 6.0,
        platformBreakdown: {
          instagram: { engagements: 1000, impressions: 15000 },
          twitter: { engagements: 500, impressions: 10000 },
        },
        topPerformingPlatform: 'instagram',
        totalEngagements: 1500,
        totalImpressions: 25000,
      });

      const aggregated = await postAnalyticsService.aggregateAnalytics(
        userId,
        dateRange,
      );

      expect(aggregated.totalImpressions).toBe(25000);
      expect(aggregated.averageEngagementRate).toBe(6.0);
      expect(aggregated.topPerformingPlatform).toBe('instagram');
    });
  });

  describe('Account Management and Authentication', () => {
    it('should authenticate and refresh tokens for social accounts', async () => {
      const accountId = MongoIdFactory.createString();

      accountsService.findOne.mockResolvedValue({
        _id: accountId,
        accessToken: 'old_token',
        expiresAt: new Date(Date.now() - 1000), // Expired
        platform: 'instagram',
        refreshToken: 'refresh_token',
      });

      accountsService.refreshToken.mockResolvedValue({
        accessToken: 'new_token',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      const account = await accountsService.findOne({ _id: accountId });
      expect(new Date(account.expiresAt).getTime()).toBeLessThan(Date.now());

      const refreshed = await accountsService.refreshToken(accountId);
      expect(refreshed.accessToken).toBe('new_token');
      expect(new Date(refreshed.expiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it('should validate account credentials before publishing', async () => {
      const accountId = MongoIdFactory.createString();

      accountsService.validateCredentials.mockResolvedValue({
        platform: 'twitter',
        username: '@testuser',
        valid: true,
      });

      const validation = await accountsService.validateCredentials(accountId);
      expect(validation.valid).toBe(true);
      expect(validation.username).toBe('@testuser');
    });
  });

  describe('Scheduled Publishing', () => {
    it('should schedule posts across multiple platforms', async () => {
      const scheduledTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
      const content = {
        media: 'https://example.com/media.jpg',
        text: 'Scheduled post content',
      };

      const scheduleResults = await Promise.all([
        twitterService.scheduleTweet(content.text, scheduledTime),
        instagramService.schedulePost(
          content.media,
          content.text,
          scheduledTime,
        ),
        facebookService.schedulePost('page_123', content, scheduledTime),
      ]);

      expect(scheduleResults).toHaveLength(3);
      scheduleResults.forEach((result) => {
        expect(result.status || result.scheduled_at).toBeDefined();
      });
    });

    it('should handle timezone conversions for scheduling', () => {
      const userTimezone = 'America/New_York';
      const scheduledTimeLocal = new Date('2024-01-15 15:00:00'); // 3 PM EST
      const scheduledTimeUTC = convertToUTC(scheduledTimeLocal, userTimezone);

      expect(scheduledTimeUTC.getUTCHours()).toBe(20); // 8 PM UTC
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    it('should retry failed publications with exponential backoff', async () => {
      let attempts = 0;

      instagramService.postReel.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Rate limited'));
        }
        return Promise.resolve({ id: 'success_123' });
      });

      const retryPublish = async () => {
        let lastError;
        for (let i = 0; i < 3; i++) {
          try {
            return await instagramService.postReel('video.mp4', 'caption');
          } catch (error: unknown) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 2 ** i * 1000));
          }
        }
        throw lastError;
      };

      const result = await retryPublish();
      expect(result.id).toBe('success_123');
      expect(attempts).toBe(3);
    });

    it('should rollback publications on critical failure', async () => {
      const publications: Array<{ platform: string; id: string }> = [];

      twitterService.postTweet.mockResolvedValue({
        id: 'tweet_123',
      });
      instagramService.postReel.mockRejectedValue(new Error('Critical error'));

      twitterService.deleteTweet.mockResolvedValue({
        deleted: true,
      });

      try {
        const tweet = await twitterService.postTweet('content');
        publications.push({ id: tweet.id, platform: 'twitter' });

        const reel = await instagramService.postReel('video.mp4', 'caption');
        publications.push({ id: reel.id, platform: 'instagram' });
      } catch (error: unknown) {
        // Rollback successful posts
        for (const pub of publications) {
          if (pub.platform === 'twitter') {
            await twitterService.deleteTweet(pub.id);
          }
        }

        throw error;
      }

      expect(twitterService.deleteTweet).toHaveBeenCalledWith('tweet_123');
    });
  });
});

// Helper function
function convertToUTC(date: Date, timezone: string): Date {
  // Simplified timezone conversion for testing
  const offset = timezone === 'America/New_York' ? 5 : 0;
  return new Date(date.getTime() + offset * 60 * 60 * 1000);
}
