import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { TopPerformerPromptContextService } from '@api/collections/content-intelligence/services/top-performer-prompt-context.service';
import {
  type PerformanceContentItem,
  PerformanceSummaryService,
  type WeeklySummary,
} from '@api/collections/content-performance/services/performance-summary.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

const ORG_ID = 'org-123';
const BRAND_ID = 'brand-123';

const makePerformanceItem = (
  overrides: Partial<PerformanceContentItem>,
): PerformanceContentItem => ({
  comments: 0,
  description: '',
  engagementRate: 0,
  likes: 0,
  platform: 'linkedin',
  postId: 'post-1',
  saves: 0,
  shares: 0,
  title: 'Default post',
  views: 0,
  ...overrides,
});

const makeSummary = (
  overrides: Partial<WeeklySummary> = {},
): WeeklySummary => ({
  avgEngagementByContentType: [],
  avgEngagementByPlatform: [],
  bestPostingTimes: [],
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
});

describe('TopPerformerPromptContextService', () => {
  let service: TopPerformerPromptContextService;
  let brandMemoryService: { getInsights: ReturnType<typeof vi.fn> };
  let performanceSummaryService: { getWeeklySummary: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    brandMemoryService = {
      getInsights: vi.fn().mockResolvedValue([]),
    };
    performanceSummaryService = {
      getWeeklySummary: vi.fn().mockResolvedValue(makeSummary()),
    };

    const module = await Test.createTestingModule({
      providers: [
        TopPerformerPromptContextService,
        { provide: BrandMemoryService, useValue: brandMemoryService },
        {
          provide: PerformanceSummaryService,
          useValue: performanceSummaryService,
        },
      ],
    }).compile();

    service = module.get(TopPerformerPromptContextService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when no brand scope is available', async () => {
    const result = await service.assembleContext({
      organizationId: ORG_ID,
      platform: 'linkedin',
    });

    expect(result).toBeUndefined();
    expect(performanceSummaryService.getWeeklySummary).not.toHaveBeenCalled();
    expect(brandMemoryService.getInsights).not.toHaveBeenCalled();
  });

  it('assembles positive signals, anti-patterns, and brand memory insights', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue(
      makeSummary({
        avgEngagementByContentType: [
          { avgEngagementRate: 8.4, category: 'thread', totalPosts: 4 },
        ],
        bestPostingTimes: [{ avgEngagementRate: 7.2, hour: 9, postCount: 3 }],
        topHooks: ['Most creators miss this'],
        topPerformers: [
          makePerformanceItem({
            engagementRate: 12.5,
            platform: 'linkedin',
            title: 'Contrarian hook that won',
          }),
        ],
        worstPerformers: [
          makePerformanceItem({
            engagementRate: 0.8,
            platform: 'linkedin',
            title: 'Generic AI tips',
          }),
        ],
      }),
    );
    brandMemoryService.getInsights.mockResolvedValue([
      {
        category: 'hook',
        confidence: 0.8,
        insight: 'Founder-led teardown posts outperform generic tips.',
      },
    ]);

    const result = await service.assembleContext({
      brandId: BRAND_ID,
      organizationId: ORG_ID,
      platform: 'linkedin',
    });

    expect(result).toContain('## Historical Performance Context');
    expect(result).toContain('Most creators miss this');
    expect(result).toContain('thread formats');
    expect(result).toContain('9AM');
    expect(result).toContain('Contrarian hook that won');
    expect(result).toContain('Brand memory: [hook]');
    expect(result).toContain('## Historical Anti-Patterns');
    expect(result).toContain('Generic AI tips');
    expect(performanceSummaryService.getWeeklySummary).toHaveBeenCalledWith(
      ORG_ID,
      BRAND_ID,
      { topN: 5, worstN: 5 },
    );
    expect(brandMemoryService.getInsights).toHaveBeenCalledWith(
      ORG_ID,
      BRAND_ID,
      8,
    );
  });

  it('returns undefined when there is no usable historical context', async () => {
    const result = await service.assembleContext({
      brandId: BRAND_ID,
      organizationId: ORG_ID,
    });

    expect(result).toBeUndefined();
  });

  it('falls back to all-platform winners when requested platform has no rows', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue(
      makeSummary({
        topPerformers: [
          makePerformanceItem({
            engagementRate: 4.1,
            platform: 'twitter',
            title: 'Cross-platform winner',
          }),
        ],
      }),
    );

    const result = await service.assembleContext({
      brandId: BRAND_ID,
      organizationId: ORG_ID,
      platform: 'linkedin',
    });

    expect(result).toContain('Cross-platform winner');
  });
});
