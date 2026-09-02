const mockSendDm = vi.fn();

vi.mock('twitter-api-v2', () => {
  const MockTwitterApi = vi.fn(function TwitterApiMock() {
    return {
      v2: { sendDm: mockSendDm, sendDmInConversation: mockSendDm },
    };
  });
  return { TwitterApi: MockTwitterApi };
});

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => val) },
}));

import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { SERVER_TOKENS } from '@api/server.dependencies';
import {
  resolveTwitterReplySettings,
  TwitterService,
} from '@api/services/integrations/twitter/services/twitter.service';
import { TwitterResponseMapper } from '@api/services/integrations/twitter/services/twitter-response.mapper';
import { CredentialPlatform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { TwitterApi } from 'twitter-api-v2';

function makeTwitterCredential(
  overrides: Partial<CredentialDocument> = {},
): CredentialDocument {
  return {
    accessToken: 'access-token',
    id: 'cred-id',
    isConnected: true,
    isDeleted: false,
    refreshToken: 'refresh-token',
    userId: 'user-id',
    ...overrides,
  } as CredentialDocument;
}

describe('TwitterService', () => {
  let service: TwitterService;
  let credentialsResolveMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const credentialsMock = {
      findBrandAccounts: vi.fn(async () => {
        const credential = await credentialsMock.findOne();
        return credential ? [credential] : [];
      }),
      findOne: vi.fn().mockResolvedValue(null),
      // Multi-account resolution routes through `resolveBrandAccount`; the double
      // answers with whatever `findOne` is primed to return so the existing
      // single-account cases keep describing one connected account.
      resolveBrandAccount: vi.fn((options: { credentialId?: string | null }) =>
        credentialsMock.findOne(options),
      ),
    };
    credentialsResolveMock = credentialsMock.resolveBrandAccount;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterService,
        TwitterResponseMapper,
        { provide: SERVER_TOKENS.activities, useValue: {} },
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: SERVER_TOKENS.credentials,
          useValue: credentialsMock,
        },
        { provide: HttpService, useValue: { get: vi.fn(), post: vi.fn() } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<TwitterService>(TwitterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('resolves an explicit X credential within the requested brand', async () => {
    await expect(
      service.refreshToken('org-1', 'brand-1', 'credential-1'),
    ).rejects.toThrow('Twitter credential not found');

    expect(credentialsResolveMock).toHaveBeenCalledWith({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      isDisconnectedIncluded: true,
      organizationId: 'org-1',
      platform: CredentialPlatform.TWITTER,
    });
  });

  describe('resolveTwitterReplySettings', () => {
    it('maps the following policy to Twitter vocabulary', () => {
      expect(resolveTwitterReplySettings({ replyPolicy: 'following' })).toBe(
        'following',
      );
    });

    it('maps the mentioned policy to Twitter vocabulary', () => {
      expect(resolveTwitterReplySettings({ replyPolicy: 'mentioned' })).toBe(
        'mentionedUsers',
      );
    });

    it('omits the field for the everyone policy', () => {
      // Twitter expresses "everyone" by leaving `reply_settings` off; sending
      // the literal value rejects the whole tweet.
      expect(
        resolveTwitterReplySettings({ replyPolicy: 'everyone' }),
      ).toBeUndefined();
    });

    it('omits the field when no policy was chosen', () => {
      expect(resolveTwitterReplySettings({})).toBeUndefined();
    });
  });

  describe('getMediaAnalytics', () => {
    it('fetches metrics', async () => {
      const getMock = vi.fn().mockResolvedValue({
        data: [
          {
            public_metrics: {
              bookmark_count: 0,
              like_count: 2,
              quote_count: 0,
              reply_count: 1,
              retweet_count: 0,
              view_count: 7,
            },
          },
        ],
      });

      service.twitterClient = {
        v2: { get: getMock },
      } as unknown as TwitterApi;

      const res = await service.getMediaAnalytics('id');

      expect(getMock).toHaveBeenCalledWith('tweets', expect.any(Object));
      expect(res).toEqual(
        expect.objectContaining({ comments: 1, likes: 2, views: 7 }),
      );
    });
  });

  describe('getTrends', () => {
    it('fetches trending topics', async () => {
      vi.spyOn(service, 'refreshToken').mockResolvedValue(
        makeTwitterCredential(),
      );

      const trendsMock = vi
        .fn()
        .mockResolvedValue([
          { trends: [{ name: '#test', tweet_volume: 0, url: '' }] },
        ]);

      service.twitterClient = {
        v1: { trendsByPlace: trendsMock },
      } as unknown as TwitterApi;

      const res = await service.getTrends('o', 'a');

      expect(trendsMock).toHaveBeenCalledWith(1);
      expect(res).toEqual(
        expect.arrayContaining([expect.objectContaining({ topic: '#test' })]),
      );
    });
  });

  describe('sendCommentReplyDm', () => {
    it('sends a direct message to commenter', async () => {
      vi.spyOn(service, 'refreshToken').mockResolvedValue(
        makeTwitterCredential({
          accessToken: 'a',
          refreshToken: 'r',
        }),
      );

      mockSendDm.mockResolvedValue({});

      await service.sendCommentReplyDm('org', 'acc', 'user', 'hello');

      expect(mockSendDm).toHaveBeenCalledWith('user', {
        text: 'hello',
      });
    });
  });
});
