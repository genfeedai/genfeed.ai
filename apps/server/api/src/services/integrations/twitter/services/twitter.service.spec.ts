const mockSendDm = vi.fn();

vi.mock('twitter-api-v2', () => {
  const MockTwitterApi = vi.fn(function () {
    return {
      v2: { sendDm: mockSendDm, sendDmInConversation: mockSendDm },
    };
  });
  return { TwitterApi: MockTwitterApi };
});

import { Activity } from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { Analytic } from '@api/endpoints/analytics/schemas/analytic.schema';
import { mockModel } from '@api/helpers/mocks/model.mock';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('TwitterService', () => {
  let service: TwitterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterService,
        { provide: ActivitiesService, useValue: {} },
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: CredentialsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
            saveCredentials: vi.fn(),
          },
        },
        { provide: HttpService, useValue: { get: vi.fn(), post: vi.fn() } },
        { provide: AnalyticsService, useValue: {} },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        { provide: getModelToken(Activity.name), useValue: mockModel },
        { provide: getModelToken(Analytic.name), useValue: mockModel },
      ],
    }).compile();

    service = module.get<TwitterService>(TwitterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
      vi.spyOn(service, 'refreshToken').mockResolvedValue(undefined);

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
      vi.spyOn(service, 'refreshToken').mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
      });

      mockSendDm.mockResolvedValue({});

      // Mock EncryptionUtil.decrypt for the access token decryption
      vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
        EncryptionUtil: { decrypt: vi.fn((val: string) => val) },
      }));

      await service.sendCommentReplyDm('org', 'acc', 'user', 'hello');

      expect(mockSendDm).toHaveBeenCalledWith('user', {
        text: 'hello',
      });
    });
  });
});
