import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import type { AdsAdapterContext } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { MetaAdsAdapter } from './meta-ads.adapter';

const mockCtx: AdsAdapterContext = {
  accessToken: 'tok-abc',
  adAccountId: 'act_123456',
  credentialId: 'credential-1',
  organizationId: 'org-1',
};

describe('MetaAdsAdapter', () => {
  let adapter: MetaAdsAdapter;
  let metaAdsService: vi.Mocked<MetaAdsService>;

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
            getAdInsights: vi.fn(),
            getAdSetInsights: vi.fn(),
            getCampaignInsights: vi.fn(),
            getTopPerformers: vi.fn(),
            listAdSets: vi.fn(),
            listAds: vi.fn(),
            listCampaigns: vi.fn(),
            pauseCampaign: vi.fn(),
            updateCampaign: vi.fn(),
          },
        },
      ],
    }).compile();

    adapter = module.get(MetaAdsAdapter);
    metaAdsService = module.get(MetaAdsService);
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

  // ── getAdSetInsights ──────────────────────────────────────────────────────

  describe('getAdSetInsights', () => {
    it('forwards the date preset and returns unified insights', async () => {
      metaAdsService.getAdSetInsights.mockResolvedValue([
        {
          clicks: 120,
          conversions: 4,
          cpc: 0.6,
          cpm: 6,
          ctr: 2.4,
          dateStart: '2026-03-01',
          dateStop: '2026-03-15',
          impressions: 5000,
          spend: 72,
        },
      ] as never);

      const result = await adapter.getAdSetInsights(mockCtx, 'as1', {
        datePreset: 'last_7d',
      });

      expect(metaAdsService.getAdSetInsights).toHaveBeenCalledWith(
        mockCtx.accessToken,
        'as1',
        { datePreset: 'last_7d', timeRange: undefined },
      );
      expect(result).toMatchObject({
        clicks: 120,
        impressions: 5000,
        platform: 'meta',
        spend: 72,
      });
    });

    it('returns empty insights when no data rows', async () => {
      metaAdsService.getAdSetInsights.mockResolvedValue([] as never);

      const result = await adapter.getAdSetInsights(mockCtx, 'as1');

      expect(result).toMatchObject({ clicks: 0, impressions: 0, spend: 0 });
    });
  });

  // ── getAdInsights ─────────────────────────────────────────────────────────

  describe('getAdInsights', () => {
    it('forwards a custom time range and returns unified insights', async () => {
      metaAdsService.getAdInsights.mockResolvedValue([
        {
          clicks: 30,
          conversions: 1,
          cpc: 0.5,
          cpm: 5,
          ctr: 3,
          dateStart: '2026-03-01',
          dateStop: '2026-03-07',
          impressions: 1000,
          spend: 15,
        },
      ] as never);

      const timeRange = { since: '2026-03-01', until: '2026-03-07' };
      const result = await adapter.getAdInsights(mockCtx, 'ad1', { timeRange });

      expect(metaAdsService.getAdInsights).toHaveBeenCalledWith(
        mockCtx.accessToken,
        'ad1',
        { datePreset: undefined, timeRange },
      );
      expect(result).toMatchObject({
        clicks: 30,
        impressions: 1000,
        platform: 'meta',
        spend: 15,
      });
    });

    it('returns empty insights when no data rows', async () => {
      metaAdsService.getAdInsights.mockResolvedValue([] as never);

      const result = await adapter.getAdInsights(mockCtx, 'ad1');

      expect(result).toMatchObject({ clicks: 0, impressions: 0, spend: 0 });
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
      expect(metaAdsService.createCampaign).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ status: 'PAUSED' }),
      );
    });

    it('sends the paused status even when the caller omits one', async () => {
      metaAdsService.createCampaign.mockResolvedValue(
        'new-campaign-id' as never,
      );

      await adapter.createCampaign(mockCtx, {
        name: 'New Campaign',
        objective: 'CONVERSIONS',
      } as never);

      expect(metaAdsService.createCampaign).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ status: 'PAUSED' }),
      );
    });

    it.each(['ACTIVE', 'active', 'paused', 'ARCHIVED', ''])(
      'rejects creation with status "%s" without calling the provider',
      async (status) => {
        await expect(
          adapter.createCampaign(mockCtx, {
            name: 'Activating Campaign',
            objective: 'CONVERSIONS',
            status,
          } as never),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(metaAdsService.createCampaign).not.toHaveBeenCalled();
      },
    );
  });

  // ── updateCampaign ────────────────────────────────────────────────────────

  describe('updateCampaign', () => {
    it('leaves an omitted status omitted', async () => {
      metaAdsService.updateCampaign.mockResolvedValue(undefined as never);

      await adapter.updateCampaign(mockCtx, 'c1', { name: 'Renamed' } as never);

      expect(metaAdsService.updateCampaign).toHaveBeenCalledWith(
        expect.anything(),
        'c1',
        expect.objectContaining({ status: undefined }),
      );
    });

    it.each(['ACTIVE', 'active', 'paused'])(
      'rejects an update with status "%s" without calling the provider',
      async (status) => {
        await expect(
          adapter.updateCampaign(mockCtx, 'c1', { status } as never),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(metaAdsService.updateCampaign).not.toHaveBeenCalled();
      },
    );
  });

  // ── listAdSets ────────────────────────────────────────────────────────────

  describe('listAdSets', () => {
    const providerError = new Error('Meta Graph ad-set listing failed');

    it('maps provider ad sets one-for-one with Meta platform and campaign identity', async () => {
      metaAdsService.listAdSets.mockResolvedValue([
        {
          campaignId: 'c1',
          id: 'as1',
          name: 'Ad Set One',
          status: 'ACTIVE',
        },
        {
          campaignId: 'c1',
          id: 'as2',
          name: 'Ad Set Two',
          status: 'PAUSED',
        },
      ] as never);

      const result = await adapter.listAdSets(mockCtx, 'c1');

      expect(metaAdsService.listAdSets).toHaveBeenCalledTimes(1);
      expect(metaAdsService.listAdSets).toHaveBeenCalledWith(
        mockCtx.accessToken,
        mockCtx.adAccountId,
        'c1',
      );
      expect(result).toEqual([
        {
          campaignId: 'c1',
          id: 'as1',
          name: 'Ad Set One',
          platform: 'meta',
          status: 'ACTIVE',
        },
        {
          campaignId: 'c1',
          id: 'as2',
          name: 'Ad Set Two',
          platform: 'meta',
          status: 'PAUSED',
        },
      ]);
    });

    it('returns an empty unified collection when the provider has no ad sets', async () => {
      metaAdsService.listAdSets.mockResolvedValue([] as never);

      const result = await adapter.listAdSets(mockCtx, 'c1');

      expect(metaAdsService.listAdSets).toHaveBeenCalledTimes(1);
      expect(metaAdsService.listAdSets).toHaveBeenCalledWith(
        mockCtx.accessToken,
        mockCtx.adAccountId,
        'c1',
      );
      expect(result).toEqual([]);
    });

    it('propagates the established provider error instead of a synthetic empty collection', async () => {
      metaAdsService.listAdSets.mockRejectedValue(providerError);

      await expect(adapter.listAdSets(mockCtx, 'c1')).rejects.toBe(
        providerError,
      );

      expect(metaAdsService.listAdSets).toHaveBeenCalledTimes(1);
    });
  });

  // ── listAds ───────────────────────────────────────────────────────────────

  describe('listAds', () => {
    const providerError = new Error('Meta Graph ad listing failed');

    it('scopes a filtered listing to the supplied ad set and maps parent identity', async () => {
      metaAdsService.listAds.mockResolvedValue([
        {
          adSetId: 'as1',
          id: 'ad1',
          name: 'Ad One',
          status: 'ACTIVE',
        },
        {
          adSetId: 'as1',
          id: 'ad2',
          name: 'Ad Two',
          status: 'PAUSED',
        },
      ] as never);

      const result = await adapter.listAds(mockCtx, 'as1');

      expect(metaAdsService.listAds).toHaveBeenCalledTimes(1);
      expect(metaAdsService.listAds).toHaveBeenCalledWith(
        mockCtx.accessToken,
        mockCtx.adAccountId,
        'as1',
      );
      expect(result).toEqual([
        {
          adSetId: 'as1',
          id: 'ad1',
          name: 'Ad One',
          platform: 'meta',
          status: 'ACTIVE',
        },
        {
          adSetId: 'as1',
          id: 'ad2',
          name: 'Ad Two',
          platform: 'meta',
          status: 'PAUSED',
        },
      ]);
    });

    it('preserves each provider-reported parent ad-set identifier when unfiltered', async () => {
      metaAdsService.listAds.mockResolvedValue([
        {
          adSetId: 'as-a',
          id: 'ad1',
          name: 'Ad One',
          status: 'ACTIVE',
        },
        {
          adSetId: 'as-b',
          id: 'ad2',
          name: 'Ad Two',
          status: 'PAUSED',
        },
      ] as never);

      const result = await adapter.listAds(mockCtx);

      expect(metaAdsService.listAds).toHaveBeenCalledTimes(1);
      expect(metaAdsService.listAds).toHaveBeenCalledWith(
        mockCtx.accessToken,
        mockCtx.adAccountId,
        undefined,
      );
      expect(result).toEqual([
        {
          adSetId: 'as-a',
          id: 'ad1',
          name: 'Ad One',
          platform: 'meta',
          status: 'ACTIVE',
        },
        {
          adSetId: 'as-b',
          id: 'ad2',
          name: 'Ad Two',
          platform: 'meta',
          status: 'PAUSED',
        },
      ]);
    });

    it('returns an empty unified collection when the provider has no ads', async () => {
      metaAdsService.listAds.mockResolvedValue([] as never);

      const result = await adapter.listAds(mockCtx);

      expect(metaAdsService.listAds).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });

    it('propagates the established provider error instead of a synthetic empty collection', async () => {
      metaAdsService.listAds.mockRejectedValue(providerError);

      await expect(adapter.listAds(mockCtx)).rejects.toBe(providerError);

      expect(metaAdsService.listAds).toHaveBeenCalledTimes(1);
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
