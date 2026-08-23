import { XAdsAdapter } from '@api/services/ads-gateway/adapters/x-ads.adapter';
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
    adAccountId: 'acct-123',
    credentialId: 'cred-1',
    fundingInstrumentId: 'fi-1',
    organizationId: 'org-1',
  };

  beforeEach(async () => {
    xAdsService = {
      createCampaign: vi.fn(),
      createLineItem: vi.fn(),
      getAdAccounts: vi.fn(),
      getCampaignStats: vi.fn(),
      getLineItemStats: vi.fn(),
      getPromotedTweetStats: vi.fn(),
      listCampaigns: vi.fn(),
      listLineItems: vi.fn(),
      listPromotedTweets: vi.fn(),
      updateCampaign: vi.fn(),
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

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
        'x-token',
        'acct-123',
        ['cmp-1'],
        { endDate: '2026-03-07', startDate: '2026-03-01' },
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
        'x-token',
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
        'x-token',
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
    it('should always create the campaign PAUSED regardless of requested status', async () => {
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
        status: 'ACTIVE',
      });

      expect(result.id).toBe('new-cmp-id');
      expect(result.status).toBe('PAUSED');
      expect(result.platform).toBe('x');
      expect(xAdsService.createCampaign).toHaveBeenCalledWith(
        'x-token',
        'acct-123',
        expect.objectContaining({
          dailyBudgetAmountLocalMicro: 25_000_000,
          entityStatus: 'PAUSED',
          fundingInstrumentId: 'fi-1',
          name: 'New Campaign',
        }),
      );
    });

    it('should reject campaign creation without a funding instrument id', async () => {
      const ctxWithoutFunding: AdsAdapterContext = {
        ...mockCtx,
        fundingInstrumentId: undefined,
      };

      await expect(
        adapter.createCampaign(ctxWithoutFunding, {
          name: 'No Funding',
          objective: 'ENGAGEMENTS',
        }),
      ).rejects.toThrow(
        'X Ads requires a funding instrument id (AdsAdapterContext.fundingInstrumentId) to create a campaign.',
      );
      expect(xAdsService.createCampaign).not.toHaveBeenCalled();
    });
  });

  describe('createAdSet', () => {
    it('should always create the line item PAUSED', async () => {
      xAdsService.createLineItem.mockResolvedValue({
        campaignId: 'cmp-1',
        entityStatus: 'PAUSED',
        id: 'li-new',
        name: 'New Line Item',
        objective: 'ENGAGEMENTS',
        productType: 'PROMOTED_TWEETS',
      });

      const result = await adapter.createAdSet(mockCtx, {
        campaignId: 'cmp-1',
        name: 'New Line Item',
        targeting: {},
      });

      expect(result.id).toBe('li-new');
      expect(result.status).toBe('PAUSED');
      expect(result.platform).toBe('x');
      expect(xAdsService.createLineItem).toHaveBeenCalledWith(
        'x-token',
        'acct-123',
        expect.objectContaining({
          campaignId: 'cmp-1',
          entityStatus: 'PAUSED',
          name: 'New Line Item',
        }),
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
          detail: expect.stringContaining('paused'),
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
        'x-token',
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
        'x-token',
        'acct-123',
        'cmp-1',
        expect.objectContaining({
          entityStatus: undefined,
          name: 'Renamed Campaign',
        }),
      );
    });
  });

  describe('listAdSets', () => {
    it('should map line items to unified ad sets', async () => {
      xAdsService.listLineItems.mockResolvedValue([
        {
          campaignId: 'cmp-1',
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
    it('should return campaigns sorted by the requested metric', async () => {
      xAdsService.listCampaigns.mockResolvedValue([
        {
          entityStatus: 'PAUSED',
          fundingInstrumentId: 'fi-1',
          id: 'cmp-1',
          name: 'Campaign One',
        },
        {
          entityStatus: 'PAUSED',
          fundingInstrumentId: 'fi-1',
          id: 'cmp-2',
          name: 'Campaign Two',
        },
      ]);
      xAdsService.getCampaignStats.mockResolvedValue([
        {
          id: 'cmp-1',
          metrics: { billedCharge: 10, clicks: 50, impressions: 1000 },
        },
        {
          id: 'cmp-2',
          metrics: { billedCharge: 20, clicks: 400, impressions: 2000 },
        },
      ]);

      const result = await adapter.getTopPerformers(mockCtx, {
        limit: 5,
        metric: 'ctr',
      });

      expect(result[0].id).toBe('cmp-2'); // higher ctr first
      expect(result[0].metric).toBe('ctr');
      expect(result[0].insights.platform).toBe('x');
    });

    it('should return an empty array when there are no campaigns', async () => {
      xAdsService.listCampaigns.mockResolvedValue([]);

      const result = await adapter.getTopPerformers(mockCtx);

      expect(result).toEqual([]);
      expect(xAdsService.getCampaignStats).not.toHaveBeenCalled();
    });
  });
});
