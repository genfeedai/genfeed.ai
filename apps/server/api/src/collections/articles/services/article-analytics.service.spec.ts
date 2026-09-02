vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('ArticleAnalyticsService', () => {
  const aggregate = vi.fn();
  const findFirst = vi.fn();
  const service = new ArticleAnalyticsService(
    {
      articleAnalytics: { aggregate, findFirst },
    } as unknown as PrismaService,
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates the summary without loading daily rows', async () => {
    const updatedAt = new Date('2026-08-28T00:00:00.000Z');
    aggregate.mockResolvedValue({
      _avg: { engagementRate: 0.35 },
      _max: {
        totalComments: 8,
        totalLikes: 40,
        totalShares: 5,
        totalViews: 200,
      },
    });
    findFirst.mockResolvedValue({ updatedAt });

    await expect(
      service.getArticleAnalyticsSummary('article-1', 'org-1'),
    ).resolves.toEqual({
      avgClickThroughRate: 0,
      avgEngagementRate: 0.35,
      lastUpdated: updatedAt,
      totalComments: 8,
      totalLikes: 40,
      totalShares: 5,
      totalViews: 200,
    });
    expect(aggregate).toHaveBeenCalledWith({
      _avg: { engagementRate: true },
      _max: {
        totalComments: true,
        totalLikes: true,
        totalShares: true,
        totalViews: true,
      },
      where: {
        articleId: 'article-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(findFirst).toHaveBeenCalledWith({
      orderBy: { date: 'desc' },
      select: { updatedAt: true },
      where: {
        articleId: 'article-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('returns an empty summary when no analytics row exists', async () => {
    aggregate.mockResolvedValue({
      _avg: { engagementRate: null },
      _max: {
        totalComments: null,
        totalLikes: null,
        totalShares: null,
        totalViews: null,
      },
    });
    findFirst.mockResolvedValue(null);

    await expect(
      service.getArticleAnalyticsSummary('article-1', 'org-1'),
    ).resolves.toEqual({
      avgClickThroughRate: 0,
      avgEngagementRate: 0,
      totalComments: 0,
      totalLikes: 0,
      totalShares: 0,
      totalViews: 0,
    });
  });
});
