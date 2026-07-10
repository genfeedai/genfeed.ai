import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import type { AdPerformanceDocument } from '@server/collections/ad-performance/schemas/ad-performance.schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildPublicAd = (
  overrides: Partial<AdPerformanceDocument> = {},
): AdPerformanceDocument =>
  ({
    _id: 'public-ad',
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
    mongoId: null,
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
});
