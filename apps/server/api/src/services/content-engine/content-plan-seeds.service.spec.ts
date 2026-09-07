import { ContentPlanSeedsService } from '@api/services/content-engine/content-plan-seeds.service';

describe('ContentPlanSeedsService', () => {
  const performanceSummaryService = { getWeeklySummary: vi.fn() };
  const adWatchedAdvertisersService = { findAllByAccount: vi.fn() };
  const adPerformanceService = { findByWatchedAdvertisers: vi.fn() };
  const socialSourcesService = { findAllScoped: vi.fn() };
  const sourcePostsService = { countRecentPostsBySource: vi.fn() };
  const patternMatcherService = { getTopPatternsForBrand: vi.fn() };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: ContentPlanSeedsService;

  beforeEach(() => {
    vi.clearAllMocks();
    performanceSummaryService.getWeeklySummary.mockResolvedValue({
      dataset: {
        confidence: 'low',
        genfeedPosts: 0,
        importedPosts: 2,
        totalPosts: 2,
      },
    });
    adWatchedAdvertisersService.findAllByAccount.mockResolvedValue([]);
    adPerformanceService.findByWatchedAdvertisers.mockResolvedValue([]);
    socialSourcesService.findAllScoped.mockResolvedValue({ docs: [] });
    sourcePostsService.countRecentPostsBySource.mockResolvedValue({});
    patternMatcherService.getTopPatternsForBrand.mockResolvedValue([]);

    service = new ContentPlanSeedsService(
      performanceSummaryService as never,
      adWatchedAdvertisersService as never,
      adPerformanceService as never,
      socialSourcesService as never,
      sourcePostsService as never,
      patternMatcherService as never,
      logger as never,
    );
  });

  it('flags cold start from dataset confidence and surfaces the imported post count', async () => {
    const preview = await service.buildPreview('org-1', 'brand-1');

    expect(preview.isColdStart).toBe(true);
    expect(preview.importedPostCount).toBe(2);
    expect(preview.dataset.totalPosts).toBe(2);
  });

  it('only surfaces watched advertisers with fresh research and groups ad counts per advertiser', async () => {
    adWatchedAdvertisersService.findAllByAccount.mockResolvedValue([
      {
        advertiserHandle: 'rival',
        advertiserName: 'Rival Co',
        freshnessState: 'fresh',
        id: 'adv-1',
        platform: 'meta',
      },
      {
        advertiserHandle: 'stale-rival',
        advertiserName: 'Stale Rival',
        freshnessState: 'stale',
        id: 'adv-2',
        platform: 'meta',
      },
    ]);
    adPerformanceService.findByWatchedAdvertisers.mockResolvedValue([
      { headlineText: 'Top headline', researchSnapshotKey: 'adv-1' },
      { headlineText: 'Second headline', researchSnapshotKey: 'adv-1' },
    ]);

    const preview = await service.buildPreview('org-1', 'brand-1');

    expect(adPerformanceService.findByWatchedAdvertisers).toHaveBeenCalledWith(
      expect.objectContaining({
        advertiserIds: ['adv-1'],
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    );
    expect(preview.advertisers).toEqual([
      {
        adCount: 2,
        id: 'adv-1',
        name: 'Rival Co',
        platform: 'meta',
        topHeadline: 'Top headline',
      },
    ]);
  });

  it('maps active social sources with their recent post counts', async () => {
    socialSourcesService.findAllScoped.mockResolvedValue({
      docs: [
        {
          displayName: 'Creator',
          handle: 'creator',
          id: 'source-1',
          platform: 'instagram',
          sourceType: 'account',
        },
      ],
    });
    sourcePostsService.countRecentPostsBySource.mockResolvedValue({
      'source-1': 7,
    });

    const preview = await service.buildPreview('org-1', 'brand-1');

    expect(preview.sources).toEqual([
      {
        displayName: 'Creator',
        handle: 'creator',
        id: 'source-1',
        platform: 'instagram',
        postCount: 7,
        sourceType: 'account',
      },
    ]);
  });

  it('reports the pattern count without listing the patterns', async () => {
    patternMatcherService.getTopPatternsForBrand.mockResolvedValue([
      { label: 'A' },
      { label: 'B' },
    ]);

    const preview = await service.buildPreview('org-1', 'brand-1');

    expect(preview.patternCount).toBe(2);
  });

  it('degrades to safe defaults when every source fails', async () => {
    performanceSummaryService.getWeeklySummary.mockRejectedValue(
      new Error('summary down'),
    );
    adWatchedAdvertisersService.findAllByAccount.mockRejectedValue(
      new Error('advertisers down'),
    );
    socialSourcesService.findAllScoped.mockRejectedValue(
      new Error('sources down'),
    );
    patternMatcherService.getTopPatternsForBrand.mockRejectedValue(
      new Error('patterns down'),
    );

    const preview = await service.buildPreview('org-1', 'brand-1');

    expect(preview).toEqual({
      advertisers: [],
      dataset: {
        confidence: 'none',
        genfeedPosts: 0,
        importedPosts: 0,
        totalPosts: 0,
      },
      importedPostCount: 0,
      isColdStart: true,
      patternCount: 0,
      sources: [],
    });
  });
});
