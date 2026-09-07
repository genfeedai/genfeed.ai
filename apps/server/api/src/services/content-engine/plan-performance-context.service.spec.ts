import type { WeeklySummary } from '@api/collections/content-performance/services/performance-summary.service';
import {
  PLAN_PERFORMANCE_WINDOW_DAYS,
  PlanPerformanceContextService,
} from '@api/services/content-engine/plan-performance-context.service';

function makeSummary(overrides: Partial<WeeklySummary> = {}): WeeklySummary {
  return {
    avgEngagementByContentType: [],
    avgEngagementByPlatform: [],
    bestPostingTimes: [],
    dataset: {
      confidence: 'none',
      genfeedPosts: 0,
      importedPosts: 0,
      totalPosts: 0,
    },
    topHooks: [],
    topPerformers: [],
    weekOverWeekTrend: {
      currentEngagement: 0,
      direction: 'stable',
      percentageChange: 0,
      previousEngagement: 0,
    },
    worstPerformers: [],
    ...overrides,
  };
}

describe('PlanPerformanceContextService', () => {
  const performanceSummaryService = { getWeeklySummary: vi.fn() };
  const adPerformanceService = {
    findByWatchedAdvertisers: vi.fn(),
    findTopPerformers: vi.fn(),
  };
  const patternMatcherService = { getTopPatternsForBrand: vi.fn() };
  const sourcePostsService = { getWeeklyCorpus: vi.fn() };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const params = { brandId: 'brand-1', organizationId: 'org-1' };

  let service: PlanPerformanceContextService;

  beforeEach(() => {
    vi.clearAllMocks();
    performanceSummaryService.getWeeklySummary.mockResolvedValue(makeSummary());
    adPerformanceService.findTopPerformers.mockResolvedValue([]);
    adPerformanceService.findByWatchedAdvertisers.mockResolvedValue([]);
    patternMatcherService.getTopPatternsForBrand.mockResolvedValue([]);
    sourcePostsService.getWeeklyCorpus.mockResolvedValue({
      corpus: '',
      count: 0,
      posts: [],
    });
    service = new PlanPerformanceContextService(
      performanceSummaryService as never,
      adPerformanceService as never,
      patternMatcherService as never,
      sourcePostsService as never,
      logger as never,
    );
  });

  it('reads a 30-day window and falls back to a foundational brief with no data at all', async () => {
    const context = await service.build(params);

    const options = performanceSummaryService.getWeeklySummary.mock.calls[0][2];
    const ageDays =
      (Date.now() - new Date(options.startDate).getTime()) / 86_400_000;
    expect(Math.round(ageDays)).toBe(PLAN_PERFORMANCE_WINDOW_DAYS);
    expect(context.isColdStart).toBe(true);
    expect(context.dataset.totalPosts).toBe(0);
    expect(context.section).toContain(
      'Cold start: this brand has no post history yet',
    );
  });

  it('seeds a cold start from competitor ads, patterns and followed creators', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue(
      makeSummary({
        dataset: {
          confidence: 'low',
          genfeedPosts: 0,
          importedPosts: 2,
          totalPosts: 2,
        },
        topPerformers: [
          {
            comments: 1,
            description: 'Imported caption',
            engagementRate: 3.5,
            likes: 10,
            origin: 'imported',
            platform: 'instagram',
            postId: 'sp-1',
            saves: 0,
            shares: 0,
            sourcePostId: 'sp-1',
            title: 'Imported caption',
            views: 300,
          },
        ],
      }),
    );
    adPerformanceService.findTopPerformers.mockResolvedValue([
      {
        adPlatform: 'meta',
        advertiserName: 'Rival Co',
        bodyText: 'Ship faster with our OS.',
        ctaText: 'Try free',
        headlineText: 'Stop scrolling, start shipping',
        performanceScore: 91.4,
      },
      { headlineText: null, bodyText: undefined },
    ]);
    patternMatcherService.getTopPatternsForBrand.mockResolvedValue([
      {
        examples: [{ text: 'Nobody tells you this about launches' }],
        formula: 'Contrarian hook + proof + CTA',
        label: 'Contrarian opener',
      },
    ]);
    sourcePostsService.getWeeklyCorpus.mockResolvedValue({
      corpus: '1. @creator: How I plan a week of content in 20 minutes',
      count: 1,
      posts: [{ id: 'sp-9' }],
    });

    const context = await service.build(params);

    expect(context.isColdStart).toBe(true);
    expect(adPerformanceService.findTopPerformers).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        metric: 'performanceScore',
        organizationId: 'org-1',
      }),
    );
    expect(sourcePostsService.getWeeklyCorpus).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      PLAN_PERFORMANCE_WINDOW_DAYS,
      10,
      { sourceTypes: ['account'] },
    );
    expect(context.section).toContain(
      'Own history (last 30 days): 0 Genfeed posts and 2 imported posts',
    );
    expect(context.section).toContain(
      '"Imported caption" on instagram, imported from your account (3.50% engagement)',
    );
    expect(context.section).toContain('Cold start: only 2 own posts');
    expect(context.section).toContain(
      '"Stop scrolling, start shipping" — Ship faster with our OS. [CTA: Try free] (by Rival Co, on meta, score 91)',
    );
    expect(context.section).toContain(
      'Contrarian opener: Contrarian hook + proof + CTA (e.g. "Nobody tells you this about launches")',
    );
    expect(context.section).toContain('How I plan a week of content');
    expect(context.section).toContain('never copy competitor copy verbatim');
  });

  it('skips the cold-start sources once own history is sufficient', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue(
      makeSummary({
        avgEngagementByPlatform: [
          { avgEngagementRate: 6.5, platform: 'tiktok', totalPosts: 12 },
        ],
        bestPostingTimes: [{ avgEngagementRate: 7, hour: 18, postCount: 4 }],
        dataset: {
          confidence: 'high',
          genfeedPosts: 20,
          importedPosts: 5,
          totalPosts: 25,
        },
        topHooks: ['Three mistakes I made'],
      }),
    );

    const context = await service.build(params);

    expect(context.isColdStart).toBe(false);
    expect(adPerformanceService.findTopPerformers).not.toHaveBeenCalled();
    expect(patternMatcherService.getTopPatternsForBrand).not.toHaveBeenCalled();
    expect(context.section).toContain(
      'Best platforms by engagement: tiktok 6.50%',
    );
    expect(context.section).toContain('Best posting hours: 18:00 UTC');
    expect(context.section).toContain(
      'Hooks that worked: "Three mistakes I made"',
    );
    expect(context.section).not.toContain('Cold start');
  });

  it('narrows competitor ads to the selected watched advertisers', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue(
      makeSummary({
        dataset: {
          confidence: 'low',
          genfeedPosts: 0,
          importedPosts: 1,
          totalPosts: 1,
        },
      }),
    );
    adPerformanceService.findByWatchedAdvertisers.mockResolvedValue([
      {
        adPlatform: 'meta',
        advertiserName: 'Chosen Advertiser',
        headlineText: 'Chosen headline',
      },
    ]);

    const context = await service.build({
      ...params,
      seeds: { advertiserIds: ['adv-1', 'adv-2'] },
    });

    expect(adPerformanceService.findByWatchedAdvertisers).toHaveBeenCalledWith({
      advertiserIds: ['adv-1', 'adv-2'],
      brandId: 'brand-1',
      limit: 5,
      organizationId: 'org-1',
    });
    expect(adPerformanceService.findTopPerformers).not.toHaveBeenCalled();
    expect(context.section).toContain('Chosen headline');
  });

  it('narrows the followed-creator corpus to the selected sources', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue(
      makeSummary({
        dataset: {
          confidence: 'low',
          genfeedPosts: 0,
          importedPosts: 1,
          totalPosts: 1,
        },
      }),
    );
    sourcePostsService.getWeeklyCorpus.mockResolvedValue({
      corpus: 'chosen source corpus',
      count: 1,
      posts: [{ id: 'sp-1' }],
    });

    await service.build({
      ...params,
      seeds: { sourceIds: ['source-1'] },
    });

    expect(sourcePostsService.getWeeklyCorpus).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      PLAN_PERFORMANCE_WINDOW_DAYS,
      10,
      { sourceIds: ['source-1'] },
    );
  });

  it('skips creative patterns when isPatternsIncluded is false', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue(
      makeSummary({
        dataset: {
          confidence: 'low',
          genfeedPosts: 0,
          importedPosts: 1,
          totalPosts: 1,
        },
      }),
    );

    await service.build({
      ...params,
      seeds: { isPatternsIncluded: false },
    });

    expect(patternMatcherService.getTopPatternsForBrand).not.toHaveBeenCalled();
  });

  it('omits the own-history section when isImportedHistoryIncluded is false', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue(
      makeSummary({
        dataset: {
          confidence: 'high',
          genfeedPosts: 20,
          importedPosts: 5,
          totalPosts: 25,
        },
        topHooks: ['Three mistakes I made'],
      }),
    );

    const context = await service.build({
      ...params,
      seeds: { isImportedHistoryIncluded: false },
    });

    expect(context.dataset.totalPosts).toBe(25);
    expect(context.section).not.toContain('Own history');
  });

  it('degrades to an empty section when every source fails', async () => {
    performanceSummaryService.getWeeklySummary.mockRejectedValue(
      new Error('summary down'),
    );
    adPerformanceService.findTopPerformers.mockRejectedValue(new Error('ads'));
    patternMatcherService.getTopPatternsForBrand.mockRejectedValue(
      new Error('patterns'),
    );
    sourcePostsService.getWeeklyCorpus.mockRejectedValue(new Error('corpus'));

    const context = await service.build(params);

    expect(context.isColdStart).toBe(true);
    expect(context.dataset.confidence).toBe('none');
    expect(context.section).toContain(
      'Cold start: this brand has no post history yet',
    );
    expect(logger.warn).toHaveBeenCalledTimes(4);
  });
});
