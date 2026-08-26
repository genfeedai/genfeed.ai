import { LoggerService } from '@libs/logger/logger.service';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { XAdsService } from './x-ads.service';
import { XAdsOAuthService } from './x-ads-oauth.service';

const oauthCredentials = {
  accessToken: 'access-token',
  accessTokenSecret: 'access-token-secret',
};

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

/**
 * Recorded from the public X Ads v12 analytics contract. Standard metrics are
 * time-series arrays, while web conversions are nested attribution objects.
 * Keeping the literal wire keys here protects the provider boundary without
 * requiring credentials or a network call.
 */
const recordedStatsMetrics = {
  billingAndEngagement: {
    billed_charge_local_micro: [2_000_000, null],
    billed_engagements: 3,
    clicks: [8, 2],
    impressions: [80, 20],
  },
  webConversion: {
    conversion_purchases: {
      assisted: [99],
      order_quantity: [4],
      post_engagement: 1,
      post_view: [2],
      sale_amount: [4_500_000],
    },
  },
} as const;

describe('XAdsService', () => {
  let adsClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
  };
  let oauthService: {
    createAdsClient: ReturnType<typeof vi.fn>;
  };
  let service: XAdsService;
  let now: number;

  beforeEach(() => {
    adsClient = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
    loggerService = { error: vi.fn() };
    oauthService = { createAdsClient: vi.fn(() => adsClient) };

    service = new XAdsService(
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
      adsClient.get
        .mockResolvedValueOnce({
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
        })
        .mockResolvedValueOnce({
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
        });

      const result = await service.getAdAccounts(oauthCredentials);

      expect(result.map(({ id }) => id)).toEqual(['account-1', 'account-2']);
      expect(oauthService.createAdsClient).toHaveBeenCalledWith(
        oauthCredentials,
      );
      expect(adsClient.get).toHaveBeenNthCalledWith(
        2,
        'accounts',
        { cursor: 'account-cursor' },
        { timeout: 15_000 },
      );
    });

    it('collects every funding-instrument page using next_cursor', async () => {
      adsClient.get
        .mockResolvedValueOnce({
          data: [
            {
              currency: 'USD',
              entity_status: 'ACTIVE',
              id: 'fi-1',
              type: 'CREDIT_CARD',
            },
          ],
          next_cursor: 'funding-cursor',
        })
        .mockResolvedValueOnce({
          data: [
            {
              currency: 'USD',
              entity_status: 'PAUSED',
              id: 'fi-2',
              type: 'CREDIT_CARD',
            },
          ],
          next_cursor: null,
        });

      const result = await service.getFundingInstruments(
        oauthCredentials,
        'account-1',
      );

      expect(result.map(({ id }) => id)).toEqual(['fi-1', 'fi-2']);
      expect(adsClient.get).toHaveBeenNthCalledWith(
        2,
        'accounts/account-1/funding_instruments',
        { cursor: 'funding-cursor' },
        { timeout: 15_000 },
      );
    });

    it('collects every campaign page using next_cursor', async () => {
      adsClient.get
        .mockResolvedValueOnce({
          data: [campaignWire('campaign-1')],
          next_cursor: 'campaign-cursor',
        })
        .mockResolvedValueOnce({
          data: [campaignWire('campaign-2')],
          next_cursor: null,
        });

      const result = await service.listCampaigns(oauthCredentials, 'account-1');

      expect(result.map(({ id }) => id)).toEqual(['campaign-1', 'campaign-2']);
      expect(adsClient.get).toHaveBeenNthCalledWith(
        2,
        'accounts/account-1/campaigns',
        { cursor: 'campaign-cursor' },
        { timeout: 15_000 },
      );
    });

    it('preserves line-item filters while following next_cursor', async () => {
      adsClient.get
        .mockResolvedValueOnce({
          data: [lineItemWire('line-item-1')],
          next_cursor: 'line-item-cursor',
        })
        .mockResolvedValueOnce({
          data: [lineItemWire('line-item-2')],
          next_cursor: null,
        });

      const result = await service.listLineItems(
        oauthCredentials,
        'account-1',
        'campaign-1',
      );

      expect(result.map(({ id }) => id)).toEqual([
        'line-item-1',
        'line-item-2',
      ]);
      expect(adsClient.get).toHaveBeenNthCalledWith(
        2,
        'accounts/account-1/line_items',
        { campaign_ids: 'campaign-1', cursor: 'line-item-cursor' },
        { timeout: 15_000 },
      );
    });

    it('preserves promoted-tweet filters while following next_cursor', async () => {
      adsClient.get
        .mockResolvedValueOnce({
          data: [promotedTweetWire('promoted-1')],
          next_cursor: 'promoted-cursor',
        })
        .mockResolvedValueOnce({
          data: [promotedTweetWire('promoted-2')],
          next_cursor: null,
        });

      const result = await service.listPromotedTweets(
        oauthCredentials,
        'account-1',
        'line-item-1',
      );

      expect(result.map(({ id }) => id)).toEqual(['promoted-1', 'promoted-2']);
      expect(adsClient.get).toHaveBeenNthCalledWith(
        2,
        'accounts/account-1/promoted_tweets',
        { cursor: 'promoted-cursor', line_item_ids: 'line-item-1' },
        { timeout: 15_000 },
      );
    });

    it('collects published Tweets for the account promotable user', async () => {
      adsClient.get
        .mockResolvedValueOnce({
          data: [{ id_str: 'tweet-1' }],
          next_cursor: 'tweet-cursor',
        })
        .mockResolvedValueOnce({
          data: [{ id_str: 'tweet-2' }],
          next_cursor: null,
        });

      const result = await service.listPublishedTweets(
        oauthCredentials,
        'account-1',
        ['tweet-1', 'tweet-2'],
      );

      expect(result).toEqual([{ id: 'tweet-1' }, { id: 'tweet-2' }]);
      expect(adsClient.get).toHaveBeenNthCalledWith(
        2,
        'accounts/account-1/tweets',
        {
          cursor: 'tweet-cursor',
          timeline_type: 'ALL',
          trim_user: 'true',
          tweet_ids: 'tweet-1,tweet-2',
          tweet_type: 'PUBLISHED',
        },
        { timeout: 15_000 },
      );
    });
  });

  describe('write wire contracts', () => {
    it('sends campaign writes as query parameters without a JSON body', async () => {
      adsClient.post.mockResolvedValue({ data: campaignWire('campaign-1') });

      await service.createCampaign(oauthCredentials, 'account-1', {
        dailyBudgetAmountLocalMicro: 5_000_000,
        entityStatus: 'PAUSED',
        fundingInstrumentId: 'fi-1',
        name: 'Campaign one',
      });

      expect(adsClient.post).toHaveBeenCalledWith(
        'accounts/account-1/campaigns',
        undefined,
        {
          query: {
            daily_budget_amount_local_micro: '5000000',
            entity_status: 'PAUSED',
            funding_instrument_id: 'fi-1',
            name: 'Campaign one',
          },
          timeout: 15_000,
        },
      );
    });

    it('sends campaign updates as query parameters without a JSON body', async () => {
      adsClient.put.mockResolvedValue({ data: campaignWire('campaign-1') });

      await service.updateCampaign(
        oauthCredentials,
        'account-1',
        'campaign-1',
        {
          entityStatus: 'PAUSED',
          name: 'Renamed campaign',
        },
      );

      expect(adsClient.put).toHaveBeenCalledWith(
        'accounts/account-1/campaigns/campaign-1',
        undefined,
        {
          query: {
            entity_status: 'PAUSED',
            name: 'Renamed campaign',
          },
          timeout: 15_000,
        },
      );
    });

    it('sends line-item arrays and daily budget in the documented query shape', async () => {
      adsClient.post.mockResolvedValue({ data: lineItemWire('line-item-1') });

      await service.createLineItem(oauthCredentials, 'account-1', {
        campaignId: 'campaign-1',
        dailyBudgetAmountLocalMicro: 5_000_000,
        entityStatus: 'PAUSED',
        name: 'Line item one',
        objective: 'ENGAGEMENTS',
        placements: ['ALL_ON_TWITTER', 'TWITTER_PROFILE'],
        productType: 'PROMOTED_TWEETS',
      });

      expect(adsClient.post).toHaveBeenCalledWith(
        'accounts/account-1/line_items',
        undefined,
        expect.objectContaining({
          query: expect.objectContaining({
            daily_budget_amount_local_micro: '5000000',
            placements: 'ALL_ON_TWITTER,TWITTER_PROFILE',
          }),
        }),
      );
    });

    it('rejects targeting criteria that the line-item endpoint cannot encode', async () => {
      await expect(
        service.createLineItem(oauthCredentials, 'account-1', {
          campaignId: 'campaign-1',
          entityStatus: 'PAUSED',
          name: 'Line item one',
          objective: 'ENGAGEMENTS',
          productType: 'PROMOTED_TWEETS',
          targeting: { countries: ['US'] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(adsClient.post).not.toHaveBeenCalled();
    });

    it('selects the first promoted tweet from the batch response', async () => {
      adsClient.post.mockResolvedValue({
        data: [
          promotedTweetWire('promoted-1'),
          promotedTweetWire('promoted-2'),
        ],
      });

      const result = await service.createPromotedTweet(
        oauthCredentials,
        'account-1',
        { lineItemId: 'line-item-1', tweetId: 'tweet-1' },
      );

      expect(result.id).toBe('promoted-1');
      expect(adsClient.post).toHaveBeenCalledWith(
        'accounts/account-1/promoted_tweets',
        undefined,
        expect.objectContaining({
          query: {
            line_item_id: 'line-item-1',
            tweet_ids: 'tweet-1',
          },
        }),
      );
    });

    it('fails when X returns an empty promoted-tweet batch', async () => {
      adsClient.post.mockResolvedValue({ data: [] });

      await expect(
        service.createPromotedTweet(oauthCredentials, 'account-1', {
          lineItemId: 'line-item-1',
          tweetId: 'tweet-1',
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('reporting', () => {
    it('chunks at 20 IDs and requests every current placement and required metric group', async () => {
      const entityIds = Array.from({ length: 21 }, (_, index) => `pt-${index}`);
      adsClient.get.mockImplementation((_url, requestParams) => {
        const requestedIds = requestParams.entity_ids.split(',');
        const shouldReturnRows =
          requestParams.metric_groups === 'ENGAGEMENT,BILLING' &&
          requestParams.placement === 'ALL_ON_TWITTER';

        return Promise.resolve({
          data: shouldReturnRows
            ? [
                {
                  id: requestedIds[0],
                  id_data: [{ metrics: { clicks: [2], impressions: [20] } }],
                },
              ]
            : [],
        });
      });

      const result = await service.getPromotedTweetStats(
        oauthCredentials,
        'account-1',
        entityIds,
        { endDate: '2026-08-23', startDate: '2026-08-16' },
      );

      expect(result.map(({ id }) => id)).toEqual(['pt-0', 'pt-20']);
      expect(adsClient.get).toHaveBeenCalledTimes(12);

      const requests = adsClient.get.mock.calls.map(
        (call) => call[1] as Record<string, string>,
      );
      expect(
        requests.every(({ entity_ids: ids }) => ids.split(',').length <= 20),
      ).toBe(true);
      expect(new Set(requests.map(({ placement }) => placement))).toEqual(
        new Set(['ALL_ON_TWITTER', 'SPOTLIGHT', 'TREND']),
      );
      expect(
        new Set(requests.map(({ metric_groups: groups }) => groups)),
      ).toEqual(new Set(['ENGAGEMENT,BILLING', 'WEB_CONVERSION']));
      expect(
        requests.every(
          ({ end_time: endTime, start_time: startTime }) =>
            endTime === '2026-08-23T00:00:00Z' &&
            startTime === '2026-08-16T00:00:00Z',
        ),
      ).toBe(true);
    });

    it('maps the recorded conversion object and sums all three placement responses', async () => {
      adsClient.get.mockImplementation((_url, requestParams) => {
        const isConversion = requestParams.metric_groups === 'WEB_CONVERSION';
        const isAllOnX = requestParams.placement === 'ALL_ON_TWITTER';
        const isTrend = requestParams.placement === 'TREND';
        const metrics = isConversion
          ? isAllOnX
            ? recordedStatsMetrics.webConversion
            : isTrend
              ? {
                  conversion_purchases: {
                    post_engagement: [1],
                    post_view: null,
                    sale_amount: 500_000,
                  },
                }
              : { conversion_purchases: null }
          : isAllOnX
            ? recordedStatsMetrics.billingAndEngagement
            : isTrend
              ? {
                  billed_charge_local_micro: 500_000,
                  billed_engagements: null,
                  clicks: null,
                  impressions: 20,
                }
              : {};

        return Promise.resolve({
          data: [{ id: 'pt-1', id_data: [{ metrics }] }],
        });
      });

      const result = await service.getPromotedTweetStats(
        oauthCredentials,
        'account-1',
        ['pt-1'],
        { endDate: '2026-08-23', startDate: '2026-08-16' },
      );

      expect(result).toEqual([
        {
          endTime: '2026-08-23T00:00:00Z',
          id: 'pt-1',
          metrics: {
            billedCharge: 2.5,
            billedEngagements: 3,
            clicks: 10,
            conversionValue: 5,
            conversions: 4,
            impressions: 120,
          },
          startTime: '2026-08-16T00:00:00Z',
        },
      ]);
    });

    it('splits the default 30-day range into contiguous end-exclusive windows', async () => {
      adsClient.get.mockResolvedValue({ data: [] });

      await service.getCampaignStats(
        oauthCredentials,
        'account-1',
        ['campaign-1'],
        { endDate: '2026-08-31', startDate: '2026-08-01' },
      );

      expect(adsClient.get).toHaveBeenCalledTimes(30);
      const windows = new Set(
        adsClient.get.mock.calls.map((call) => {
          const requestParams = call[1] as Record<string, string>;
          return `${requestParams.start_time}/${requestParams.end_time}`;
        }),
      );
      expect(windows).toEqual(
        new Set([
          '2026-08-01T00:00:00Z/2026-08-08T00:00:00Z',
          '2026-08-08T00:00:00Z/2026-08-15T00:00:00Z',
          '2026-08-15T00:00:00Z/2026-08-22T00:00:00Z',
          '2026-08-22T00:00:00Z/2026-08-29T00:00:00Z',
          '2026-08-29T00:00:00Z/2026-08-31T00:00:00Z',
        ]),
      );
    });

    it('rejects reporting boundaries that are not whole hours', async () => {
      await expect(
        service.getCampaignStats(
          oauthCredentials,
          'account-1',
          ['campaign-1'],
          {
            endDate: '2026-08-23T00:30:00Z',
            startDate: '2026-08-01T00:00:00Z',
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(adsClient.get).not.toHaveBeenCalled();
    });

    it('does not call X when there are no entity IDs', async () => {
      await expect(
        service.getCampaignStats(oauthCredentials, 'account-1', [], {
          endDate: '2026-08-23',
          startDate: '2026-08-01',
        }),
      ).resolves.toEqual([]);
      expect(adsClient.get).not.toHaveBeenCalled();
    });
  });

  describe('error semantics', () => {
    it.each([{ data: null }, { request: {} }])(
      'uses BadGatewayException for malformed provider envelopes',
      async (envelope) => {
        adsClient.get.mockResolvedValue(envelope);

        await expect(
          service.listCampaigns(oauthCredentials, 'account-1'),
        ).rejects.toBeInstanceOf(BadGatewayException);
      },
    );

    it('logs sanitized provider metadata without OAuth credentials or response bodies', async () => {
      adsClient.get.mockRejectedValue(
        new Error('access-token access-token-secret provider-body'),
      );

      await expect(
        service.getAdAccounts(oauthCredentials),
      ).rejects.toBeInstanceOf(Error);

      expect(loggerService.error).toHaveBeenCalledWith(expect.any(String), {
        name: 'Error',
      });
      expect(JSON.stringify(loggerService.error.mock.calls)).not.toContain(
        'access-token-secret',
      );
    });
  });

  it('serializes concurrent rate-limit reservations', async () => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000));
    adsClient.get.mockResolvedValue({ data: [campaignWire('campaign-1')] });

    const requests = [
      service.listCampaigns(oauthCredentials, 'account-1'),
      service.listCampaigns(oauthCredentials, 'account-1'),
      service.listCampaigns(oauthCredentials, 'account-1'),
    ];

    await vi.advanceTimersByTimeAsync(0);
    expect(adsClient.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(249);
    expect(adsClient.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(adsClient.get).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(250);
    expect(adsClient.get).toHaveBeenCalledTimes(3);
    await Promise.all(requests);
  });
});
