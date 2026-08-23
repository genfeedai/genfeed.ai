import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { testId } from '@helpers/testing/test-id.helper';
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
    createWorkflow: vi.fn(),
  };
  const harnessGenerationService = {
    formatBrief: vi.fn(),
    resolveBrief: vi.fn(),
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
      harnessGenerationService as never,
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
      brandId: undefined,
      industry: 'fitness',
      limit: 24,
      metric: 'performanceScore',
      organizationId: 'org-1',
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
      'org-1',
      undefined,
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
      organizationId: 'org-1',
      platform: 'tiktok',
      scope: 'public',
    });
  });

  it.each(['x_ads', 'x', 'twitter'])(
    'normalizes stored %s rows onto the x research platform',
    async (storedPlatform) => {
      adPerformanceService.findPublicById.mockResolvedValue(
        buildPublicAd({ adPlatform: storedPlatform, id: 'public-x-ad' }),
      );

      const result = await service.getAdDetail('org-1', {
        id: 'public-x-ad',
        source: 'public',
      });

      expect(result).toMatchObject({ platform: 'x', source: 'public' });
      // Creative patterns are keyed by the storage platform name, which is
      // `x_ads` for X (unlike meta → facebook, google → google_ads).
      expect(creativePatternsService.findAll).toHaveBeenCalledWith({
        organizationId: 'org-1',
        platform: 'x_ads',
        scope: 'public',
      });
    },
  );

  it('normalizes public x top-performer filters before querying ad performance', async () => {
    await service.listAds('org-1', {
      industry: 'fitness',
      limit: 999,
      metric: 'spendEfficiency',
      platform: 'x',
      source: 'public',
    });

    expect(adPerformanceService.findTopPerformers).toHaveBeenCalledWith({
      adPlatform: 'x',
      brandId: undefined,
      industry: 'fitness',
      limit: 24,
      metric: 'performanceScore',
      organizationId: 'org-1',
      scope: 'public',
    });
    expect(adsGatewayService.getAdapter).not.toHaveBeenCalled();
  });

  it('returns a disclosure-only presentation without repository creative copy', async () => {
    adPerformanceService.findPublicById.mockResolvedValue(
      buildPublicAd({
        adPlatform: 'x',
        advertiserHandle: 'example_ads',
        advertiserName: 'Example advertiser',
        bodyText: 'X ad body',
        ctaText: 'Follow now',
        estimatedReach: 150,
        headlineText: 'X hook',
        id: 'public-x-ad-detail',
        imageUrls: ['https://media.example/raw.jpg'],
        landingPageUrl: 'https://example.com/x-landing',
        researchSource: 'x_ads_repository',
        videoUrls: ['https://media.example/raw.mp4'],
      }),
    );

    const result = await service.getAdDetail('org-1', {
      id: 'public-x-ad-detail',
      source: 'public',
    });

    expect(adPerformanceService.findPublicById).toHaveBeenCalledWith(
      'public-x-ad-detail',
      'org-1',
      undefined,
    );
    expect(result).toMatchObject({
      creative: {
        imageUrls: [],
        videoUrls: [],
      },
      imageUrls: [],
      metricLabel: 'Estimated reach',
      metricValue: 150,
      platform: 'x',
      source: 'public',
      sourceLabel: 'X Ads Repository disclosure',
      usagePolicy: 'disclosure_only',
      videoUrls: [],
    });
    expect(JSON.stringify(result)).not.toContain('X ad body');
    expect(JSON.stringify(result)).not.toContain('X hook');
    expect(JSON.stringify(result)).not.toContain('raw.jpg');
    expect(JSON.stringify(result)).not.toContain('raw.mp4');
  });

  it('carries the active brand through list and detail repository reads', async () => {
    adPerformanceService.findPublicById.mockResolvedValue(buildPublicAd());

    await service.listAds('org-1', {
      brandId: 'brand-1',
      platform: 'x',
      source: 'public',
    });
    await service.getAdDetail('org-1', {
      brandId: 'brand-1',
      id: 'repository-ad',
      source: 'public',
    });

    expect(adPerformanceService.findTopPerformers).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', organizationId: 'org-1' }),
    );
    expect(adPerformanceService.findPublicById).toHaveBeenCalledWith(
      'repository-ad',
      'org-1',
      'brand-1',
    );
  });

  it('returns zero foreign-brand detail and performs no remix work', async () => {
    adPerformanceService.findPublicById.mockResolvedValue(null);

    await expect(
      service.createRemixWorkflow({
        adId: 'brand-2-repository-ad',
        brandId: 'brand-1',
        organizationId: 'org-1',
        source: 'public',
        userId: 'user-1',
      }),
    ).rejects.toThrow('was not found');

    expect(adPerformanceService.findPublicById).toHaveBeenCalledWith(
      'brand-2-repository-ad',
      'org-1',
      'brand-1',
    );
    expect(harnessGenerationService.resolveBrief).not.toHaveBeenCalled();
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('blocks repository remix before harness or workflow generation', async () => {
    adPerformanceService.findPublicById.mockResolvedValue(
      buildPublicAd({
        adPlatform: 'x',
        brandId: 'brand-1',
        researchSource: 'x_ads_repository',
        scope: 'organization',
      }),
    );

    await expect(
      service.createRemixWorkflow({
        adId: 'repository-ad',
        brandId: 'brand-1',
        organizationId: 'org-1',
        source: 'public',
        userId: 'user-1',
      }),
    ).rejects.toThrow('disclosure-only');

    expect(harnessGenerationService.resolveBrief).not.toHaveBeenCalled();
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('serves connected TikTok ads through the platform-generic gateway adapter', async () => {
    const credentialId = testId('credential');
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
    expect(credentialsService.findOne).toHaveBeenCalledWith({
      id: credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId: 'org-1',
      platform: 'TIKTOK',
    });
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
