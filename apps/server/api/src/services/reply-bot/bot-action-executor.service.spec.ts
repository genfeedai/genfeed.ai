const { mockTweet, MockTwitterApi } = vi.hoisted(() => {
  const mockTweet = vi.fn();
  const MockTwitterApi = vi.fn(function TwitterApiMock() {
    return {
      v2: {
        tweet: mockTweet,
      },
    };
  });

  return { mockTweet, MockTwitterApi };
});

vi.mock('twitter-api-v2', () => ({
  TwitterApi: MockTwitterApi,
}));

import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { ReplyBotPlatform } from '@genfeedai/enums';
import type {
  IReplyBotContentData,
  IReplyBotCredentialData,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

type BotActionExecutorRouting = {
  postTwitterReply: BotActionExecutorService['postReply'];
  sendTwitterDm: BotActionExecutorService['sendDm'];
};

describe('BotActionExecutorService', () => {
  let service: BotActionExecutorService;

  const mockConfigService = {
    get: vi.fn(() => 'test-value'),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockInstagramService = {
    postComment: vi.fn(),
    sendCommentReplyDm: vi.fn(),
  };

  const mockYoutubeService = {
    replyToComment: vi.fn(),
  };

  const mockTwitterService = {
    postTweet: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotActionExecutorService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: InstagramService, useValue: mockInstagramService },
        { provide: YoutubeService, useValue: mockYoutubeService },
        { provide: TwitterService, useValue: mockTwitterService },
      ],
    }).compile();

    service = module.get<BotActionExecutorService>(BotActionExecutorService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('postReply', () => {
    const targetContent: IReplyBotContentData = {
      authorId: 'author-1',
      authorUsername: 'user1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      id: 'content-123',
      text: 'Original content',
    };

    it.each([
      { isSupported: true, platform: ReplyBotPlatform.TWITTER },
      { isSupported: true, platform: ReplyBotPlatform.INSTAGRAM },
      { isSupported: true, platform: ReplyBotPlatform.YOUTUBE },
      { isSupported: false, platform: ReplyBotPlatform.TIKTOK },
      { isSupported: false, platform: ReplyBotPlatform.REDDIT },
      { isSupported: false, platform: 'unknown' },
    ])(
      'routes reply actions fail-closed for $platform',
      async ({ isSupported, platform }) => {
        const postTwitterReply = vi
          .spyOn(
            service as unknown as BotActionExecutorRouting,
            'postTwitterReply',
          )
          .mockResolvedValue({ contentId: 'reply-1', success: true });
        mockInstagramService.postComment.mockResolvedValue({
          commentId: 'reply-1',
        });
        mockYoutubeService.replyToComment.mockResolvedValue({
          commentId: 'reply-1',
        });
        const credential = {
          accessToken: 'token',
          brandId: 'brand-1',
          organizationId: 'org-1',
          platform,
        } as IReplyBotCredentialData;

        const result = await service.postReply(
          credential,
          targetContent,
          'Nice post!',
        );

        expect(result.success).toBe(isSupported);
        if (isSupported) {
          expect(result.error).toBeUndefined();
          if (platform === ReplyBotPlatform.TWITTER) {
            expect(postTwitterReply).toHaveBeenCalledOnce();
          } else if (platform === ReplyBotPlatform.INSTAGRAM) {
            expect(mockInstagramService.postComment).toHaveBeenCalledOnce();
          } else {
            expect(mockYoutubeService.replyToComment).toHaveBeenCalledOnce();
          }
        } else {
          expect(result.error).toBe(
            `Unsupported reply bot platform: ${platform}`,
          );
          expect(postTwitterReply).not.toHaveBeenCalled();
          expect(mockInstagramService.postComment).not.toHaveBeenCalled();
          expect(mockYoutubeService.replyToComment).not.toHaveBeenCalled();
        }
      },
    );

    it('should route to Instagram when platform is instagram', async () => {
      const credential: IReplyBotCredentialData = {
        accessToken: 'encrypted-token',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: ReplyBotPlatform.INSTAGRAM,
      };
      const targetContent: IReplyBotContentData = {
        authorId: 'author-1',
        authorUsername: 'user1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'media-123',
        text: 'Original content',
      };
      mockInstagramService.postComment.mockResolvedValue({
        commentId: 'comment-1',
      });

      const result = await service.postReply(
        credential,
        targetContent,
        'Nice post!',
      );

      expect(result.success).toBe(true);
      expect(result.contentId).toBe('comment-1');
      expect(mockInstagramService.postComment).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'media-123',
        'Nice post!',
        undefined,
      );
    });

    it('should return error for Instagram when organizationId is missing', async () => {
      const credential: IReplyBotCredentialData = {
        accessToken: 'token',
        platform: ReplyBotPlatform.INSTAGRAM,
      };
      const targetContent: IReplyBotContentData = {
        authorId: 'author-1',
        authorUsername: 'user1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'media-123',
        text: 'Original content',
      };

      const result = await service.postReply(
        credential,
        targetContent,
        'reply',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('organizationId and brandId required');
    });

    it('should route to YouTube when platform is youtube', async () => {
      const credential: IReplyBotCredentialData = {
        accessToken: 'token',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: ReplyBotPlatform.YOUTUBE,
      };
      const targetContent: IReplyBotContentData = {
        authorId: 'author-1',
        authorUsername: 'viewer1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'comment-123',
        text: 'Original comment',
      };
      mockYoutubeService.replyToComment.mockResolvedValue({
        commentId: 'yt-reply-1',
      });

      const result = await service.postReply(
        credential,
        targetContent,
        'Thanks for watching!',
      );

      expect(result.success).toBe(true);
      expect(result.contentId).toBe('yt-reply-1');
      expect(mockYoutubeService.replyToComment).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'comment-123',
        'Thanks for watching!',
        undefined,
      );
    });

    it('should return error for YouTube when organizationId is missing', async () => {
      const credential: IReplyBotCredentialData = {
        accessToken: 'token',
        platform: ReplyBotPlatform.YOUTUBE,
      };
      const targetContent: IReplyBotContentData = {
        authorId: 'author-1',
        authorUsername: 'viewer1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'comment-123',
        text: 'Original comment',
      };

      const result = await service.postReply(
        credential,
        targetContent,
        'reply',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('organizationId and brandId required');
    });

    it('routes OAuth2 brand send through TwitterService.postTweet', async () => {
      mockTwitterService.postTweet.mockResolvedValue('tweet-99');
      const credential: IReplyBotCredentialData = {
        accessToken: 'oauth2-access',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: ReplyBotPlatform.TWITTER,
        refreshToken: 'oauth2-refresh',
        username: 'brandx',
      };

      const result = await service.postReply(
        credential,
        targetContent,
        'Thanks!',
      );

      expect(result).toEqual({
        contentId: 'tweet-99',
        contentUrl: 'https://x.com/user1/status/tweet-99',
        success: true,
      });
      expect(mockTwitterService.postTweet).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'Thanks!',
        'content-123',
        {},
        undefined,
      );
      expect(MockTwitterApi).not.toHaveBeenCalled();
    });

    it('never constructs OAuth1 from a refresh token', async () => {
      mockTweet.mockResolvedValue({ data: { id: 'tweet-fallback' } });
      const credential: IReplyBotCredentialData = {
        accessToken: 'oauth2-access',
        platform: ReplyBotPlatform.TWITTER,
        refreshToken: 'oauth2-refresh',
      };

      const result = await service.postReply(
        credential,
        targetContent,
        'Thanks!',
      );

      expect(result.success).toBe(true);
      expect(result.contentId).toBe('tweet-fallback');
      expect(mockTwitterService.postTweet).not.toHaveBeenCalled();
      expect(MockTwitterApi).toHaveBeenCalledWith('oauth2-access');
      expect(MockTwitterApi).not.toHaveBeenCalledWith(
        expect.objectContaining({ accessSecret: 'oauth2-refresh' }),
      );
    });

    it('keeps a real OAuth1 client when accessTokenSecret is present', async () => {
      mockTweet.mockResolvedValue({ data: { id: 'oauth1-tweet' } });
      const credential: IReplyBotCredentialData = {
        accessToken: 'oauth1-access',
        accessTokenSecret: 'oauth1-secret',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: ReplyBotPlatform.TWITTER,
        refreshToken: 'must-not-become-secret',
      };

      const result = await service.postReply(
        credential,
        targetContent,
        'Legacy reply',
      );

      expect(result.success).toBe(true);
      expect(result.contentId).toBe('oauth1-tweet');
      expect(mockTwitterService.postTweet).not.toHaveBeenCalled();
      expect(MockTwitterApi).toHaveBeenCalledWith(
        expect.objectContaining({
          accessSecret: 'oauth1-secret',
          accessToken: 'oauth1-access',
        }),
      );
      expect(MockTwitterApi).not.toHaveBeenCalledWith(
        expect.objectContaining({ accessSecret: 'must-not-become-secret' }),
      );
    });

    it('returns the provider error when OAuth2 send is rejected', async () => {
      mockTwitterService.postTweet.mockRejectedValue(
        new Error('401 Unauthorized'),
      );
      const credential: IReplyBotCredentialData = {
        accessToken: 'oauth2-access',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: ReplyBotPlatform.TWITTER,
        refreshToken: 'oauth2-refresh',
      };

      const result = await service.postReply(
        credential,
        targetContent,
        'Thanks!',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('401 Unauthorized');
      expect(result.contentId).toBeUndefined();
    });
  });

  describe('postTweet', () => {
    it('routes OAuth2 brand tweets through TwitterService.postTweet', async () => {
      mockTwitterService.postTweet.mockResolvedValue('orig-1');
      const credential: IReplyBotCredentialData = {
        accessToken: 'oauth2-access',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: ReplyBotPlatform.TWITTER,
        refreshToken: 'oauth2-refresh',
        username: 'brandx',
      };

      const result = await service.postTweet(credential, 'Hello X');

      expect(result).toEqual({
        contentId: 'orig-1',
        contentUrl: 'https://x.com/brandx/status/orig-1',
        success: true,
      });
      expect(mockTwitterService.postTweet).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'Hello X',
        undefined,
        {},
        undefined,
      );
      expect(MockTwitterApi).not.toHaveBeenCalled();
    });
  });

  describe('sendDm', () => {
    it.each([
      { isSupported: true, platform: ReplyBotPlatform.TWITTER },
      { isSupported: true, platform: ReplyBotPlatform.INSTAGRAM },
      { isSupported: false, platform: ReplyBotPlatform.TIKTOK },
      { isSupported: false, platform: ReplyBotPlatform.YOUTUBE },
      { isSupported: false, platform: ReplyBotPlatform.REDDIT },
      { isSupported: false, platform: 'unknown' },
    ])(
      'routes DM actions fail-closed for $platform',
      async ({ isSupported, platform }) => {
        const sendTwitterDm = vi
          .spyOn(
            service as unknown as BotActionExecutorRouting,
            'sendTwitterDm',
          )
          .mockResolvedValue({ success: true });
        mockInstagramService.sendCommentReplyDm.mockResolvedValue(undefined);
        const credential = {
          accessToken: 'token',
          brandId: 'brand-1',
          organizationId: 'org-1',
          platform,
        } as IReplyBotCredentialData;

        const result = await service.sendDm(
          credential,
          'recipient-1',
          'Hello!',
        );

        expect(result.success).toBe(isSupported);
        if (isSupported) {
          expect(result.error).toBeUndefined();
          if (platform === ReplyBotPlatform.TWITTER) {
            expect(sendTwitterDm).toHaveBeenCalledOnce();
          } else {
            expect(
              mockInstagramService.sendCommentReplyDm,
            ).toHaveBeenCalledOnce();
          }
        } else {
          expect(result.error).toBe(
            `Unsupported reply bot platform: ${platform}`,
          );
          expect(sendTwitterDm).not.toHaveBeenCalled();
          expect(
            mockInstagramService.sendCommentReplyDm,
          ).not.toHaveBeenCalled();
        }
      },
    );

    it('should route to Instagram DM when platform is instagram', async () => {
      const credential: IReplyBotCredentialData = {
        accessToken: 'token',
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: ReplyBotPlatform.INSTAGRAM,
      };
      mockInstagramService.sendCommentReplyDm.mockResolvedValue(undefined);

      const result = await service.sendDm(credential, 'recipient-1', 'Hello!');

      expect(result.success).toBe(true);
      expect(mockInstagramService.sendCommentReplyDm).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'recipient-1',
        'Hello!',
        undefined,
      );
    });

    it('should return error for Instagram DM when organizationId is missing', async () => {
      const credential: IReplyBotCredentialData = {
        accessToken: 'token',
        platform: ReplyBotPlatform.INSTAGRAM,
      };

      const result = await service.sendDm(credential, 'recipient-1', 'Hello!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('organizationId and brandId required');
    });
  });

  describe('validateCredential', () => {
    it('should return true for valid credential with accessTokenSecret', () => {
      const credential = { accessToken: 'token', accessTokenSecret: 'secret' };

      expect(service.validateCredential(credential)).toBe(true);
    });

    it('should return true for valid credential with refreshToken', () => {
      const credential = { accessToken: 'token', refreshToken: 'refresh' };

      expect(service.validateCredential(credential)).toBe(true);
    });

    it('should return true for OAuth2 bearer-only credential', () => {
      const credential = { accessToken: 'token' };

      expect(service.validateCredential(credential)).toBe(true);
    });

    it('should return false when accessToken is missing', () => {
      const credential = { accessTokenSecret: 'secret' };

      expect(service.validateCredential(credential)).toBe(false);
    });
  });
});
