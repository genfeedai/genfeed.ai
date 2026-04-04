import { TikTokAdsAdapter } from '@api/services/ads-gateway/adapters/tiktok-ads.adapter';
import { TikTokAdsService } from '@api/services/integrations/tiktok-ads/services/tiktok-ads.service';
import type { AdsAdapterContext } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('TikTokAdsAdapter', () => {
  let adapter: TikTokAdsAdapter;
  let tiktokAdsService: {
    createAd: ReturnType<typeof vi.fn>;
    createAdGroup: ReturnType<typeof vi.fn>;
    createCampaign: ReturnType<typeof vi.fn>;
    getAdAccounts: ReturnType<typeof vi.fn>;
    getCampaignInsights: ReturnType<typeof vi.fn>;
    getReporting: ReturnType<typeof vi.fn>;
    listAdGroups: ReturnType<typeof vi.fn>;
    listAds: ReturnType<typeof vi.fn>;
    listCampaigns: ReturnType<typeof vi.fn>;
    pauseCampaign: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  const mockCtx: AdsAdapterContext = {
    accessToken: 'tk-token',
    adAccountId: 'acct-123',
    organizationId: 'org-1',
  };

  beforeEach(async () => {
    tiktokAdsService = {
      createAd: vi.fn(),
      createAdGroup: vi.fn(),
      createCampaign: vi.fn(),
      getAdAccounts: vi.fn(),
      getCampaignInsights: vi.fn(),
      getReporting: vi.fn(),
      listAdGroups: vi.fn(),
      listAds: vi.fn(),
      listCampaigns: vi.fn(),
      pauseCampaign: vi.fn(),
      updateCampaign: vi.fn(),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TikTokAdsAdapter,
        { provide: TikTokAdsService, useValue: tiktokAdsService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    adapter = module.get(TikTokAdsAdapter);
  });

  it('should be defined with platform=tiktok', () => {
    expect(adapter).toBeDefined();
    expect(adapter.platform).toBe('tiktok');
  });

  describe('getAdAccounts', () => {
    it('should map TikTok accounts to unified format', async () => {
      tiktokAdsService.getAdAccounts.mockResolvedValue([
        {
          advertiserId: 'adv-1',
          advertiserName: 'Test Advertiser',
          currency: 'USD',
          status: 'ENABLE',
          timezone: 'UTC',
        },
      ]);

      const result = await adapter.getAdAccounts(mockCtx);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        currency: 'USD',
        id: 'adv-1',
        name: 'Test Advertiser',
        platform: 'tiktok',
        status: 'ENABLE',
        timezone: 'UTC',
      });
    });
  });

  describe('listCampaigns', () => {
    it('should map campaigns including daily budget when BUDGET_MODE_DAY', async () => {
      tiktokAdsService.listCampaigns.mockResolvedValue([
        {
          budget: 100,
          budgetMode: 'BUDGET_MODE_DAY',
          campaignId: 'cmp-1',
          campaignName: 'Summer Campaign',
          createTime: '2026-01-01',
          objective: 'TRAFFIC',
          status: 'ENABLE',
        },
      ]);

      const result = await adapter.listCampaigns(mockCtx);

      expect(result[0].dailyBudget).toBe(100);
      expect(result[0].lifetimeBudget).toBeUndefined();
      expect(result[0].id).toBe('cmp-1');
      expect(result[0].platform).toBe('tiktok');
    });

    it('should set lifetimeBudget when BUDGET_MODE_TOTAL', async () => {
      tiktokAdsService.listCampaigns.mockResolvedValue([
        {
          budget: 5000,
          budgetMode: 'BUDGET_MODE_TOTAL',
          campaignId: 'cmp-2',
          campaignName: 'Lifetime Budget',
          createTime: '2026-01-01',
          objective: 'APP_INSTALL',
          status: 'DISABLE',
        },
      ]);

      const result = await adapter.listCampaigns(mockCtx);

      expect(result[0].lifetimeBudget).toBe(5000);
      expect(result[0].dailyBudget).toBeUndefined();
    });
  });

  describe('getCampaignInsights', () => {
    it('should aggregate insights across multiple rows', async () => {
      tiktokAdsService.getCampaignInsights.mockResolvedValue([
        { clicks: 50, conversions: 5, impressions: 1000, spend: 10 },
        { clicks: 100, conversions: 10, impressions: 2000, spend: 20 },
      ]);

      const result = await adapter.getCampaignInsights(mockCtx, 'cmp-1');

      expect(result.spend).toBe(30);
      expect(result.impressions).toBe(3000);
      expect(result.clicks).toBe(150);
      expect(result.conversions).toBe(15);
      expect(result.platform).toBe('tiktok');
    });

    it('should return empty insights when no data', async () => {
      tiktokAdsService.getCampaignInsights.mockResolvedValue([]);

      const result = await adapter.getCampaignInsights(mockCtx, 'cmp-empty');

      expect(result.spend).toBe(0);
      expect(result.impressions).toBe(0);
      expect(result.platform).toBe('tiktok');
    });
  });

  describe('createCampaign', () => {
    it('should create a campaign and return unified format', async () => {
      tiktokAdsService.createCampaign.mockResolvedValue('new-cmp-id');

      const result = await adapter.createCampaign(mockCtx, {
        dailyBudget: 50,
        name: 'New Campaign',
        objective: 'TRAFFIC',
        status: 'ENABLE',
      });

      expect(result.id).toBe('new-cmp-id');
      expect(result.name).toBe('New Campaign');
      expect(result.platform).toBe('tiktok');
      expect(tiktokAdsService.createCampaign).toHaveBeenCalledWith(
        'tk-token',
        'acct-123',
        expect.objectContaining({
          budget: 50,
          budgetMode: 'BUDGET_MODE_DAY',
        }),
      );
    });
  });

  describe('pauseCampaign', () => {
    it('should delegate to tiktokAdsService.pauseCampaign', async () => {
      tiktokAdsService.pauseCampaign.mockResolvedValue(undefined);

      await adapter.pauseCampaign(mockCtx, 'cmp-pause');

      expect(tiktokAdsService.pauseCampaign).toHaveBeenCalledWith(
        'tk-token',
        'acct-123',
        'cmp-pause',
      );
    });
  });

  describe('listAdSets', () => {
    it('should map ad groups to unified ad sets', async () => {
      tiktokAdsService.listAdGroups.mockResolvedValue({
        list: [
          {
            adgroup_id: 'ag-1',
            adgroup_name: 'Ad Group One',
            budget: 50_000_000,
            budget_mode: 'BUDGET_MODE_DAY',
            campaign_id: 'cmp-1',
            optimization_goal: 'CLICK',
            status: 'ENABLE',
          },
        ],
      });

      const result = await adapter.listAdSets(mockCtx, 'cmp-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ag-1');
      expect(result[0].name).toBe('Ad Group One');
      expect(result[0].platform).toBe('tiktok');
    });

    it('should handle empty list response', async () => {
      tiktokAdsService.listAdGroups.mockResolvedValue({ list: null });

      const result = await adapter.listAdSets(mockCtx, 'cmp-empty');

      expect(result).toEqual([]);
    });
  });

  describe('getTopPerformers', () => {
    it('should return sorted rows by metric value', async () => {
      tiktokAdsService.getReporting.mockResolvedValue([
        {
          clicks: 50,
          cpc: 0.2,
          cpm: 10,
          ctr: 5,
          impressions: 1000,
          spend: 10,
          statTimeDay: '2026-01-01',
        },
        {
          clicks: 200,
          cpc: 0.1,
          cpm: 10,
          ctr: 10,
          impressions: 2000,
          spend: 20,
          statTimeDay: '2026-01-02',
        },
      ]);

      const result = await adapter.getTopPerformers(mockCtx, {
        limit: 5,
        metric: 'ctr',
      });

      expect(result[0].value).toBe(10); // highest ctr first
      expect(result[0].metric).toBe('ctr');
      expect(result[0].insights.platform).toBe('tiktok');
    });
  });
});
