import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { MetaAdsAdapter } from './meta-ads.adapter';

const mockCtx = {
  accessToken: 'tok-abc',
  adAccountId: 'act_123456',
};

describe('MetaAdsAdapter', () => {
  let adapter: MetaAdsAdapter;
  let metaAdsService: vi.Mocked<MetaAdsService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaAdsAdapter,
        {
          provide: MetaAdsService,
          useValue: {
            createAd: vi.fn(),
            createAdSet: vi.fn(),
            createCampaign: vi.fn(),
            getAdAccounts: vi.fn(),
            getCampaignInsights: vi.fn(),
            getTopPerformers: vi.fn(),
            listCampaigns: vi.fn(),
            pauseCampaign: vi.fn(),
            updateCampaign: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    adapter = module.get(MetaAdsAdapter);
    metaAdsService = module.get(MetaAdsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  it('exposes platform as "meta"', () => {
    expect(adapter.platform).toBe('meta');
  });

  // ── getAdAccounts ─────────────────────────────────────────────────────────

  describe('getAdAccounts', () => {
    it('maps raw accounts to unified format', async () => {
      metaAdsService.getAdAccounts.mockResolvedValue([
        {
          currency: 'USD',
          id: 'act_1',
          name: 'Ad Account 1',
          status: 1,
          timezone: 'UTC',
        },
      ] as never);

      const result = await adapter.getAdAccounts(mockCtx);

      expect(metaAdsService.getAdAccounts).toHaveBeenCalledWith(
        mockCtx.accessToken,
      );
      expect(result).toEqual([
        {
          currency: 'USD',
          id: 'act_1',
          name: 'Ad Account 1',
          platform: 'meta',
          status: '1',
          timezone: 'UTC',
        },
      ]);
    });
  });

  // ── listCampaigns ─────────────────────────────────────────────────────────

  describe('listCampaigns', () => {
    it('maps raw campaigns to unified format', async () => {
      metaAdsService.listCampaigns.mockResolvedValue([
        {
          dailyBudget: 5000,
          id: 'c1',
          lifetimeBudget: undefined,
          name: 'Campaign 1',
          objective: 'LINK_CLICKS',
          startTime: '2026-01-01',
          status: 'ACTIVE',
          stopTime: '2026-12-31',
        },
      ] as never);

      const result = await adapter.listCampaigns(mockCtx);

      expect(result[0]).toMatchObject({
        id: 'c1',
        name: 'Campaign 1',
        objective: 'LINK_CLICKS',
        platform: 'meta',
        status: 'ACTIVE',
      });
    });
  });

  // ── getCampaignInsights ───────────────────────────────────────────────────

  describe('getCampaignInsights', () => {
    const rawInsights = {
      clicks: 300,
      conversions: 10,
      cpc: 0.5,
      cpm: 5.0,
      ctr: 3.0,
      dateStart: '2026-03-01',
      dateStop: '2026-03-15',
      impressions: 10000,
      spend: 150,
    };

    it('returns unified insights from first row', async () => {
      metaAdsService.getCampaignInsights.mockResolvedValue([
        rawInsights,
      ] as never);

      const result = await adapter.getCampaignInsights(mockCtx, 'c1');

      expect(result).toMatchObject({
        clicks: 300,
        impressions: 10000,
        platform: 'meta',
        spend: 150,
      });
    });

    it('returns empty insights when no data rows', async () => {
      metaAdsService.getCampaignInsights.mockResolvedValue([] as never);

      const result = await adapter.getCampaignInsights(mockCtx, 'c1');

      expect(result).toMatchObject({
        clicks: 0,
        impressions: 0,
        platform: 'meta',
        spend: 0,
      });
    });
  });

  // ── createCampaign ────────────────────────────────────────────────────────

  describe('createCampaign', () => {
    it('creates campaign and returns unified shape', async () => {
      metaAdsService.createCampaign.mockResolvedValue(
        'new-campaign-id' as never,
      );

      const input = {
        dailyBudget: 10000,
        name: 'New Campaign',
        objective: 'CONVERSIONS',
        status: 'PAUSED',
      };

      const result = await adapter.createCampaign(mockCtx, input as never);

      expect(result).toMatchObject({
        id: 'new-campaign-id',
        name: 'New Campaign',
        platform: 'meta',
        status: 'PAUSED',
      });
    });
  });

  // ── pauseCampaign ─────────────────────────────────────────────────────────

  describe('pauseCampaign', () => {
    it('delegates pause to service', async () => {
      metaAdsService.pauseCampaign.mockResolvedValue(undefined as never);

      await adapter.pauseCampaign(mockCtx, 'c1');

      expect(metaAdsService.pauseCampaign).toHaveBeenCalledWith(
        mockCtx.accessToken,
        'c1',
      );
    });
  });

  // ── listAdSets ────────────────────────────────────────────────────────────

  describe('listAdSets', () => {
    it('returns empty array and logs warning (not implemented)', async () => {
      const result = await adapter.listAdSets(mockCtx, 'c1');
      expect(result).toEqual([]);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('not yet implemented'),
      );
    });
  });

  // ── listAds ───────────────────────────────────────────────────────────────

  describe('listAds', () => {
    it('returns empty array and logs warning (not implemented)', async () => {
      const result = await adapter.listAds(mockCtx);
      expect(result).toEqual([]);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('not yet implemented'),
      );
    });
  });

  // ── getTopPerformers ──────────────────────────────────────────────────────

  describe('getTopPerformers', () => {
    it('maps top performers to unified shape', async () => {
      metaAdsService.getTopPerformers.mockResolvedValue([
        {
          id: 'c1',
          insights: {
            clicks: 500,
            conversions: 20,
            cpc: 0.4,
            cpm: 4.0,
            ctr: 5.0,
            dateStart: '2026-03-01',
            dateStop: '2026-03-15',
            impressions: 10000,
            spend: 200,
          },
          metric: 'ctr',
          name: 'Top Campaign',
          value: 5.0,
        },
      ] as never);

      const result = await adapter.getTopPerformers(mockCtx, { metric: 'ctr' });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'c1',
        metric: 'ctr',
        name: 'Top Campaign',
        value: 5.0,
      });
      expect(result[0].insights.platform).toBe('meta');
    });
  });
});
