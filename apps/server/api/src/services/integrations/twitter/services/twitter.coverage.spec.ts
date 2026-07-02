/**
 * Additive coverage spec for TwitterService.
 * Covers methods and branches NOT exercised by twitter.service.spec.ts.
 *
 * Existing spec covers:
 *   - service instantiation
 *   - getMediaAnalytics (success path, public bearer client)
 *   - getTrends (success path)
 *   - sendCommentReplyDm (success path)
 *
 * This file covers:
 *   - buildTweetUrl
 *   - refreshToken (success w/ refreshToken, success w/o refreshToken → disconnect,
 *                   credential-not-found, catch-block error path)
 *   - searchRecentTweets (success, empty data, error)
 *   - getUserByUsername (success, null user, error)
 *   - getFollowers (success, error)
 *   - getTweetLikingUsers (success, error)
 *   - getTweetRetweetedBy (success, error)
 *   - getTrends (access-level 403 error, access-level 453 error, generic error)
 *   - sendCommentReplyDm (error propagation)
 *   - uploadMedia (single image success, multi-image success, >4 images error, error propagation)
 *   - postTweet (success, with reply, error propagation)
 *   - getMediaAnalytics (user-client path, video media type, rate-limit 429 path,
 *                        rate-limit with rateLimit property, non-rate-limit error)
 *   - getMediaAnalyticsBatch (empty ids, >100 ids, success with media, rate-limit, error)
 */

// ── Module-level mocks (must precede all imports) ────────────────────────────

const mockV2Search = vi.fn();
const mockV2Get = vi.fn();
const mockV2Tweet = vi.fn();
const mockV2UploadMedia = vi.fn();
const mockV2SendDmInConversation = vi.fn();
const mockV1TrendsByPlace = vi.fn();
const mockRefreshOAuth2Token = vi.fn();

vi.mock('twitter-api-v2', () => {
  // vitest 4 constructs the implementation via `new`, so it must be a
  // constructable function — an arrow implementation throws TypeError.
  const MockTwitterApi = vi.fn(function mockTwitterApi() {
    return {
      refreshOAuth2Token: mockRefreshOAuth2Token,
      v1: { trendsByPlace: mockV1TrendsByPlace },
      v2: {
        get: mockV2Get,
        search: mockV2Search,
        sendDmInConversation: mockV2SendDmInConversation,
        tweet: mockV2Tweet,
        uploadMedia: mockV2UploadMedia,
      },
    };
  });
  return { TwitterApi: MockTwitterApi };
});

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => `decrypted:${val}`) },
}));

vi.mock('@genfeedai/helpers', () => ({
  SocialUrlHelper: {
    buildTwitterUrl: vi.fn(
      (tweetId: string, username: string) =>
        `https://x.com/${username}/status/${tweetId}`,
    ),
  },
}));

vi.mock('@api/shared/utils/html-to-text/html-to-text.util', () => ({
  htmlToText: vi.fn((val: string) => val),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { mockModel } from '@api/helpers/mocks/model.mock';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal credential document shape used across multiple tests. */
const makeCredential = (overrides: Record<string, unknown> = {}) => ({
  _id: 'cred-id',
  accessToken: 'enc-access-token',
  isConnected: true,
  isDeleted: false,
  refreshToken: 'enc-refresh-token',
  user: 'user-id',
  ...overrides,
});

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('TwitterService (coverage)', () => {
  let service: TwitterService;
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let activitiesService: { create: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let httpService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    credentialsService = {
      findOne: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue(makeCredential()),
    };

    activitiesService = {
      create: vi.fn().mockResolvedValue({}),
    };

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    httpService = {
      get: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterService,
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: ConfigService, useValue: { get: vi.fn(() => 'cfg-val') } },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: HttpService, useValue: httpService },
        { provide: LoggerService, useValue: loggerService },
        { provide: PrismaService, useValue: mockModel },
      ],
    }).compile();

    service = module.get<TwitterService>(TwitterService);
  });

  // ── buildTweetUrl ──────────────────────────────────────────────────────────

  describe('buildTweetUrl', () => {
    it('returns canonical Twitter URL from SocialUrlHelper', () => {
      const result = service.buildTweetUrl('123', 'testuser');
      expect(result).toBe('https://x.com/testuser/status/123');
    });
  });

  // ── refreshToken ──────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('throws when credential not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      await expect(service.refreshToken('org', 'brand')).rejects.toThrow(
        'Twitter credential not found',
      );
    });

    it('refreshes OAuth2 token and patches credential', async () => {
      const cred = makeCredential({ refreshToken: 'enc-rt' });
      credentialsService.findOne.mockResolvedValue(cred);
      mockRefreshOAuth2Token.mockResolvedValue({
        accessToken: 'new-access',
        expiresIn: 7200,
        refreshToken: 'new-refresh',
      });
      const updated = makeCredential({ accessToken: 'new-access' });
      credentialsService.patch.mockResolvedValue(updated);

      const result = await service.refreshToken('org', 'brand');

      expect(mockRefreshOAuth2Token).toHaveBeenCalledWith('decrypted:enc-rt');
      expect(credentialsService.patch).toHaveBeenCalledWith(
        cred._id,
        expect.objectContaining({
          accessToken: 'new-access',
          isConnected: true,
        }),
      );
      expect(result).toEqual(updated);
    });

    it('disconnects and throws when credential has no refreshToken (OAuth 1.0a)', async () => {
      const cred = makeCredential({ refreshToken: null });
      credentialsService.findOne.mockResolvedValue(cred);

      await expect(service.refreshToken('org', 'brand')).rejects.toThrow(
        'Twitter credential requires reconnection',
      );

      expect(credentialsService.patch).toHaveBeenCalledWith(
        cred._id,
        expect.objectContaining({ isConnected: false }),
      );
    });

    it('marks disconnected, logs activity, and rethrows when refresh SDK call fails', async () => {
      const cred = makeCredential({ refreshToken: 'enc-rt' });
      credentialsService.findOne.mockResolvedValue(cred);

      const sdkError = new Error('Token expired');
      mockRefreshOAuth2Token.mockRejectedValue(sdkError);

      await expect(service.refreshToken('org', 'brand')).rejects.toThrow(
        'Token expired',
      );

      // Credential should be patched as disconnected
      expect(credentialsService.patch).toHaveBeenCalledWith(
        cred._id,
        expect.objectContaining({ isConnected: false }),
      );
      // Activity logged
      expect(activitiesService.create).toHaveBeenCalled();
    });
  });

  // ── searchRecentTweets ────────────────────────────────────────────────────

  describe('searchRecentTweets', () => {
    it('returns sorted tweets with author info', async () => {
      mockV2Search.mockResolvedValue({
        data: {
          data: [
            {
              author_id: 'u1',
              created_at: '2024-01-01T00:00:00Z',
              id: 'tweet1',
              public_metrics: {
                like_count: 5,
                quote_count: 1,
                reply_count: 2,
                retweet_count: 3,
              },
              text: 'Hello world',
            },
            {
              author_id: 'u2',
              created_at: '2024-01-02T00:00:00Z',
              id: 'tweet2',
              public_metrics: {
                like_count: 1,
                quote_count: 0,
                reply_count: 0,
                retweet_count: 0,
              },
              text: 'Low engagement',
            },
          ],
        },
        includes: {
          users: [
            { id: 'u1', name: 'Alice', username: 'alice' },
            { id: 'u2', name: 'Bob', username: 'bob' },
          ],
        },
      });

      const results = await service.searchRecentTweets('test query');

      // Should be sorted by engagement descending
      expect(results[0].id).toBe('tweet1');
      expect(results[0].authorName).toBe('Alice');
      expect(results[0].engagement).toBe(8); // 5 likes + 3 retweets
      expect(results[1].id).toBe('tweet2');
      expect(results).toHaveLength(2);
    });

    it('returns empty array when data is empty', async () => {
      mockV2Search.mockResolvedValue({ data: { data: [] }, includes: {} });

      const results = await service.searchRecentTweets('empty');

      expect(results).toEqual([]);
    });

    it('returns empty array when data property is absent', async () => {
      mockV2Search.mockResolvedValue({});

      const results = await service.searchRecentTweets('no-data');

      expect(results).toEqual([]);
    });

    it('uses defaults (maxResults=10, sortOrder=relevancy)', async () => {
      mockV2Search.mockResolvedValue({});

      await service.searchRecentTweets('query');

      expect(mockV2Search).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({ max_results: 10, sort_order: 'relevancy' }),
      );
    });

    it('propagates errors', async () => {
      mockV2Search.mockRejectedValue(new Error('Search failed'));

      await expect(service.searchRecentTweets('q')).rejects.toThrow(
        'Search failed',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── getUserByUsername ─────────────────────────────────────────────────────

  describe('getUserByUsername', () => {
    it('returns user data on success', async () => {
      mockV2Get.mockResolvedValue({
        data: {
          id: 'uid1',
          name: 'Test User',
          public_metrics: { followers_count: 1000 },
          username: 'testuser',
        },
      });

      const user = await service.getUserByUsername('testuser');

      expect(user).toEqual({
        followersCount: 1000,
        id: 'uid1',
        name: 'Test User',
        username: 'testuser',
      });
    });

    it('strips leading @ from username', async () => {
      mockV2Get.mockResolvedValue({
        data: { id: 'uid2', name: 'At User', username: 'atuser' },
      });

      await service.getUserByUsername('@atuser');

      expect(mockV2Get).toHaveBeenCalledWith(
        'users/by/username/atuser',
        expect.any(Object),
      );
    });

    it('returns null when API returns no data', async () => {
      mockV2Get.mockResolvedValue({ data: undefined });

      const result = await service.getUserByUsername('ghost');

      expect(result).toBeNull();
    });

    it('propagates errors', async () => {
      mockV2Get.mockRejectedValue(new Error('Network error'));

      await expect(service.getUserByUsername('user')).rejects.toThrow(
        'Network error',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── getFollowers ──────────────────────────────────────────────────────────

  describe('getFollowers', () => {
    it('returns mapped followers list', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            id: 'f1',
            name: 'Follower One',
            public_metrics: { followers_count: 50 },
            username: 'fone',
          },
          {
            id: 'f2',
            name: 'Follower Two',
            public_metrics: { followers_count: 200 },
            username: 'ftwo',
          },
        ],
      });

      const followers = await service.getFollowers('uid1');

      expect(followers).toHaveLength(2);
      expect(followers[0]).toEqual({
        followersCount: 50,
        id: 'f1',
        name: 'Follower One',
        username: 'fone',
      });
    });

    it('caps maxResults at 100', async () => {
      mockV2Get.mockResolvedValue({ data: [] });

      await service.getFollowers('uid1', { maxResults: 999 });

      expect(mockV2Get).toHaveBeenCalledWith(
        'users/uid1/followers',
        expect.objectContaining({ max_results: 100 }),
      );
    });

    it('propagates errors', async () => {
      mockV2Get.mockRejectedValue(new Error('Followers error'));

      await expect(service.getFollowers('uid1')).rejects.toThrow(
        'Followers error',
      );
    });
  });

  // ── getTweetLikingUsers ───────────────────────────────────────────────────

  describe('getTweetLikingUsers', () => {
    it('returns users who liked a tweet', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            id: 'liker1',
            name: 'Liker',
            public_metrics: { followers_count: 10 },
            username: 'liker1',
          },
        ],
      });

      const result = await service.getTweetLikingUsers('tweet123');

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('liker1');
      expect(mockV2Get).toHaveBeenCalledWith(
        'tweets/tweet123/liking_users',
        expect.any(Object),
      );
    });

    it('propagates errors', async () => {
      mockV2Get.mockRejectedValue(new Error('Liking users error'));

      await expect(service.getTweetLikingUsers('tid')).rejects.toThrow(
        'Liking users error',
      );
    });
  });

  // ── getTweetRetweetedBy ───────────────────────────────────────────────────

  describe('getTweetRetweetedBy', () => {
    it('returns users who retweeted a tweet', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            id: 'rt1',
            name: 'Retweeter',
            public_metrics: { followers_count: 300 },
            username: 'retweeter',
          },
        ],
      });

      const result = await service.getTweetRetweetedBy('tweet456');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rt1');
      expect(mockV2Get).toHaveBeenCalledWith(
        'tweets/tweet456/retweeted_by',
        expect.any(Object),
      );
    });

    it('propagates errors', async () => {
      mockV2Get.mockRejectedValue(new Error('Retweeted-by error'));

      await expect(service.getTweetRetweetedBy('tid')).rejects.toThrow(
        'Retweeted-by error',
      );
    });
  });

  // ── getTrends ─────────────────────────────────────────────────────────────

  describe('getTrends (error branches)', () => {
    it('returns empty array on access-level error (code 453)', async () => {
      const err = { code: 453, message: 'access level error' };
      mockV1TrendsByPlace.mockRejectedValue(err);

      // Reassign client
      (service as unknown as Record<string, unknown>).twitterClient = {
        v1: { trendsByPlace: mockV1TrendsByPlace },
      };

      const result = await service.getTrends('org', 'brand');

      expect(result).toEqual([]);
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('returns empty array on 403 status error', async () => {
      mockV1TrendsByPlace.mockRejectedValue({
        message: 'Forbidden',
        status: 403,
      });

      (service as unknown as Record<string, unknown>).twitterClient = {
        v1: { trendsByPlace: mockV1TrendsByPlace },
      };

      const result = await service.getTrends('org', 'brand');

      expect(result).toEqual([]);
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('returns empty array and logs error on generic failure', async () => {
      mockV1TrendsByPlace.mockRejectedValue(new Error('Unknown trends error'));

      (service as unknown as Record<string, unknown>).twitterClient = {
        v1: { trendsByPlace: mockV1TrendsByPlace },
      };

      const result = await service.getTrends();

      expect(result).toEqual([]);
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── sendCommentReplyDm ────────────────────────────────────────────────────

  describe('sendCommentReplyDm (error path)', () => {
    it('propagates error when DM send fails', async () => {
      vi.spyOn(service, 'refreshToken').mockResolvedValue(
        makeCredential() as unknown as import('@api/collections/credentials/schemas/credential.schema').CredentialDocument,
      );
      mockV2SendDmInConversation.mockRejectedValue(new Error('DM failed'));

      await expect(
        service.sendCommentReplyDm('org', 'brand', 'recipient', 'hi'),
      ).rejects.toThrow('DM failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── uploadMedia ───────────────────────────────────────────────────────────

  describe('uploadMedia', () => {
    beforeEach(() => {
      vi.spyOn(service, 'refreshToken').mockResolvedValue(
        makeCredential() as unknown as import('@api/collections/credentials/schemas/credential.schema').CredentialDocument,
      );
    });

    it('uploads a single image and returns tweet ID', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('img') }));
      mockV2UploadMedia.mockResolvedValue('media-id-1');
      mockV2Tweet.mockResolvedValue({ data: { id: 'tweet-abc' } });

      const tweetId = await service.uploadMedia(
        'org',
        'brand',
        'https://example.com/img.jpg',
        'My caption',
        'image/jpeg',
      );

      expect(tweetId).toBe('tweet-abc');
      expect(mockV2Tweet).toHaveBeenCalledWith(
        'My caption',
        expect.objectContaining({ media: { media_ids: ['media-id-1'] } }),
      );
    });

    it('uploads multiple images (carousel) and includes all media IDs', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('img') }));
      mockV2UploadMedia
        .mockResolvedValueOnce('mid-1')
        .mockResolvedValueOnce('mid-2')
        .mockResolvedValueOnce('mid-3');
      mockV2Tweet.mockResolvedValue({ data: { id: 'tweet-carousel' } });

      const tweetId = await service.uploadMedia(
        'org',
        'brand',
        [
          'https://example.com/a.jpg',
          'https://example.com/b.jpg',
          'https://example.com/c.jpg',
        ],
        'Carousel',
        'image/jpeg',
      );

      expect(tweetId).toBe('tweet-carousel');
      expect(mockV2Tweet).toHaveBeenCalledWith(
        'Carousel',
        expect.objectContaining({
          media: { media_ids: ['mid-1', 'mid-2', 'mid-3'] },
        }),
      );
    });

    it('includes quote_tweet_id when provided', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('img') }));
      mockV2UploadMedia.mockResolvedValue('mid-qt');
      mockV2Tweet.mockResolvedValue({ data: { id: 'quoted-tweet' } });

      await service.uploadMedia(
        'org',
        'brand',
        'https://example.com/img.jpg',
        'Quote',
        'image/jpeg',
        'original-tweet-id',
      );

      expect(mockV2Tweet).toHaveBeenCalledWith(
        'Quote',
        expect.objectContaining({ quote_tweet_id: 'original-tweet-id' }),
      );
    });

    it('throws when more than 4 images are provided', async () => {
      const urls = ['a', 'b', 'c', 'd', 'e'];

      await expect(
        service.uploadMedia('org', 'brand', urls, 'Too many', 'image/jpeg'),
      ).rejects.toThrow('Twitter supports maximum 4 images per tweet');
    });

    it('propagates upload error', async () => {
      httpService.get.mockReturnValue(of({ data: Buffer.from('img') }));
      mockV2UploadMedia.mockRejectedValue(new Error('Upload failed'));

      await expect(
        service.uploadMedia(
          'org',
          'brand',
          'https://example.com/img.jpg',
          'Fail',
          'image/jpeg',
        ),
      ).rejects.toThrow('Upload failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── postTweet ─────────────────────────────────────────────────────────────

  describe('postTweet', () => {
    beforeEach(() => {
      vi.spyOn(service, 'refreshToken').mockResolvedValue(
        makeCredential() as unknown as import('@api/collections/credentials/schemas/credential.schema').CredentialDocument,
      );
    });

    it('posts a plain tweet and returns tweet ID', async () => {
      mockV2Tweet.mockResolvedValue({ data: { id: 'new-tweet-id' } });

      const id = await service.postTweet('org', 'brand', 'Hello world');

      expect(id).toBe('new-tweet-id');
      expect(mockV2Tweet).toHaveBeenCalledWith('Hello world', {});
    });

    it('posts a reply when inReplyToTweetId is provided', async () => {
      mockV2Tweet.mockResolvedValue({ data: { id: 'reply-id' } });

      await service.postTweet('org', 'brand', 'Reply text', 'parent-tweet-id');

      expect(mockV2Tweet).toHaveBeenCalledWith(
        'Reply text',
        expect.objectContaining({
          reply: { in_reply_to_tweet_id: 'parent-tweet-id' },
        }),
      );
    });

    it('propagates errors', async () => {
      mockV2Tweet.mockRejectedValue(new Error('Post failed'));

      await expect(service.postTweet('org', 'brand', 'Bad')).rejects.toThrow(
        'Post failed',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── getMediaAnalytics ─────────────────────────────────────────────────────

  describe('getMediaAnalytics', () => {
    it('uses user-client path when accessToken + accessTokenSecret provided', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            public_metrics: {
              bookmark_count: 3,
              like_count: 10,
              quote_count: 2,
              reply_count: 1,
              retweet_count: 4,
            },
          },
        ],
      });

      const result = await service.getMediaAnalytics(
        'tid',
        'user-at',
        'user-ats',
      );

      expect(result.likes).toBe(10);
      expect(result.retweets).toBe(4);
    });

    it('detects video media type', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            public_metrics: {
              bookmark_count: 0,
              like_count: 0,
              quote_count: 0,
              reply_count: 0,
              retweet_count: 0,
            },
          },
        ],
        includes: {
          media: [{ public_metrics: { view_count: 9999 }, type: 'video' }],
        },
      });

      const result = await service.getMediaAnalytics('vid-tweet');

      expect(result.mediaType).toBe('video');
      expect(result.views).toBe(9999);
    });

    it('detects image media type', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            public_metrics: {
              bookmark_count: 0,
              like_count: 0,
              quote_count: 0,
              reply_count: 0,
              retweet_count: 0,
            },
          },
        ],
        includes: { media: [{ type: 'photo' }] },
      });

      const result = await service.getMediaAnalytics('img-tweet');

      expect(result.mediaType).toBe('image');
    });

    it('detects mixed media type when multiple types present', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            public_metrics: {
              bookmark_count: 0,
              like_count: 0,
              quote_count: 0,
              reply_count: 0,
              retweet_count: 0,
            },
          },
        ],
        includes: { media: [{ type: 'photo' }, { type: 'video' }] },
      });

      const result = await service.getMediaAnalytics('mixed-tweet');

      expect(result.mediaType).toBe('mixed');
    });

    it('calculates engagement rate when impressions are present via organic_metrics', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            organic_metrics: { impression_count: 1000 },
            public_metrics: {
              bookmark_count: 0,
              like_count: 50,
              quote_count: 5,
              reply_count: 10,
              retweet_count: 10,
            },
          },
        ],
      });

      const result = await service.getMediaAnalytics('engaged-tweet');

      expect(result.impressions).toBe(1000);
      expect(result.engagementRate).toBeGreaterThan(0);
    });

    it('throws on rate-limit error (code 429)', async () => {
      const rateLimitError = {
        code: 429,
        headers: {
          'x-rate-limit-limit': '100',
          'x-rate-limit-remaining': '0',
          'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 900),
        },
      };
      mockV2Get.mockRejectedValue(rateLimitError);

      await expect(
        service.getMediaAnalytics('rate-limited-tweet'),
      ).rejects.toEqual(expect.objectContaining({ code: 429 }));
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('throws on rate-limit error with rateLimit property', async () => {
      const rateLimitError = {
        rateLimit: {
          limit: '100',
          remaining: '0',
          reset: String(Math.floor(Date.now() / 1000) + 300),
        },
      };
      mockV2Get.mockRejectedValue(rateLimitError);

      await expect(service.getMediaAnalytics('rate-tweet-2')).rejects.toEqual(
        expect.objectContaining({ rateLimit: expect.any(Object) }),
      );
    });

    it('logs error and throws on non-rate-limit failure', async () => {
      const apiError = new Error('Internal Twitter error');
      mockV2Get.mockRejectedValue(apiError);

      await expect(service.getMediaAnalytics('err-tweet')).rejects.toThrow(
        'Internal Twitter error',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── getMediaAnalyticsBatch ────────────────────────────────────────────────

  describe('getMediaAnalyticsBatch', () => {
    it('returns empty Map when given empty array', async () => {
      const result = await service.getMediaAnalyticsBatch([]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('throws when more than 100 tweet IDs provided', async () => {
      const ids = Array.from({ length: 101 }, (_, i) => `id${i}`);

      await expect(service.getMediaAnalyticsBatch(ids)).rejects.toThrow(
        'Twitter API supports maximum 100 tweet IDs per request',
      );
    });

    it('returns analytics map for a batch of tweets', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            id: 't1',
            public_metrics: {
              bookmark_count: 1,
              like_count: 10,
              quote_count: 0,
              reply_count: 2,
              retweet_count: 3,
            },
          },
          {
            id: 't2',
            public_metrics: {
              bookmark_count: 0,
              like_count: 5,
              quote_count: 1,
              reply_count: 0,
              retweet_count: 0,
            },
          },
        ],
        includes: { media: [] },
      });

      const result = await service.getMediaAnalyticsBatch(['t1', 't2']);

      expect(result.size).toBe(2);
      expect(result.get('t1')).toEqual(
        expect.objectContaining({ comments: 2, likes: 10, retweets: 3 }),
      );
      expect(result.get('t2')).toEqual(expect.objectContaining({ likes: 5 }));
    });

    it('handles tweets with media attachments in batch', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            attachments: { media_keys: ['mk1'] },
            id: 'video-tweet',
            public_metrics: {
              bookmark_count: 0,
              like_count: 0,
              quote_count: 0,
              reply_count: 0,
              retweet_count: 0,
            },
          },
        ],
        includes: {
          media: [
            {
              media_key: 'mk1',
              public_metrics: { view_count: 5000 },
              type: 'video',
            },
          ],
        },
      });

      const result = await service.getMediaAnalyticsBatch(['video-tweet']);
      const analytics = result.get('video-tweet');

      expect(analytics?.mediaType).toBe('video');
      expect(analytics?.views).toBe(5000);
    });

    it('uses user-client when accessToken + accessTokenSecret provided', async () => {
      mockV2Get.mockResolvedValue({
        data: [
          {
            id: 'x1',
            public_metrics: {
              bookmark_count: 0,
              like_count: 1,
              quote_count: 0,
              reply_count: 0,
              retweet_count: 0,
            },
          },
        ],
      });

      const result = await service.getMediaAnalyticsBatch(
        ['x1'],
        'user-at',
        'user-ats',
      );

      expect(result.size).toBe(1);
    });

    it('throws on rate-limit (code 429)', async () => {
      const rateLimitError = {
        code: 429,
        headers: {
          'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 60),
        },
      };
      mockV2Get.mockRejectedValue(rateLimitError);

      await expect(service.getMediaAnalyticsBatch(['tid'])).rejects.toEqual(
        expect.objectContaining({ code: 429 }),
      );
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('logs and throws on non-rate-limit error', async () => {
      mockV2Get.mockRejectedValue(new Error('Batch fetch failed'));

      await expect(service.getMediaAnalyticsBatch(['tid'])).rejects.toThrow(
        'Batch fetch failed',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
