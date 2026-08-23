import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { XAdsOAuthService } from '@api/services/integrations/x-ads/services/x-ads-oauth.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { XAdsService } from './x-ads.service';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn(() => 'decrypted-refresh-token') },
}));

const axiosResponse = <T>(data: T) =>
  of({
    config: {} as never,
    data,
    headers: {},
    status: 200,
    statusText: 'OK',
  });

const campaignWire = (id: string) => ({
  created_at: '2026-08-01T00:00:00Z',
  entity_status: 'PAUSED' as const,
  funding_instrument_id: 'fi-1',
  id,
  name: `Campaign ${id}`,
  updated_at: '2026-08-01T00:00:00Z',
});

const lineItemWire = (id: string) => ({
  campaign_id: 'campaign-1',
  daily_budget_amount_local_micro: 5_000_000,
  entity_status: 'PAUSED' as const,
  id,
  name: `Line item ${id}`,
  objective: 'ENGAGEMENTS',
  product_type: 'PROMOTED_TWEETS',
});

const promotedTweetWire = (id: string) => ({
  approval_status: 'ACCEPTED',
  entity_status: 'PAUSED' as const,
  id,
  line_item_id: 'line-item-1',
  tweet_id: `tweet-${id}`,
});

describe('XAdsService', () => {
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
  };
  let oauthService: {
    refreshAccessToken: ReturnType<typeof vi.fn>;
  };
  let service: XAdsService;
  let now: number;

  beforeEach(() => {
    credentialsService = { findOne: vi.fn(), patch: vi.fn() };
    httpService = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
    loggerService = { error: vi.fn() };
    oauthService = { refreshAccessToken: vi.fn() };

    service = new XAdsService(
      credentialsService as unknown as CredentialsService,
      httpService as unknown as HttpService,
      loggerService as unknown as LoggerService,
      oauthService as unknown as XAdsOAuthService,
    );

    now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 250;
      return now;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('pagination', () => {
    it('collects every ad-account page using next_cursor', async () => {
      httpService.get
        .mockReturnValueOnce(
          axiosResponse({
            data: [
              {
                approval_status: 'ACCEPTED',
                currency: 'USD',
                id: 'account-1',
                name: 'Account one',
                timezone: 'UTC',
              },
            ],
            next_cursor: 'account-cursor',
          }),
        )
        .mockReturnValueOnce(
          axiosResponse({
            data: [
              {
                approval_status: 'ACCEPTED',
                currency: 'EUR',
                id: 'account-2',
                name: 'Account two',
                timezone: 'Europe/Malta',
              },
            ],
            next_cursor: null,
          }),
        );

      const result = await service.getAdAccounts('access-token');

      expect(result.map(({ id }) => id)).toEqual(['account-1', 'account-2']);
      expect(httpService.get).toHaveBeenNthCalledWith(
        2,
        'https://ads-api.x.com/12/accounts',
        expect.objectContaining({ params: { cursor: 'account-cursor' } }),
      );
    });

    it('collects every funding-instrument page using next_cursor', async () => {
      httpService.get
        .mockReturnValueOnce(
          axiosResponse({
            data: [
              {
                currency: 'USD',
                entity_status: 'ACTIVE',
                id: 'fi-1',
                type: 'CREDIT_CARD',
              },
            ],
            next_cursor: 'funding-cursor',
          }),
        )
        .mockReturnValueOnce(
          axiosResponse({
            data: [
              {
                currency: 'USD',
                entity_status: 'PAUSED',
                id: 'fi-2',
                type: 'CREDIT_CARD',
              },
            ],
            next_cursor: null,
          }),
        );

      const result = await service.getFundingInstruments(
        'access-token',
        'account-1',
      );

      expect(result.map(({ id }) => id)).toEqual(['fi-1', 'fi-2']);
      expect(httpService.get).toHaveBeenNthCalledWith(
        2,
        'https://ads-api.x.com/12/accounts/account-1/funding_instruments',
        expect.objectContaining({ params: { cursor: 'funding-cursor' } }),
      );
    });

    it('collects every campaign page using next_cursor', async () => {
      httpService.get
        .mockReturnValueOnce(
          axiosResponse({
            data: [campaignWire('campaign-1')],
            next_cursor: 'campaign-cursor',
          }),
        )
        .mockReturnValueOnce(
          axiosResponse({
            data: [campaignWire('campaign-2')],
            next_cursor: null,
          }),
        );

      const result = await service.listCampaigns('access-token', 'account-1');

      expect(result.map(({ id }) => id)).toEqual(['campaign-1', 'campaign-2']);
      expect(httpService.get).toHaveBeenNthCalledWith(
        2,
        'https://ads-api.x.com/12/accounts/account-1/campaigns',
        expect.objectContaining({ params: { cursor: 'campaign-cursor' } }),
      );
    });

    it('preserves line-item filters while following next_cursor', async () => {
      httpService.get
        .mockReturnValueOnce(
          axiosResponse({
            data: [lineItemWire('line-item-1')],
            next_cursor: 'line-item-cursor',
          }),
        )
        .mockReturnValueOnce(
          axiosResponse({
            data: [lineItemWire('line-item-2')],
            next_cursor: null,
          }),
        );

      const result = await service.listLineItems(
        'access-token',
        'account-1',
        'campaign-1',
      );

      expect(result.map(({ id }) => id)).toEqual([
        'line-item-1',
        'line-item-2',
      ]);
      expect(httpService.get).toHaveBeenNthCalledWith(
        2,
        'https://ads-api.x.com/12/accounts/account-1/line_items',
        expect.objectContaining({
          params: {
            campaign_ids: 'campaign-1',
            cursor: 'line-item-cursor',
          },
        }),
      );
    });

    it('preserves promoted-tweet filters while following next_cursor', async () => {
      httpService.get
        .mockReturnValueOnce(
          axiosResponse({
            data: [promotedTweetWire('promoted-1')],
            next_cursor: 'promoted-cursor',
          }),
        )
        .mockReturnValueOnce(
          axiosResponse({
            data: [promotedTweetWire('promoted-2')],
            next_cursor: null,
          }),
        );

      const result = await service.listPromotedTweets(
        'access-token',
        'account-1',
        'line-item-1',
      );

      expect(result.map(({ id }) => id)).toEqual(['promoted-1', 'promoted-2']);
      expect(httpService.get).toHaveBeenNthCalledWith(
        2,
        'https://ads-api.x.com/12/accounts/account-1/promoted_tweets',
        expect.objectContaining({
          params: {
            cursor: 'promoted-cursor',
            line_item_ids: 'line-item-1',
          },
        }),
      );
    });

    it('collects published Tweets for the account promotable user', async () => {
      httpService.get
        .mockReturnValueOnce(
          axiosResponse({
            data: [{ id_str: 'tweet-1' }],
            next_cursor: 'tweet-cursor',
          }),
        )
        .mockReturnValueOnce(
          axiosResponse({
            data: [{ id_str: 'tweet-2' }],
            next_cursor: null,
          }),
        );

      const result = await service.listPublishedTweets(
        'access-token',
        'account-1',
        ['tweet-1', 'tweet-2'],
      );

      expect(result).toEqual([{ id: 'tweet-1' }, { id: 'tweet-2' }]);
      expect(httpService.get).toHaveBeenNthCalledWith(
        2,
        'https://ads-api.x.com/12/accounts/account-1/tweets',
        expect.objectContaining({
          params: {
            cursor: 'tweet-cursor',
            timeline_type: 'ALL',
            trim_user: true,
            tweet_ids: 'tweet-1,tweet-2',
            tweet_type: 'PUBLISHED',
          },
        }),
      );
    });
  });

  describe('write wire contracts', () => {
    it('sends campaign writes as query parameters without a JSON body', async () => {
      httpService.post.mockReturnValue(
        axiosResponse({ data: campaignWire('campaign-1') }),
      );

      await service.createCampaign('access-token', 'account-1', {
        dailyBudgetAmountLocalMicro: 5_000_000,
        entityStatus: 'PAUSED',
        fundingInstrumentId: 'fi-1',
        name: 'Campaign one',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        'https://ads-api.x.com/12/accounts/account-1/campaigns',
        undefined,
        {
          headers: { Authorization: 'Bearer access-token' },
          params: {
            daily_budget_amount_local_micro: 5_000_000,
            entity_status: 'PAUSED',
            funding_instrument_id: 'fi-1',
            name: 'Campaign one',
          },
          timeout: 15_000,
        },
      );
    });

    it('sends campaign updates as query parameters without a JSON body', async () => {
      httpService.put.mockReturnValue(
        axiosResponse({ data: campaignWire('campaign-1') }),
      );

      await service.updateCampaign('access-token', 'account-1', 'campaign-1', {
        entityStatus: 'PAUSED',
        name: 'Renamed campaign',
      });

      expect(httpService.put).toHaveBeenCalledWith(
        'https://ads-api.x.com/12/accounts/account-1/campaigns/campaign-1',
        undefined,
        {
          headers: { Authorization: 'Bearer access-token' },
          params: {
            entity_status: 'PAUSED',
            name: 'Renamed campaign',
          },
          timeout: 15_000,
        },
      );
    });

    it('sends line-item arrays and daily budget in the documented query shape', async () => {
      httpService.post.mockReturnValue(
        axiosResponse({ data: lineItemWire('line-item-1') }),
      );

      await service.createLineItem('access-token', 'account-1', {
        campaignId: 'campaign-1',
        dailyBudgetAmountLocalMicro: 5_000_000,
        entityStatus: 'PAUSED',
        name: 'Line item one',
        objective: 'ENGAGEMENTS',
        placements: ['ALL_ON_TWITTER', 'TWITTER_PROFILE'],
        productType: 'PROMOTED_TWEETS',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        'https://ads-api.x.com/12/accounts/account-1/line_items',
        undefined,
        expect.objectContaining({
          headers: { Authorization: 'Bearer access-token' },
          params: expect.objectContaining({
            daily_budget_amount_local_micro: 5_000_000,
            placements: 'ALL_ON_TWITTER,TWITTER_PROFILE',
          }),
        }),
      );
    });

    it('rejects targeting criteria that the line-item endpoint cannot encode', async () => {
      await expect(
        service.createLineItem('access-token', 'account-1', {
          campaignId: 'campaign-1',
          entityStatus: 'PAUSED',
          name: 'Line item one',
          objective: 'ENGAGEMENTS',
          productType: 'PROMOTED_TWEETS',
          targeting: { countries: ['US'] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('selects the first promoted tweet from the batch response', async () => {
      httpService.post.mockReturnValue(
        axiosResponse({
          data: [
            promotedTweetWire('promoted-1'),
            promotedTweetWire('promoted-2'),
          ],
        }),
      );

      const result = await service.createPromotedTweet(
        'access-token',
        'account-1',
        { lineItemId: 'line-item-1', tweetId: 'tweet-1' },
      );

      expect(result.id).toBe('promoted-1');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://ads-api.x.com/12/accounts/account-1/promoted_tweets',
        undefined,
        expect.objectContaining({
          headers: { Authorization: 'Bearer access-token' },
          params: {
            line_item_id: 'line-item-1',
            tweet_ids: 'tweet-1',
          },
        }),
      );
    });

    it('fails when X returns an empty promoted-tweet batch', async () => {
      httpService.post.mockReturnValue(axiosResponse({ data: [] }));

      await expect(
        service.createPromotedTweet('access-token', 'account-1', {
          lineItemId: 'line-item-1',
          tweetId: 'tweet-1',
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('reporting', () => {
    it('chunks stats entity IDs at 200 and combines every response', async () => {
      const entityIds = Array.from(
        { length: 201 },
        (_, index) => `pt-${index}`,
      );
      httpService.get
        .mockReturnValueOnce(
          axiosResponse({
            data: [
              {
                id: 'pt-0',
                id_data: [{ metrics: { clicks: [2], impressions: [20] } }],
              },
            ],
          }),
        )
        .mockReturnValueOnce(
          axiosResponse({
            data: [
              {
                id: 'pt-200',
                id_data: [{ metrics: { clicks: [4], impressions: [40] } }],
              },
            ],
          }),
        );

      const result = await service.getPromotedTweetStats(
        'access-token',
        'account-1',
        entityIds,
        { endDate: '2026-08-23', startDate: '2026-08-01' },
      );

      expect(result.map(({ id }) => id)).toEqual(['pt-0', 'pt-200']);
      const firstParams = httpService.get.mock.calls[0]?.[1]?.params as Record<
        string,
        string
      >;
      const secondParams = httpService.get.mock.calls[1]?.[1]?.params as Record<
        string,
        string
      >;
      expect(firstParams.entity_ids.split(',')).toHaveLength(200);
      expect(secondParams.entity_ids).toBe('pt-200');
    });

    it('does not call X when there are no entity IDs', async () => {
      await expect(
        service.getCampaignStats('access-token', 'account-1', [], {
          endDate: '2026-08-23',
          startDate: '2026-08-01',
        }),
      ).resolves.toEqual([]);
      expect(httpService.get).not.toHaveBeenCalled();
    });
  });

  describe('error semantics', () => {
    it('refreshes an active scoped credential and persists its granted scopes', async () => {
      credentialsService.findOne.mockResolvedValue({
        id: 'credential-1',
        refreshToken: 'encrypted-refresh-token',
      });
      credentialsService.patch.mockResolvedValue({ id: 'credential-1' });
      oauthService.refreshAccessToken.mockResolvedValue({
        accessToken: 'new-access-token',
        expiresIn: 3_600,
        refreshToken: 'new-refresh-token',
        scope: 'offline.access ads.write ads.read',
      });

      await service.refreshToken('organization-1', 'brand-1');

      expect(oauthService.refreshAccessToken).toHaveBeenCalledWith(
        'decrypted-refresh-token',
      );
      expect(credentialsService.patch).toHaveBeenCalledWith(
        'credential-1',
        expect.objectContaining({
          accessToken: 'new-access-token',
          grantedScopes: ['ads.read', 'ads.write', 'offline.access'],
          isConnected: true,
          isDeleted: false,
          refreshToken: 'new-refresh-token',
        }),
      );
    });

    it('uses NotFoundException when no scoped X Ads credential exists', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      await expect(
        service.refreshToken('organization-1', 'brand-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(credentialsService.findOne).toHaveBeenCalledWith({
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'organization-1',
        platform: 'x_ads',
      });
    });

    it('uses BadRequestException when the credential cannot be refreshed', async () => {
      credentialsService.findOne.mockResolvedValue({
        id: 'credential-1',
        refreshToken: null,
      });

      await expect(
        service.refreshToken('organization-1', 'brand-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uses BadGatewayException for malformed provider envelopes', async () => {
      httpService.get.mockReturnValue(axiosResponse({ request: {} }));

      await expect(
        service.listCampaigns('access-token', 'account-1'),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  it('serializes concurrent rate-limit reservations', async () => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000));
    httpService.get.mockReturnValue(
      axiosResponse({ data: [campaignWire('campaign-1')] }),
    );

    const requests = [
      service.listCampaigns('access-token', 'account-1'),
      service.listCampaigns('access-token', 'account-1'),
      service.listCampaigns('access-token', 'account-1'),
    ];

    await vi.advanceTimersByTimeAsync(0);
    expect(httpService.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(249);
    expect(httpService.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(httpService.get).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(250);
    expect(httpService.get).toHaveBeenCalledTimes(3);
    await Promise.all(requests);
  });
});
