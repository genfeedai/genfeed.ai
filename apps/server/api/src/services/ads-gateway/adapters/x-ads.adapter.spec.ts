import { XAdsAdapter } from '@api/services/ads-gateway/adapters/x-ads.adapter';
import { INVALID_CAMPAIGN_STATUS_MESSAGE } from '@api/services/ads-gateway/ads-campaign-status.util';
import { XAdsService } from '@api/services/integrations/x-ads/services/x-ads.service';
import type { AdsAdapterContext } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('XAdsAdapter', () => {
  let adapter: XAdsAdapter;
  let xAdsService: {
    createCampaign: ReturnType<typeof vi.fn>;
    createLineItem: ReturnType<typeof vi.fn>;
    getAdAccounts: ReturnType<typeof vi.fn>;
    getCampaignStats: ReturnType<typeof vi.fn>;
    getFundingInstruments: ReturnType<typeof vi.fn>;
    getLineItemStats: ReturnType<typeof vi.fn>;
    getPromotedTweetStats: ReturnType<typeof vi.fn>;
    listCampaigns: ReturnType<typeof vi.fn>;
    listLineItems: ReturnType<typeof vi.fn>;
    listPromotedTweets: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockCtx: AdsAdapterContext = {
    accessToken: 'x-token',
    accessTokenSecret: 'x-token-secret',
    adAccountId: 'acct-123',
    credentialId: 'cred-1',
    organizationId: 'org-1',
  };
  const oauthCredentials = {
    accessToken: 'x-token',
    accessTokenSecret: 'x-token-secret',
  };

  beforeEach(async () => {
    xAdsService = {
      createCampaign: vi.fn(),
      createLineItem: vi.fn(),
      getAdAccounts: vi.fn(),
      getCampaignStats: vi.fn(),
      getFundingInstruments: vi.fn(),
      getLineItemStats: vi.fn(),
      getPromotedTweetStats: vi.fn(),
      listCampaigns: vi.fn(),
      listLineItems: vi.fn(),
      listPromotedTweets: vi.fn(),
      updateCampaign: vi.fn(),
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    xAdsService.getFundingInstruments.mockResolvedValue([
      {
        currency: 'USD',
        entityStatus: 'ACTIVE',
        id: 'fi-1',
        type: 'CREDIT_CARD',
      },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XAdsAdapter,
        { provide: XAdsService, useValue: xAdsService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    adapter = module.get(XAdsAdapter);
  });

  it('should be defined with platform=x', () => {
    expect(adapter).toBeDefined();
    expect(adapter.platform).toBe('x');
  });

  describe('getAdAccounts', () => {
    it('should map X Ads accounts to unified format', async () => {
      xAdsService.getAdAccounts.mockResolvedValue([
        {
          approvalStatus: 'ACCEPTED',
          currency: 'USD',
          id: 'act-1',
          name: 'Test Account',
          timezone: 'UTC',
        },
      ]);

      const result = await adapter.getAdAccounts(mockCtx);

      expect(result).toEqual([
        {
          currency: 'USD',
          id: 'act-1',
          name: 'Test Account',
          platform: 'x',
          status: 'ACCEPTED',
          timezone: 'UTC',
        },
      ]);
      expect(xAdsService.getAdAccounts).toHaveBeenCalledWith(oauthCredentials);
    });

    it('fails closed before provider traffic when the OAuth token secret is missing', async () => {
      await expect(
        adapter.getAdAccounts({ ...mockCtx, accessTokenSecret: undefined }),
      ).rejects.toThrow(BadRequestException);

      expect(xAdsService.getAdAccounts).not.toHaveBeenCalled();
    });
  });

  describe('listCampaigns', () => {
    it('should map campaigns and convert micro budgets to major currency units', async () => {
      xAdsService.listCampaigns.mockResolvedValue([
        {
          createdAt: '2026-01-01T00:00:00Z',
          dailyBudgetAmountLocalMicro: 50_000_000,
          endTime: undefined,
          entityStatus: 'PAUSED',
          fundingInstrumentId: 'fi-1',
          id: 'cmp-1',
          name: 'Launch Campaign',
          startTime: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]);

      const result = await adapter.listCampaigns(mockCtx);

      expect(result[0].id).toBe('cmp-1');
      expect(result[0].dailyBudget).toBe(50);
      expect(result[0].platform).toBe('x');
      expect(result[0].status).toBe('PAUSED');
    });
  });

  describe('getCampaignInsights', () => {
    it('normalizes today to one inclusive gateway day and an exclusive X end boundary', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
      xAdsService.getCampaignStats.mockResolvedValue([
        {
          endTime: '2026-08-20T00:00:00Z',
          id: 'cmp-1',
          metrics: { billedCharge: 0, clicks: 0, impressions: 0 },
          startTime: '2026-08-19T00:00:00Z',
        },
      ]);

      try {
        const result = await adapter.getCampaignInsights(mockCtx, 'cmp-1', {
          datePreset: 'today',
        });

        expect(xAdsService.getCampaignStats).toHaveBeenCalledWith(
          oauthCredentials,
          'acct-123',
          ['cmp-1'],
          { endDate: '2026-08-20', startDate: '2026-08-19' },
        );
        expect(result).toMatchObject({
          dateStart: '2026-08-19',
          dateStop: '2026-08-19',
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('maps yesterday to one day with an exclusive X end boundary', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
      xAdsService.getCampaignStats.mockResolvedValue([
        {
          endTime: '2026-08-19T00:00:00Z',
          id: 'cmp-1',
          metrics: { billedCharge: 0, clicks: 0, impressions: 0 },
          startTime: '2026-08-18T00:00:00Z',
        },
      ]);

      try {
        const result = await adapter.getCampaignInsights(mockCtx, 'cmp-1', {
          datePreset: 'yesterday',
        });

        expect(xAdsService.getCampaignStats).toHaveBeenCalledWith(
          oauthCredentials,
          'acct-123',
          ['cmp-1'],
          { endDate: '2026-08-19', startDate: '2026-08-18' },
        );
        expect(result).toMatchObject({
          dateStart: '2026-08-18',
          dateStop: '2026-08-18',
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('maps an explicit same-day range to an exclusive next-day X boundary', async () => {
      xAdsService.getCampaignStats.mockResolvedValue([
        {
          endTime: '2026-03-08T00:00:00Z',
          id: 'cmp-1',
          metrics: { billedCharge: 0, clicks: 0, impressions: 0 },
          startTime: '2026-03-07T00:00:00Z',
        },
      ]);

      const result = await adapter.getCampaignInsights(mockCtx, 'cmp-1', {
        timeRange: { since: '2026-03-07', until: '2026-03-07' },
      });

      expect(xAdsService.getCampaignStats).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        ['cmp-1'],
        { endDate: '2026-03-08', startDate: '2026-03-07' },
      );
      expect(result).toMatchObject({
        dateStart: '2026-03-07',
        dateStop: '2026-03-07',
      });
    });

    it('keeps last_7d at seven inclusive gateway days for X reporting', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
      xAdsService.getCampaignStats.mockResolvedValue([
        {
          endTime: '2026-08-19T00:00:00Z',
          id: 'cmp-1',
          metrics: { billedCharge: 0, clicks: 0, impressions: 0 },
          startTime: '2026-08-12T00:00:00Z',
        },
      ]);

      try {
        const result = await adapter.getCampaignInsights(mockCtx, 'cmp-1', {
          datePreset: 'last_7d',
        });

        expect(xAdsService.getCampaignStats).toHaveBeenCalledWith(
          oauthCredentials,
          'acct-123',
          ['cmp-1'],
          { endDate: '2026-08-19', startDate: '2026-08-12' },
        );
        const reportingRange = xAdsService.getCampaignStats.mock.calls[0]?.[3];
        expect(
          (Date.parse(reportingRange.endDate) -
            Date.parse(reportingRange.startDate)) /
            (24 * 60 * 60 * 1000),
        ).toBe(7);
        expect(result).toMatchObject({
          dateStart: '2026-08-12',
          dateStop: '2026-08-18',
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('should derive ratio metrics from the single TOTAL-granularity row', async () => {
      xAdsService.getCampaignStats.mockResolvedValue([
        {
          endTime: '2026-03-07',
          id: 'cmp-1',
          metrics: {
            billedCharge: 40,
            clicks: 200,
            conversionValue: 80,
            conversions: 10,
            impressions: 4000,
          },
          startTime: '2026-03-01',
        },
      ]);

      const result = await adapter.getCampaignInsights(mockCtx, 'cmp-1', {
        timeRange: { since: '2026-03-01', until: '2026-03-07' },
      });

      expect(xAdsService.getCampaignStats).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        ['cmp-1'],
        { endDate: '2026-03-08', startDate: '2026-03-01' },
      );
      expect(result).toMatchObject({
        clicks: 200,
        conversions: 10,
        cpa: 4,
        cpc: 0.2,
        cpm: 10,
        ctr: 5,
        dateStart: '2026-03-01',
        dateStop: '2026-03-07',
        impressions: 4000,
        platform: 'x',
        revenue: 80,
        roas: 2,
        spend: 40,
      });
    });

    it('should return empty insights when no row is returned', async () => {
      xAdsService.getCampaignStats.mockResolvedValue([]);

      const result = await adapter.getCampaignInsights(mockCtx, 'cmp-empty');

      expect(result.spend).toBe(0);
      expect(result.platform).toBe('x');
    });
  });

  describe('getAdSetInsights', () => {
    it('should call line item stats and map the single row', async () => {
      xAdsService.getLineItemStats.mockResolvedValue([
        {
          endTime: '2026-03-07',
          id: 'li-1',
          metrics: { billedCharge: 10, clicks: 50, impressions: 1000 },
          startTime: '2026-03-01',
        },
      ]);

      const result = await adapter.getAdSetInsights(mockCtx, 'li-1');

      expect(xAdsService.getLineItemStats).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        ['li-1'],
        expect.objectContaining({
          endDate: expect.any(String),
          startDate: expect.any(String),
        }),
      );
      expect(result.spend).toBe(10);
      expect(result.platform).toBe('x');
    });
  });

  describe('getAdInsights', () => {
    it('should call promoted tweet stats and map the single row', async () => {
      xAdsService.getPromotedTweetStats.mockResolvedValue([
        {
          endTime: '2026-03-07',
          id: 'pt-1',
          metrics: { billedCharge: 5, clicks: 10, impressions: 500 },
          startTime: '2026-03-01',
        },
      ]);

      const result = await adapter.getAdInsights(mockCtx, 'pt-1');

      expect(xAdsService.getPromotedTweetStats).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        ['pt-1'],
        expect.objectContaining({
          endDate: expect.any(String),
          startDate: expect.any(String),
        }),
      );
      expect(result.spend).toBe(5);
      expect(result.platform).toBe('x');
    });
  });

  describe('createCampaign', () => {
    it('should create the campaign with the explicit paused entity status', async () => {
      xAdsService.createCampaign.mockResolvedValue({
        createdAt: '2026-01-01T00:00:00Z',
        entityStatus: 'PAUSED',
        fundingInstrumentId: 'fi-1',
        id: 'new-cmp-id',
        name: 'New Campaign',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      const result = await adapter.createCampaign(mockCtx, {
        dailyBudget: 25,
        name: 'New Campaign',
        objective: 'ENGAGEMENTS',
        status: 'PAUSED',
      });

      expect(result.id).toBe('new-cmp-id');
      expect(result.status).toBe('PAUSED');
      expect(result.platform).toBe('x');
      expect(xAdsService.createCampaign).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        expect.objectContaining({
          dailyBudgetAmountLocalMicro: 25_000_000,
          entityStatus: 'PAUSED',
          fundingInstrumentId: 'fi-1',
          name: 'New Campaign',
        }),
      );
      expect(xAdsService.getFundingInstruments).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
      );
    });

    it.each(['ACTIVE', 'active', 'paused', 'DRAFT', ''])(
      'should reject creation with status "%s" before the funding-instrument lookup',
      async (status) => {
        await expect(
          adapter.createCampaign(mockCtx, {
            name: 'Activating Campaign',
            objective: 'ENGAGEMENTS',
            status,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);

        // The billing surface is never touched, not even as a read.
        expect(xAdsService.getFundingInstruments).not.toHaveBeenCalled();
        expect(xAdsService.createCampaign).not.toHaveBeenCalled();
      },
    );

    it('should prefer an active provider funding instrument', async () => {
      xAdsService.getFundingInstruments.mockResolvedValue([
        {
          currency: 'USD',
          entityStatus: 'PAUSED',
          id: 'fi-paused',
          type: 'CREDIT_CARD',
        },
        {
          currency: 'USD',
          entityStatus: 'ACTIVE',
          id: 'fi-active',
          type: 'CREDIT_CARD',
        },
      ]);
      xAdsService.createCampaign.mockResolvedValue({
        createdAt: '2026-01-01T00:00:00Z',
        entityStatus: 'PAUSED',
        fundingInstrumentId: 'fi-active',
        id: 'new-cmp-id',
        name: 'Resolved Funding',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      await adapter.createCampaign(mockCtx, {
        name: 'Resolved Funding',
        objective: 'ENGAGEMENTS',
      });

      expect(xAdsService.getFundingInstruments).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
      );
      expect(xAdsService.createCampaign).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        expect.objectContaining({ fundingInstrumentId: 'fi-active' }),
      );
    });

    it('should reject campaign creation when the account has no funding instruments', async () => {
      xAdsService.getFundingInstruments.mockResolvedValue([]);

      await expect(
        adapter.createCampaign(mockCtx, {
          name: 'No Funding',
          objective: 'ENGAGEMENTS',
        }),
      ).rejects.toThrow('X Ads account has no funding instrument');
      expect(xAdsService.createCampaign).not.toHaveBeenCalled();
    });

    it('should preserve explicit zero campaign budgets', async () => {
      xAdsService.createCampaign.mockResolvedValue({
        createdAt: '2026-01-01T00:00:00Z',
        entityStatus: 'PAUSED',
        fundingInstrumentId: 'fi-1',
        id: 'zero-budget-campaign',
        name: 'Zero budget',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      await adapter.createCampaign(mockCtx, {
        dailyBudget: 0,
        lifetimeBudget: 0,
        name: 'Zero budget',
        objective: 'ENGAGEMENTS',
      });

      expect(xAdsService.createCampaign).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        expect.objectContaining({
          dailyBudgetAmountLocalMicro: 0,
          totalBudgetAmountLocalMicro: 0,
        }),
      );
    });
  });

  describe('createAdSet', () => {
    it('should always create the line item PAUSED', async () => {
      xAdsService.createLineItem.mockResolvedValue({
        campaignId: 'cmp-1',
        dailyBudgetAmountLocalMicro: 12_500_000,
        entityStatus: 'PAUSED',
        id: 'li-new',
        name: 'New Line Item',
        objective: 'WEBSITE_CLICKS',
        productType: 'PROMOTED_TWEETS',
      });

      const result = await adapter.createAdSet(mockCtx, {
        campaignId: 'cmp-1',
        dailyBudget: 12.5,
        name: 'New Line Item',
        optimizationGoal: 'WEBSITE_CLICKS',
        targeting: {},
      });

      expect(result.id).toBe('li-new');
      expect(result.status).toBe('PAUSED');
      expect(result.platform).toBe('x');
      expect(result.dailyBudget).toBe(12.5);
      expect(xAdsService.createLineItem).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        expect.objectContaining({
          campaignId: 'cmp-1',
          dailyBudgetAmountLocalMicro: 12_500_000,
          entityStatus: 'PAUSED',
          name: 'New Line Item',
          objective: 'WEBSITE_CLICKS',
          placements: ['ALL_ON_TWITTER'],
        }),
      );
      expect(xAdsService.createLineItem.mock.calls[0]?.[2]?.targeting).toBe(
        undefined,
      );
    });

    it('should reject targeting the X line-item endpoint cannot encode', async () => {
      await expect(
        adapter.createAdSet(mockCtx, {
          campaignId: 'cmp-1',
          name: 'Targeted Line Item',
          targeting: { countries: ['US'] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(xAdsService.createLineItem).not.toHaveBeenCalled();
    });

    it('should reject unsupported X optimization goals', async () => {
      await expect(
        adapter.createAdSet(mockCtx, {
          campaignId: 'cmp-1',
          name: 'Unsupported goal',
          optimizationGoal: 'LEAD_GENERATION',
          targeting: {},
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(xAdsService.createLineItem).not.toHaveBeenCalled();
    });

    it('should preserve an explicit zero line-item daily budget', async () => {
      xAdsService.createLineItem.mockResolvedValue({
        campaignId: 'cmp-1',
        dailyBudgetAmountLocalMicro: 0,
        entityStatus: 'PAUSED',
        id: 'li-zero',
        name: 'Zero budget line item',
        objective: 'ENGAGEMENTS',
        productType: 'PROMOTED_TWEETS',
      });

      await adapter.createAdSet(mockCtx, {
        campaignId: 'cmp-1',
        dailyBudget: 0,
        name: 'Zero budget line item',
        targeting: {},
      });

      expect(xAdsService.createLineItem).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        expect.objectContaining({ dailyBudgetAmountLocalMicro: 0 }),
      );
    });
  });

  describe('updateCampaign', () => {
    it('should reject a status update that would activate the campaign, without calling the provider', async () => {
      try {
        await adapter.updateCampaign(mockCtx, 'cmp-1', { status: 'ACTIVE' });
        expect.unreachable('updateCampaign should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          detail: INVALID_CAMPAIGN_STATUS_MESSAGE,
        });
      }
      expect(xAdsService.updateCampaign).not.toHaveBeenCalled();
    });

    it('should pass a PAUSED status update through to the provider', async () => {
      xAdsService.updateCampaign.mockResolvedValue({
        createdAt: '2026-01-01T00:00:00Z',
        entityStatus: 'PAUSED',
        fundingInstrumentId: 'fi-1',
        id: 'cmp-1',
        name: 'Updated Campaign',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      const result = await adapter.updateCampaign(mockCtx, 'cmp-1', {
        name: 'Updated Campaign',
        status: 'PAUSED',
      });

      expect(result.id).toBe('cmp-1');
      expect(xAdsService.updateCampaign).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        'cmp-1',
        expect.objectContaining({
          entityStatus: 'PAUSED',
          name: 'Updated Campaign',
        }),
      );
    });

    it('should pass an update with no status through to the provider unchanged', async () => {
      xAdsService.updateCampaign.mockResolvedValue({
        createdAt: '2026-01-01T00:00:00Z',
        entityStatus: 'PAUSED',
        fundingInstrumentId: 'fi-1',
        id: 'cmp-1',
        name: 'Renamed Campaign',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      const result = await adapter.updateCampaign(mockCtx, 'cmp-1', {
        name: 'Renamed Campaign',
      });

      expect(result.id).toBe('cmp-1');
      expect(xAdsService.updateCampaign).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        'cmp-1',
        expect.objectContaining({
          entityStatus: undefined,
          name: 'Renamed Campaign',
        }),
      );
    });

    it('should preserve explicit zero budgets on campaign updates', async () => {
      xAdsService.updateCampaign.mockResolvedValue({
        createdAt: '2026-01-01T00:00:00Z',
        entityStatus: 'PAUSED',
        fundingInstrumentId: 'fi-1',
        id: 'cmp-1',
        name: 'Zeroed campaign',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      await adapter.updateCampaign(mockCtx, 'cmp-1', {
        dailyBudget: 0,
        lifetimeBudget: 0,
      });

      expect(xAdsService.updateCampaign).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        'cmp-1',
        expect.objectContaining({
          dailyBudgetAmountLocalMicro: 0,
          totalBudgetAmountLocalMicro: 0,
        }),
      );
    });
  });

  describe('listAdSets', () => {
    it('should map line items to unified ad sets', async () => {
      xAdsService.listLineItems.mockResolvedValue([
        {
          bidAmountLocalMicro: 99_000_000,
          campaignId: 'cmp-1',
          dailyBudgetAmountLocalMicro: 7_500_000,
          entityStatus: 'PAUSED',
          id: 'li-1',
          name: 'Line Item One',
          objective: 'ENGAGEMENTS',
          productType: 'PROMOTED_TWEETS',
        },
      ]);

      const result = await adapter.listAdSets(mockCtx, 'cmp-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('li-1');
      expect(result[0].campaignId).toBe('cmp-1');
      expect(result[0].platform).toBe('x');
      expect(result[0].dailyBudget).toBe(7.5);
    });
  });

  describe('listAds', () => {
    it('should map promoted tweets to unified ads', async () => {
      xAdsService.listPromotedTweets.mockResolvedValue([
        {
          approvalStatus: 'ACCEPTED',
          entityStatus: 'PAUSED',
          id: 'pt-1',
          lineItemId: 'li-1',
          tweetId: 'tweet-1',
        },
      ]);

      const result = await adapter.listAds(mockCtx, 'li-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pt-1');
      expect(result[0].adSetId).toBe('li-1');
      expect(result[0].platform).toBe('x');
    });
  });

  describe('createAd', () => {
    it('should reject the unified createAd operation', async () => {
      await expect(
        adapter.createAd(mockCtx, {
          adSetId: 'li-1',
          creative: { linkUrl: 'https://example.com' },
          name: 'New Ad',
        }),
      ).rejects.toThrow(
        'X Ads does not support this unified createAd operation.',
      );
    });
  });

  describe('getTopPerformers', () => {
    it('should return promoted tweets sorted at the same entity granularity as listAds', async () => {
      xAdsService.listPromotedTweets.mockResolvedValue([
        {
          approvalStatus: 'ACCEPTED',
          entityStatus: 'PAUSED',
          id: 'pt-1',
          lineItemId: 'li-1',
          tweetId: 'tweet-1',
        },
        {
          approvalStatus: 'ACCEPTED',
          entityStatus: 'PAUSED',
          id: 'pt-2',
          lineItemId: 'li-2',
          tweetId: 'tweet-2',
        },
      ]);
      xAdsService.getPromotedTweetStats.mockResolvedValue([
        {
          id: 'pt-1',
          metrics: { billedCharge: 10, clicks: 50, impressions: 1000 },
        },
        {
          id: 'pt-2',
          metrics: { billedCharge: 20, clicks: 400, impressions: 2000 },
        },
      ]);

      const result = await adapter.getTopPerformers(mockCtx, {
        limit: 5,
        metric: 'ctr',
      });

      expect(xAdsService.getPromotedTweetStats).toHaveBeenCalledWith(
        oauthCredentials,
        'acct-123',
        ['pt-1', 'pt-2'],
        expect.objectContaining({
          endDate: expect.any(String),
          startDate: expect.any(String),
        }),
      );
      expect(result[0].id).toBe('pt-2');
      expect(result[0].name).toBe('tweet-2');
      expect(result[0].metric).toBe('ctr');
      expect(result[0].insights.platform).toBe('x');
    });

    it('should return an empty array when there are no promoted tweets', async () => {
      xAdsService.listPromotedTweets.mockResolvedValue([]);

      const result = await adapter.getTopPerformers(mockCtx);

      expect(result).toEqual([]);
      expect(xAdsService.getPromotedTweetStats).not.toHaveBeenCalled();
    });
  });
});
