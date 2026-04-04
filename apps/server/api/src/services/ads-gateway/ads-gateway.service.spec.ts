import { GoogleAdsAdapter } from '@api/services/ads-gateway/adapters/google-ads.adapter';
import { MetaAdsAdapter } from '@api/services/ads-gateway/adapters/meta-ads.adapter';
import { TikTokAdsAdapter } from '@api/services/ads-gateway/adapters/tiktok-ads.adapter';
import type { AdsAdapterContext } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AdsGatewayService } from './ads-gateway.service';

const makeAdapter = () => ({
  createAd: vi.fn(),
  createAdSet: vi.fn(),
  createCampaign: vi.fn(),
  getAdAccounts: vi.fn(),
  getCampaignInsights: vi.fn(),
  getTopPerformers: vi.fn(),
  listAdSets: vi.fn(),
  listAds: vi.fn(),
  listCampaigns: vi.fn(),
  pauseCampaign: vi.fn(),
  updateCampaign: vi.fn(),
});

const mockCtx = {
  accessToken: 'tok',
  adAccountId: 'act_123',
} satisfies AdsAdapterContext;

const buildInsights = (
  spend: number,
  impressions: number,
  clicks: number,
  roas?: number,
) => ({
  clicks,
  cpc: 0,
  cpm: 0,
  ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
  dateStart: '2026-03-01',
  dateStop: '2026-03-15',
  impressions,
  platform: 'meta' as const,
  roas,
  spend,
});

describe('AdsGatewayService', () => {
  let service: AdsGatewayService;
  let metaAdapter: ReturnType<typeof makeAdapter>;
  let googleAdapter: ReturnType<typeof makeAdapter>;
  let tiktokAdapter: ReturnType<typeof makeAdapter>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    metaAdapter = makeAdapter();
    googleAdapter = makeAdapter();
    tiktokAdapter = makeAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdsGatewayService,
        { provide: MetaAdsAdapter, useValue: metaAdapter },
        { provide: GoogleAdsAdapter, useValue: googleAdapter },
        { provide: TikTokAdsAdapter, useValue: tiktokAdapter },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(AdsGatewayService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── getAdapter ────────────────────────────────────────────────────────────

  describe('getAdapter', () => {
    it('returns the meta adapter', () => {
      expect(service.getAdapter('meta')).toBe(metaAdapter);
    });

    it('returns the google adapter', () => {
      expect(service.getAdapter('google')).toBe(googleAdapter);
    });

    it('returns the tiktok adapter', () => {
      expect(service.getAdapter('tiktok')).toBe(tiktokAdapter);
    });

    it('throws BadRequestException for unsupported platform', () => {
      expect(() => service.getAdapter('unknown' as never)).toThrow(
        BadRequestException,
      );
    });
  });

  // ── comparePlatforms ──────────────────────────────────────────────────────

  describe('comparePlatforms', () => {
    it('aggregates metrics across platforms', async () => {
      metaAdapter.listCampaigns.mockResolvedValue([{ id: 'c1' }] as never);
      metaAdapter.getCampaignInsights.mockResolvedValue(
        buildInsights(100, 10000, 500) as never,
      );

      const result = await service.comparePlatforms([
        { ctx: mockCtx, platform: 'meta' },
      ]);

      expect(result.platforms).toHaveLength(1);
      const meta = result.platforms[0];
      expect(meta.platform).toBe('meta');
      expect(meta.totalSpend).toBe(100);
      expect(meta.totalImpressions).toBe(10000);
      expect(meta.totalClicks).toBe(500);
    });

    it('selects best performer by ROAS when available', async () => {
      metaAdapter.listCampaigns.mockResolvedValue([{ id: 'c1' }] as never);
      metaAdapter.getCampaignInsights.mockResolvedValue(
        buildInsights(100, 5000, 300, 4.5) as never,
      );

      googleAdapter.listCampaigns.mockResolvedValue([{ id: 'g1' }] as never);
      googleAdapter.getCampaignInsights.mockResolvedValue(
        buildInsights(200, 8000, 600, 2.0) as never,
      );

      const result = await service.comparePlatforms([
        { ctx: mockCtx, platform: 'meta' },
        { ctx: mockCtx, platform: 'google' },
      ]);

      expect(result.bestPerformer.platform).toBe('meta');
      expect(result.bestPerformer.metric).toBe('roas');
    });

    it('falls back to CTR when no ROAS data is available', async () => {
      metaAdapter.listCampaigns.mockResolvedValue([{ id: 'c1' }] as never);
      metaAdapter.getCampaignInsights.mockResolvedValue(
        buildInsights(100, 2000, 200) as never, // CTR = 10%
      );

      googleAdapter.listCampaigns.mockResolvedValue([{ id: 'g1' }] as never);
      googleAdapter.getCampaignInsights.mockResolvedValue(
        buildInsights(100, 5000, 100) as never, // CTR = 2%
      );

      const result = await service.comparePlatforms([
        { ctx: mockCtx, platform: 'meta' },
        { ctx: mockCtx, platform: 'google' },
      ]);

      expect(result.bestPerformer.platform).toBe('meta');
      expect(result.bestPerformer.metric).toBe('ctr');
    });

    it('returns empty platforms and default best performer when all fail', async () => {
      metaAdapter.listCampaigns.mockRejectedValue(new Error('API error'));

      const result = await service.comparePlatforms([
        { ctx: mockCtx, platform: 'meta' },
      ]);

      expect(result.platforms).toHaveLength(0);
      expect(result.bestPerformer.metric).toBe('none');
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('handles zero campaigns gracefully', async () => {
      metaAdapter.listCampaigns.mockResolvedValue([] as never);

      const result = await service.comparePlatforms([
        { ctx: mockCtx, platform: 'meta' },
      ]);

      expect(result.platforms[0]).toMatchObject({
        campaignCount: 0,
        totalClicks: 0,
        totalSpend: 0,
      });
    });

    it('computes avgCpc as zero when no clicks', async () => {
      metaAdapter.listCampaigns.mockResolvedValue([{ id: 'c1' }] as never);
      metaAdapter.getCampaignInsights.mockResolvedValue(
        buildInsights(50, 1000, 0) as never,
      );

      const result = await service.comparePlatforms([
        { ctx: mockCtx, platform: 'meta' },
      ]);

      expect(result.platforms[0].avgCpc).toBe(0);
    });
  });
});
