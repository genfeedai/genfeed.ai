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

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { mockModel } from '@api/helpers/mocks/model.mock';
import {
  resolveTwitterReplySettings,
  TwitterService,
} from '@api/services/integrations/twitter/services/twitter.service';
import { TwitterResponseMapper } from '@api/services/integrations/twitter/services/twitter-response.mapper';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';

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

  beforeEach(async () => {
    const credentialsMock = {
      findOne: vi.fn().mockResolvedValue(null),
      // Multi-account resolution routes through `resolveBrandAccount`; the double
      // answers with whatever `findOne` is primed to return so the existing
      // single-account cases keep describing one connected account.
      resolveBrandAccount: vi.fn((options: { credentialId?: string | null }) =>
        credentialsMock.findOne(options),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterService,
        TwitterResponseMapper,
        { provide: ActivitiesService, useValue: {} },
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: CredentialsService,
          useValue: credentialsMock,
        },
        { provide: HttpService, useValue: { get: vi.fn(), post: vi.fn() } },
        { provide: AnalyticsService, useValue: {} },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        { provide: PrismaService, useValue: mockModel },
      ],
    }).compile();

    service = module.get<TwitterService>(TwitterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

      service.twitterClient = { v2: { get: getMock } };

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
      };

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
