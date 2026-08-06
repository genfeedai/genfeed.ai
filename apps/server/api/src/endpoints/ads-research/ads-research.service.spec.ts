import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import type { AdPerformanceDocument } from '@server/collections/ad-performance/schemas/ad-performance.schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => `decrypted:${value}`),
  },
}));

const buildPublicAd = (
  overrides: Partial<AdPerformanceDocument> = {},
): AdPerformanceDocument =>
  ({
    adPlatform: 'meta',
    bodyText: 'Primary text',
    brandId: null,
    campaignName: 'Public campaign',
    conversionRate: 0.07,
    cpa: 11,
    cpc: 1.1,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    credentialId: null,
    ctr: 0.04,
    ctaPatternCategories: [],
    ctaText: 'Shop now',
    data: {},
    dataConfidence: 0.9,
    headlinePatternCategories: [],
    headlineText: 'Save today',
    id: 'public-ad',
    industry: 'fitness',
    isDeleted: false,
    organizationId: 'org-public',
    performanceScore: 91,
    roas: 3.4,
    scope: 'public',
    spend: 120,
    spendBucket: '$50-200/day',
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    ...overrides,
  }) as AdPerformanceDocument;

describe('AdsResearchService', () => {
  const adPerformanceService = {
    findById: vi.fn(),
    findPublicById: vi.fn(),
    findTopPerformers: vi.fn(),
  };
  const creativePatternsService = {
    findAll: vi.fn(),
  };
  const credentialsService = {
    findOne: vi.fn(),
  };
  const adsGatewayService = {
    getAdapter: vi.fn(),
  };
  const workflowsService = {
    create: vi.fn(),
  };

  let service: AdsResearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    adPerformanceService.findTopPerformers.mockResolvedValue([]);
    creativePatternsService.findAll.mockResolvedValue([]);

    service = new AdsResearchService(
      adPerformanceService as never,
      creativePatternsService as never,
      credentialsService as never,
      adsGatewayService as never,
      workflowsService as never,
    );
  });

  it('normalizes public top-performer filters before querying ad performance', async () => {
    await service.listAds('org-1', {
      industry: 'fitness',
      limit: 999,
      metric: 'spendEfficiency',
      platform: 'meta',
      source: 'public',
    });

    expect(adPerformanceService.findTopPerformers).toHaveBeenCalledWith({
      adPlatform: 'meta',
      industry: 'fitness',
      limit: 24,
      metric: 'performanceScore',
      scope: 'public',
    });
    expect(adsGatewayService.getAdapter).not.toHaveBeenCalled();
  });

  it('uses a public-scoped lookup for public ad detail', async () => {
    adPerformanceService.findPublicById.mockResolvedValue(buildPublicAd());

    const result = await service.getAdDetail('org-1', {
      id: 'public-ad',
      source: 'public',
    });

    expect(adPerformanceService.findPublicById).toHaveBeenCalledWith(
      'public-ad',
    );
    expect(adPerformanceService.findById).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'public-ad',
      platform: 'meta',
      source: 'public',
      title: 'Public campaign',
    });
  });

  it('normalizes stored tiktok_ads rows onto the tiktok research platform', async () => {
    adPerformanceService.findPublicById.mockResolvedValue(
      buildPublicAd({ adPlatform: 'tiktok_ads', id: 'public-tiktok-ad' }),
    );

    const result = await service.getAdDetail('org-1', {
      id: 'public-tiktok-ad',
      source: 'public',
    });

    expect(result).toMatchObject({ platform: 'tiktok', source: 'public' });
    // Creative patterns are keyed by the storage platform name, which is
    // `tiktok` for TikTok (unlike meta → facebook, google → google_ads).
    expect(creativePatternsService.findAll).toHaveBeenCalledWith({
      platform: 'tiktok',
      scope: 'public',
    });
  });

  it('serves connected TikTok ads through the platform-generic gateway adapter', async () => {
    const credentialId = '0123456789abcdef01234567';
    credentialsService.findOne.mockResolvedValue({
      accessToken: 'sealed-token',
    });
    const adapter = {
      getTopPerformers: vi.fn().mockResolvedValue([
        {
          id: 'ad-1',
          insights: { clicks: 40, ctr: 0.05, spend: 90 },
          metric: 'ctr',
          name: 'Hook A',
          value: 0.05,
        },
      ]),
      listAds: vi.fn().mockResolvedValue([
        {
          creative: { body: 'Body', title: 'Hook A' },
          id: 'ad-1',
        },
      ]),
    };
    adsGatewayService.getAdapter.mockReturnValue(adapter);

    const result = await service.listAds('org-1', {
      adAccountId: 'advertiser-1',
      credentialId,
      platform: 'tiktok',
      source: 'my_accounts',
    });

    expect(adsGatewayService.getAdapter).toHaveBeenCalledWith('tiktok');
    expect(result.summary.selectedPlatform).toBe('tiktok');
    expect(result.connectedAds).toHaveLength(1);
    expect(result.connectedAds[0]).toMatchObject({
      accountName: 'Connected TikTok Ads account',
      channel: 'all',
      id: 'connected:tiktok:ad-1',
    });
    expect(result.connectedAds[0].explanation).toContain('TikTok Ads');
  });
});
