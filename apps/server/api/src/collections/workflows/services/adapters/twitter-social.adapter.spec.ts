import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TwitterSocialAdapter', () => {
  let adapter: TwitterSocialAdapter;
  let mockTwitterService: {
    getFollowers: ReturnType<typeof vi.fn>;
    getMediaAnalyticsBatch: ReturnType<typeof vi.fn>;
    getTweetLikingUsers: ReturnType<typeof vi.fn>;
    getTweetRetweetedBy: ReturnType<typeof vi.fn>;
    getUserByUsername: ReturnType<typeof vi.fn>;
    postTweet: ReturnType<typeof vi.fn>;
    searchRecentTweets: ReturnType<typeof vi.fn>;
    sendCommentReplyDm: ReturnType<typeof vi.fn>;
    uploadMedia: ReturnType<typeof vi.fn>;
  };
  let mockCredentialsService: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockTwitterService = {
      getFollowers: vi.fn().mockResolvedValue([]),
      getMediaAnalyticsBatch: vi.fn().mockResolvedValue(new Map()),
      getTweetLikingUsers: vi.fn().mockResolvedValue([]),
      getTweetRetweetedBy: vi.fn().mockResolvedValue([]),
      getUserByUsername: vi.fn().mockResolvedValue(null),
      postTweet: vi.fn().mockResolvedValue('tweet_reply_456'),
      searchRecentTweets: vi.fn().mockResolvedValue([]),
      sendCommentReplyDm: vi.fn().mockResolvedValue(undefined),
      uploadMedia: vi.fn().mockResolvedValue('tweet_123'),
    };
    mockCredentialsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    adapter = new TwitterSocialAdapter(
      mockTwitterService,
      mockCredentialsService,
      mockLogger,
    );
  });

  describe('createDmSender', () => {
    it('should send a DM via TwitterService', async () => {
      const sender = adapter.createDmSender();
      const result = await sender({
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
        recipientId: 'user456',
        text: 'Hello!',
        userId: 'brand1',
      });

      expect(mockTwitterService.sendCommentReplyDm).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'brand1',
        'user456',
        'Hello!',
      );
      expect(result.messageId).toBeDefined();
    });
  });

  describe('createReplyPublisher', () => {
    it('should reply with media via uploadMedia', async () => {
      const publisher = adapter.createReplyPublisher();
      const result = await publisher({
        mediaUrl: 'https://example.com/image.jpg',
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
        postId: 'tweet_original',
        text: 'Nice tweet!',
        userId: 'brand1',
      });

      expect(mockTwitterService.uploadMedia).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'brand1',
        'https://example.com/image.jpg',
        'Nice tweet!',
        'image/jpeg',
      );
      expect(result.replyId).toBe('tweet_123');
      expect(result.replyUrl).toContain('tweet_123');
    });

    it('should reply with text-only via postTweet', async () => {
      const publisher = adapter.createReplyPublisher();
      const result = await publisher({
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
        postId: 'tweet_original',
        text: 'Nice tweet!',
        userId: 'brand1',
      });

      expect(mockTwitterService.postTweet).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'brand1',
        'Nice tweet!',
        'tweet_original',
      );
      expect(result.replyId).toBe('tweet_reply_456');
      expect(result.replyUrl).toContain('tweet_reply_456');
    });
  });

  describe('createMentionChecker', () => {
    it('should return null when no credentials found', async () => {
      const checker = adapter.createMentionChecker();
      const result = await checker({
        lastMentionId: null,
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
      });

      expect(result).toBeNull();
    });

    it('should search for mentions and return newest', async () => {
      mockCredentialsService.findOne.mockResolvedValue({
        platformUsername: 'testuser',
      });
      mockTwitterService.searchRecentTweets.mockResolvedValue([
        {
          authorUsername: 'mentioner',
          createdAt: '2026-02-23T10:00:00Z',
          id: '999',
          text: '@testuser hello!',
        },
      ]);

      const checker = adapter.createMentionChecker();
      const result = await checker({
        lastMentionId: null,
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
      });

      expect(result).not.toBeNull();
      expect(result?.postId).toBe('999');
      expect(result?.authorUsername).toBe('mentioner');
      expect(result?.platform).toBe('twitter');
    });

    it('should return null when no new mentions since lastMentionId', async () => {
      mockCredentialsService.findOne.mockResolvedValue({
        platformUsername: 'testuser',
      });
      mockTwitterService.searchRecentTweets.mockResolvedValue([
        {
          authorUsername: 'mentioner',
          createdAt: '2026-02-23T10:00:00Z',
          id: '100',
          text: '@testuser hello!',
        },
      ]);

      const checker = adapter.createMentionChecker();
      const result = await checker({
        lastMentionId: '999',
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
      });

      expect(result).toBeNull();
    });
  });

  describe('trigger checkers', () => {
    it('createFollowerChecker should return newest follower', async () => {
      mockCredentialsService.findOne.mockResolvedValue({
        platformUsername: 'brand_handle',
      });
      mockTwitterService.getUserByUsername.mockResolvedValue({
        id: '100',
        username: 'brand_handle',
      });
      mockTwitterService.getFollowers.mockResolvedValue([
        {
          followersCount: 200,
          id: '102',
          name: 'Follower',
          username: 'new_follower',
        },
      ]);

      const checker = adapter.createFollowerChecker();
      const result = await checker({
        lastFollowerId: null,
        minFollowerCount: 100,
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
      });

      expect(result).toEqual(
        expect.objectContaining({
          followerId: '102',
          followerUsername: 'new_follower',
          platform: 'twitter',
        }),
      );
    });

    it('createLikeChecker should return newest like across monitored posts', async () => {
      mockTwitterService.getTweetLikingUsers
        .mockResolvedValueOnce([
          {
            followersCount: 150,
            id: '200',
            name: 'Liker One',
            username: 'liker_one',
          },
        ])
        .mockResolvedValueOnce([
          {
            followersCount: 220,
            id: '220',
            name: 'Liker Two',
            username: 'liker_two',
          },
        ]);

      const checker = adapter.createLikeChecker();
      const result = await checker({
        lastLikeId: null,
        minLikerFollowerCount: 100,
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
        postIds: ['postA', 'postB'],
      });

      expect(result).toEqual(
        expect.objectContaining({
          likerId: '220',
          likerUsername: 'liker_two',
          platform: 'twitter',
          postId: 'postB',
        }),
      );
    });

    it('createRepostChecker should return newest repost', async () => {
      mockTwitterService.getTweetRetweetedBy.mockResolvedValue([
        {
          followersCount: 400,
          id: '321',
          name: 'Reposter',
          username: 'reposter_one',
        },
      ]);

      const checker = adapter.createRepostChecker();
      const result = await checker({
        lastRepostId: null,
        minReposterFollowerCount: 100,
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
        postIds: ['postA'],
      });

      expect(result).toEqual(
        expect.objectContaining({
          platform: 'twitter',
          postId: 'postA',
          reposterId: '321',
          reposterUsername: 'reposter_one',
        }),
      );
    });

    it('createKeywordChecker should return matched keyword result', async () => {
      mockTwitterService.searchRecentTweets.mockResolvedValue([
        {
          authorName: 'Author',
          authorUsername: 'author_one',
          createdAt: '2026-02-25T02:00:00Z',
          engagement: 12,
          id: '901',
          likes: 5,
          quotes: 1,
          replies: 2,
          retweets: 4,
          text: 'We are shipping content workflows today',
        },
      ]);

      const checker = adapter.createKeywordChecker();
      const result = await checker({
        caseSensitive: false,
        excludeKeywords: [],
        keywords: ['workflows'],
        lastPostId: null,
        matchMode: 'contains',
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
      });

      expect(result).toEqual(
        expect.objectContaining({
          matchedKeyword: 'workflows',
          platform: 'twitter',
          postId: '901',
        }),
      );
    });

    it('createEngagementChecker should return threshold match', async () => {
      mockTwitterService.getMediaAnalyticsBatch.mockResolvedValue(
        new Map([
          [
            'postA',
            {
              comments: 20,
              likes: 150,
              views: 600,
            },
          ],
        ]),
      );

      const checker = adapter.createEngagementChecker();
      const result = await checker({
        lastCheckedPostId: null,
        metricType: 'likes',
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
        postIds: ['postA'],
        threshold: 100,
      });

      expect(result).toEqual(
        expect.objectContaining({
          currentValue: 150,
          metricType: 'likes',
          platform: 'twitter',
          postId: 'postA',
          threshold: 100,
        }),
      );
    });
  });

  describe('brandId fallback logic', () => {
    it('should use explicit brandId when provided', async () => {
      const sender = adapter.createDmSender();
      await sender({
        brandId: 'explicit-brand',
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
        recipientId: 'user456',
        text: 'Hello!',
        userId: 'legacy-user',
      });

      expect(mockTwitterService.sendCommentReplyDm).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'explicit-brand',
        'user456',
        'Hello!',
      );
    });

    it('should fall back to userId when brandId is not provided', async () => {
      const sender = adapter.createDmSender();
      await sender({
        organizationId: '507f1f77bcf86cd799439011',
        platform: 'twitter',
        recipientId: 'user456',
        text: 'Hello!',
        userId: 'legacy-user',
      });

      expect(mockTwitterService.sendCommentReplyDm).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'legacy-user',
        'user456',
        'Hello!',
      );
    });
  });
});
