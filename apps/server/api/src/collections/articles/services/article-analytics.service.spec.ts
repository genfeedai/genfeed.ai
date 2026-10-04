vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

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

describe('ArticleAnalyticsService tenant scope (CLOUD tenant guard)', () => {
  const guard =
    (model: string, operation: string) =>
    (args: unknown): void =>
      assertTenantScopedQuery({
        args,
        isCloud: true,
        model,
        operation,
        tenantModelNames: new Set(['Article', 'ArticleAnalytics']),
      });
  const articleRow = {
    brandId: 'brand-1',
    id: 'article-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };
  const article = {
    findFirst: vi.fn(async (args: unknown) => {
      guard('Article', 'findFirst')(args);
      return articleRow;
    }),
  };
  const articleAnalytics = {
    findFirst: vi.fn(async (args: unknown) => {
      guard('ArticleAnalytics', 'findFirst')(args);
      return null;
    }),
    findMany: vi.fn(async (args: unknown) => {
      guard('ArticleAnalytics', 'findMany')(args);
      return [];
    }),
    upsert: vi.fn(async (args: unknown) => {
      guard('ArticleAnalytics', 'upsert')(args);
      return { ...articleRow, totalViews: 10 };
    }),
  };
  const service = new ArticleAnalyticsService(
    { article, articleAnalytics } as unknown as PrismaService,
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService,
  );

  it('updates performance metrics under the request organization', async () => {
    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        service.updatePerformanceMetrics('article-1', 'org-1', { views: 10 }),
      ),
    ).resolves.toBeUndefined();

    expect(article.findFirst).toHaveBeenCalledWith({
      where: { id: 'article-1', isDeleted: false, organizationId: 'org-1' },
    });
  });

  it('reads a date range under the request organization', async () => {
    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        service.getAnalyticsByDateRange(
          'article-1',
          'org-1',
          new Date('2026-09-01'),
          new Date('2026-09-30'),
        ),
      ),
    ).resolves.toEqual([]);
  });

  it('does not touch an article from another organization', async () => {
    article.findFirst.mockImplementationOnce(async (args: unknown) => {
      guard('Article', 'findFirst')(args);
      return null as never;
    });

    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        service.findOrCreateTodayAnalytics('article-9', 'org-1', {}),
      ),
    ).rejects.toThrow();
    expect(articleAnalytics.upsert).not.toHaveBeenCalled();
  });
});
