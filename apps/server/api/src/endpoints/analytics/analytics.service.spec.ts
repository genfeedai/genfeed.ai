// canonicalPrismaMock()'s Prisma.sql/raw/empty tagged-template implementation
// is algorithmically equivalent to the hand-rolled version this replaces (both
// walk `strings`/`values`, flatten nested sql fragments, join with `?`
// placeholders) — every assertion below reads `.sql`/`.values` off the
// captured query, never an exact-shape `toEqual`, so the extra `.text` field
// canonicalPrismaMock()'s fragments carry is inert.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

interface SqlFragmentMock {
  sql: string;
  values: unknown[];
}

function isSqlFragment(value: unknown): value is SqlFragmentMock {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sql' in value &&
    'values' in value &&
    Array.isArray((value as { values: unknown }).values)
  );
}

import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AnalyticsMetric, CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('AnalyticsService', () => {
  const typed = <T>(value: unknown): T => value as T;

  let service: AnalyticsService;

  interface CapturedSqlQuery {
    sql: string;
    values: unknown[];
  }

  const captureSqlQuery = (
    strings: TemplateStringsArray,
    values: unknown[],
  ): CapturedSqlQuery => {
    const parts: string[] = [];
    const parameters: unknown[] = [];

    strings.forEach((part, index) => {
      parts.push(part);
      if (index >= values.length) {
        return;
      }

      const value = values[index];
      if (isSqlFragment(value)) {
        parts.push(value.sql);
        parameters.push(...value.values);
        return;
      }

      parts.push('?');
      parameters.push(value);
    });

    return {
      sql: parts.join('').replace(/\s+/g, ' ').trim(),
      values: parameters,
    };
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  // Mock PrismaService: $queryRaw is the primary path for all analytics aggregations
  const mockPrismaService = {
    $queryRaw: vi.fn(),
    analytic: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    brand: {
      count: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn(),
    },
    organization: {
      count: vi.fn(),
    },
  };

  const captureQueryRawCalls = (
    resultsByCall: unknown[][] = [],
  ): CapturedSqlQuery[] => {
    const capturedQueries: CapturedSqlQuery[] = [];

    mockPrismaService.$queryRaw.mockImplementation(
      (
        stringsOrSql: TemplateStringsArray | SqlFragmentMock,
        ...values: unknown[]
      ) => {
        if (isSqlFragment(stringsOrSql)) {
          capturedQueries.push({
            sql: stringsOrSql.sql.replace(/\s+/g, ' ').trim(),
            values: stringsOrSql.values,
          });
        } else {
          capturedQueries.push(captureSqlQuery(stringsOrSql, values));
        }
        return Promise.resolve(resultsByCall[capturedQueries.length - 1] ?? []);
      },
    );

    return capturedQueries;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: $queryRaw returns empty array unless overridden
    mockPrismaService.$queryRaw.mockResolvedValue([]);
    mockPrismaService.brand.groupBy.mockResolvedValue([]);
    mockPrismaService.brand.findFirst.mockResolvedValue(null);
    mockPrismaService.organization.count.mockResolvedValue(0);
    mockPrismaService.brand.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================

  // ==========================================================================
  // getTimeSeriesData
  // ==========================================================================
  describe('getTimeSeriesData', () => {
    it('should return time series data for date range', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-03';

      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          day: '2025-01-01',
          platform: 'YOUTUBE',
          comments: BigInt(5),
          engagement_rate: 5,
          likes: BigInt(10),
          saves: BigInt(1),
          shares: BigInt(2),
          views: BigInt(100),
        },
        {
          day: '2025-01-02',
          platform: 'TIKTOK',
          comments: BigInt(10),
          engagement_rate: 8,
          likes: BigInt(20),
          saves: BigInt(2),
          shares: BigInt(5),
          views: BigInt(200),
        },
      ]);

      const result = typed<Array<Record<string, unknown>>>(
        await service.getTimeSeriesData(startDate, endDate),
      );

      expect(result).toHaveLength(3); // 3 days
      expect(result[0].date).toBe('2025-01-01');
      expect((result[0].youtube as Record<string, number>).views).toBe(100);
      expect((result[1].tiktok as Record<string, number>).views).toBe(200);
      expect((result[2].instagram as Record<string, number>).views).toBe(0);
    });

    it('should fill empty dates with zero metrics', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = typed<Array<Record<string, unknown>>>(
        await service.getTimeSeriesData('2025-01-01', '2025-01-02'),
      );

      expect(result).toHaveLength(2);
      expect((result[0].youtube as Record<string, number>).views).toBe(0);
      expect((result[0].tiktok as Record<string, number>).likes).toBe(0);
    });

    it('should parameterize organization and date filters', async () => {
      const capturedQueries = captureQueryRawCalls();
      const organizationId = "org-filter-'1";

      await service.getTimeSeriesData(
        '2025-01-01',
        '2025-01-31',
        organizationId,
      );

      expect(capturedQueries[0].sql).toContain('"date" >= ?');
      expect(capturedQueries[0].sql).toContain('"date" <= ?');
      expect(capturedQueries[0].sql).toContain('AND "organizationId" = ?');
      expect(capturedQueries[0].sql).not.toContain(organizationId);
      expect(capturedQueries[0].values).toContain(organizationId);
    });
  });

  // ==========================================================================
  // getOverview
  // ==========================================================================
  describe('getOverview', () => {
    beforeEach(() => {
      mockPrismaService.organization.count.mockResolvedValue(5);
      mockPrismaService.brand.count.mockResolvedValue(10);
      mockPrismaService.$queryRaw.mockResolvedValue([]);
    });

    it('should return overview analytics', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          {
            avg_engagement_rate: 5.5,
            total_comments: BigInt(200),
            total_likes: BigInt(500),
            total_posts: BigInt(100),
            total_saves: BigInt(50),
            total_shares: BigInt(100),
            total_views: BigInt(10000),
          },
        ])
        .mockResolvedValueOnce([
          {
            total_engagement: BigInt(600),
            total_posts: BigInt(80),
            total_views: BigInt(8000),
          },
        ]);

      const result = typed<Record<string, unknown>>(
        await service.getOverview(),
      );

      expect(result.totalPosts).toBe(100);
      expect(result.totalViews).toBe(10000);
      expect(result.totalEngagement).toBe(850); // 500+200+100+50
      expect(result.organizationCount).toBe(5);
      expect(result.brandCount).toBe(10);
      expect((result.growth as Record<string, number>).posts).toBe(25); // (100-80)/80 * 100
    });

    it('should return zero growth when no previous data', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = typed<Record<string, Record<string, number>>>(
        await service.getOverview(),
      );

      expect(result.growth.posts).toBe(0);
      expect(result.growth.views).toBe(0);
      expect(result.growth.engagement).toBe(0);
    });

    it('should call prisma.organization.count with organizationId filter', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const orgId = 'org-filter-1';
      await service.getOverview(undefined, undefined, undefined, orgId);

      expect(mockPrismaService.organization.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: orgId }),
        }),
      );
    });

    it('should parameterize brand and organization filters in overview SQL', async () => {
      const capturedQueries = captureQueryRawCalls();
      const brandId = "brand-filter-'1";
      const organizationId = "org-filter-'1";

      await service.getOverview(
        '2025-01-01',
        '2025-01-31',
        brandId,
        organizationId,
      );

      expect(capturedQueries).toHaveLength(2);
      for (const query of capturedQueries) {
        expect(query.sql).toContain('AND "brandId" = ?');
        expect(query.sql).toContain('AND "organizationId" = ?');
        expect(query.sql).not.toContain(brandId);
        expect(query.sql).not.toContain(organizationId);
        expect(query.values).toContain(brandId);
        expect(query.values).toContain(organizationId);
      }
    });
  });

  // ==========================================================================
  // getBestPostingTimes
  // ==========================================================================
  describe('getBestPostingTimes', () => {
    it('should return best posting times per platform', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          platform: 'YOUTUBE',
          hour: 14,
          avg_engagement_rate: 8.5,
          post_count: BigInt(20),
        },
        {
          platform: 'TIKTOK',
          hour: 20,
          avg_engagement_rate: 12.0,
          post_count: BigInt(35),
        },
      ]);

      const result = await service.getBestPostingTimes();

      expect(result).toHaveLength(2);
      expect(result[0].platform).toBe(CredentialPlatform.YOUTUBE);
      expect(result[0].hour).toBe(14);
      expect(result[0].avgEngagementRate).toBe(8.5);
      expect(result[0].postCount).toBe(20);
    });

    it('should return empty array when no data', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.getBestPostingTimes();

      expect(result).toEqual([]);
    });

    it('should parameterize brand, organization, and date filters', async () => {
      const capturedQueries = captureQueryRawCalls();
      const brandId = "brand-filter-'1";
      const organizationId = "org-filter-'1";

      await service.getBestPostingTimes(
        '2025-01-01',
        '2025-01-31',
        brandId,
        organizationId,
      );

      expect(capturedQueries[0].sql).toContain('"date" >= ?');
      expect(capturedQueries[0].sql).toContain('"date" <= ?');
      expect(capturedQueries[0].sql).toContain('AND "brandId" = ?');
      expect(capturedQueries[0].sql).toContain('AND "organizationId" = ?');
      expect(capturedQueries[0].sql).not.toContain(brandId);
      expect(capturedQueries[0].sql).not.toContain(organizationId);
      expect(capturedQueries[0].values).toContain(brandId);
      expect(capturedQueries[0].values).toContain(organizationId);
    });
  });

  // ==========================================================================
  // getTopContent
  // ==========================================================================
  describe('getTopContent', () => {
    it('should return top performing content', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          id: 'pa-1',
          post_id: 'post-1',
          platform: 'YOUTUBE',
          date: new Date(),
          total_views: BigInt(10000),
          total_likes: BigInt(500),
          total_comments: BigInt(200),
          total_saves: BigInt(50),
          total_shares: BigInt(100),
          engagement_rate: 8.5,
          total_engagement: BigInt(850),
          label: 'Top Video',
          description: 'Best performing',
          brand_name: 'Brand A',
          brand_logo: null,
        },
      ]);

      const result = typed<Array<Record<string, unknown>>>(
        await service.getTopContent(),
      );

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Top Video');
      expect(result[0].totalViews).toBe(10000);
      // genfeedai/genfeed.ai#5424: Prisma label in, domain id out.
      expect(result[0].platform).toBe(CredentialPlatform.YOUTUBE);
    });

    it('should parameterize brand, platform, organization, and date filters', async () => {
      const capturedQueries = captureQueryRawCalls();
      const brandId = "brand-filter-'1";
      const organizationId = "org-filter-'1";

      await service.getTopContent(
        '2025-01-01',
        '2025-01-31',
        10,
        AnalyticsMetric.ENGAGEMENT,
        brandId,
        CredentialPlatform.YOUTUBE,
        organizationId,
      );

      expect(capturedQueries[0].sql).toContain('pa."date" >= ?');
      expect(capturedQueries[0].sql).toContain('pa."date" <= ?');
      expect(capturedQueries[0].sql).toContain('AND pa."brandId" = ?');
      expect(capturedQueries[0].sql).toContain('AND pa."platform"::text = ?');
      expect(capturedQueries[0].sql).toContain('AND pa."organizationId" = ?');
      expect(capturedQueries[0].sql).toContain(
        'ORDER BY (pa."totalLikes" + pa."totalComments" + pa."totalShares" + pa."totalSaves") DESC',
      );
      expect(capturedQueries[0].sql).not.toContain(brandId);
      expect(capturedQueries[0].sql).not.toContain(organizationId);
      expect(capturedQueries[0].values).toContain(brandId);
      // genfeedai/genfeed.ai#5425: the column holds the Prisma label.
      expect(capturedQueries[0].values).toContain('YOUTUBE');
      expect(capturedQueries[0].values).not.toContain(
        CredentialPlatform.YOUTUBE,
      );
      expect(capturedQueries[0].values).toContain(organizationId);
    });
  });

  // ==========================================================================
  // getPlatformComparison
  // ==========================================================================
  describe('getPlatformComparison', () => {
    it('returns IPlatformComparison rows with domain platform ids', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          platform: 'YOUTUBE',
          avg_engagement_rate: 8.5,
          total_comments: BigInt(100),
          total_likes: BigInt(250),
          total_posts: BigInt(50),
          total_saves: BigInt(25),
          total_shares: BigInt(50),
          total_views: BigInt(5000),
          total_engagement: BigInt(425),
        },
      ]);

      expect(await service.getPlatformComparison()).toEqual([
        {
          avgViewsPerPost: 100,
          comments: 100,
          engagementRate: 8.5,
          likes: 250,
          platform: CredentialPlatform.YOUTUBE,
          postCount: 50,
          saves: 25,
          shares: 50,
          totalEngagement: 425,
          views: 5000,
        },
      ]);
    });

    it('counts distinct posts from live analytics rows only', async () => {
      const capturedQueries = captureQueryRawCalls();

      await service.getPlatformComparison();

      expect(capturedQueries[0].sql).toContain(
        'COUNT(DISTINCT "postId") AS total_posts',
      );
      expect(capturedQueries[0].sql).toContain('"isDeleted" = false');
    });

    it('should parameterize brand and date filters', async () => {
      const capturedQueries = captureQueryRawCalls();
      const brandId = "brand-filter-'1";

      await service.getPlatformComparison('2025-01-01', '2025-01-31', brandId);

      expect(capturedQueries[0].sql).toContain('"date" >= ?');
      expect(capturedQueries[0].sql).toContain('"date" <= ?');
      expect(capturedQueries[0].sql).toContain('AND "brandId" = ?');
      expect(capturedQueries[0].sql).not.toContain(brandId);
      expect(capturedQueries[0].values).toContain(brandId);
    });

    it('should parameterize organization filters', async () => {
      const capturedQueries = captureQueryRawCalls();
      const organizationId = "org-filter-'1";

      await service.getPlatformComparison(
        '2025-01-01',
        '2025-01-31',
        undefined,
        organizationId,
      );

      expect(capturedQueries[0].sql).toContain('AND "organizationId" = ?');
      expect(capturedQueries[0].sql).not.toContain(organizationId);
      expect(capturedQueries[0].values).toContain(organizationId);
    });
  });

  // ==========================================================================
  // getGrowthTrends
  // ==========================================================================
  describe('getGrowthTrends', () => {
    it('should return growth trends by day', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          {
            day: '2025-01-01',
            comments: BigInt(20),
            engagement: BigInt(85),
            likes: BigInt(50),
            posts: BigInt(10),
            saves: BigInt(5),
            shares: BigInt(10),
            views: BigInt(1000),
          },
          {
            day: '2025-01-02',
            comments: BigInt(25),
            engagement: BigInt(103),
            likes: BigInt(60),
            posts: BigInt(12),
            saves: BigInt(6),
            shares: BigInt(12),
            views: BigInt(1200),
          },
        ])
        .mockResolvedValueOnce([
          {
            total_comments: BigInt(15),
            total_likes: BigInt(40),
            total_posts: BigInt(8),
            total_saves: BigInt(4),
            total_shares: BigInt(8),
            total_views: BigInt(800),
          },
        ]);

      const result = typed<Record<string, unknown>>(
        await service.getGrowthTrends(),
      );

      expect(result.metric).toBe('views');
      expect((result.data as unknown[]).length).toBe(2);
      expect((result.data as Array<Record<string, unknown>>)[0].date).toBe(
        '2025-01-01',
      );
    });

    it('should track engagement metric', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = typed<Record<string, unknown>>(
        await service.getGrowthTrends(
          undefined,
          undefined,
          AnalyticsMetric.ENGAGEMENT,
        ),
      );

      expect(result.metric).toBe('engagement');
    });

    it('should track posts metric', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = typed<Record<string, unknown>>(
        await service.getGrowthTrends(
          undefined,
          undefined,
          AnalyticsMetric.POSTS,
        ),
      );

      expect(result.metric).toBe('posts');
    });

    it('should parameterize brand and date filters in current and previous windows', async () => {
      const capturedQueries = captureQueryRawCalls([[], []]);
      const brandId = "brand-filter-'1";

      await service.getGrowthTrends(
        '2025-01-01',
        '2025-01-31',
        AnalyticsMetric.VIEWS,
        brandId,
      );

      expect(capturedQueries).toHaveLength(2);
      for (const query of capturedQueries) {
        expect(query.sql).toContain('"date" >= ?');
        expect(query.sql).toContain('"date" <= ?');
        expect(query.sql).toContain('AND "brandId" = ?');
        expect(query.sql).not.toContain(brandId);
        expect(query.values).toContain(brandId);
      }
    });

    it('should parameterize organization filters in current and previous windows', async () => {
      const capturedQueries = captureQueryRawCalls([[], []]);
      const organizationId = "org-filter-'1";

      await service.getGrowthTrends(
        '2025-01-01',
        '2025-01-31',
        AnalyticsMetric.VIEWS,
        undefined,
        organizationId,
      );

      expect(capturedQueries).toHaveLength(2);
      for (const query of capturedQueries) {
        expect(query.sql).toContain('AND "organizationId" = ?');
        expect(query.sql).not.toContain(organizationId);
        expect(query.values).toContain(organizationId);
      }
    });
  });

  // ==========================================================================
  // getEngagementBreakdown
  // ==========================================================================
  describe('getEngagementBreakdown', () => {
    it('should return engagement breakdown', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          total_comments: BigInt(50),
          total_likes: BigInt(100),
          total_saves: BigInt(10),
          total_shares: BigInt(25),
        },
      ]);

      const result = typed<Record<string, unknown>>(
        await service.getEngagementBreakdown(),
      );

      expect(result.likes).toBe(100);
      expect(result.comments).toBe(50);
      expect(result.shares).toBe(25);
      expect(result.saves).toBe(10);
      expect(result.total).toBe(185);
      expect((result.percentages as Record<string, number>).likes).toBeCloseTo(
        54.05,
        1,
      );
    });

    it('should handle zero engagement', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = typed<Record<string, unknown>>(
        await service.getEngagementBreakdown(),
      );

      expect(result.total).toBe(0);
      expect((result.percentages as Record<string, number>).likes).toBe(0);
      expect((result.percentages as Record<string, number>).comments).toBe(0);
    });

    it('should call $queryRaw when filtering by brand and platform', async () => {
      const capturedQueries = captureQueryRawCalls();

      const brandId = "brand-filter-'1";
      await service.getEngagementBreakdown(
        '2025-01-01',
        '2025-01-31',
        brandId,
        CredentialPlatform.YOUTUBE,
      );

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
      expect(capturedQueries[0].sql).toContain('"date" >= ?');
      expect(capturedQueries[0].sql).toContain('"date" <= ?');
      expect(capturedQueries[0].sql).toContain('AND "brandId" = ?');
      expect(capturedQueries[0].sql).toContain('AND "platform"::text = ?');
      expect(capturedQueries[0].sql).not.toContain(brandId);
      expect(capturedQueries[0].values).toContain(brandId);
      expect(capturedQueries[0].values).toContain('YOUTUBE');
    });

    it('should parameterize organization filters', async () => {
      const capturedQueries = captureQueryRawCalls();
      const organizationId = "org-filter-'1";

      await service.getEngagementBreakdown(
        '2025-01-01',
        '2025-01-31',
        undefined,
        undefined,
        organizationId,
      );

      expect(capturedQueries[0].sql).toContain('AND "organizationId" = ?');
      expect(capturedQueries[0].sql).not.toContain(organizationId);
      expect(capturedQueries[0].values).toContain(organizationId);
    });
  });

  describe('assertBrandInScope', () => {
    it('looks up the brand inside the authorized organization', async () => {
      mockPrismaService.brand.findFirst.mockResolvedValueOnce({
        id: 'brand-1',
      });

      await service.assertBrandInScope('brand-1', 'org-1');

      expect(mockPrismaService.brand.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          id: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });
  });

  // ==========================================================================
  // getViralHooks
  // ==========================================================================
  describe('getViralHooks', () => {
    it('should return viral hooks analysis', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'post-1',
            platforms: ['TIKTOK', 'INSTAGRAM'],
            total_engagement: BigInt(5000),
            total_views: BigInt(100000),
            description: 'This went viral',
            title: 'Viral Video',
          },
        ])
        .mockResolvedValueOnce([
          {
            platform: 'TIKTOK',
            post_count: BigInt(1),
            total_engagement: BigInt(5000),
            total_views: BigInt(100000),
          },
        ]);

      const result = await service.getViralHooks();

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].title).toBe('Viral Video');
      // genfeedai/genfeed.ai#5424: the hooks page matches these against
      // lowercase platform configs.
      expect(result.videos[0].platforms).toEqual([
        CredentialPlatform.TIKTOK,
        CredentialPlatform.INSTAGRAM,
      ]);
      expect(result.analysis.topPlatforms).toEqual([
        {
          platform: CredentialPlatform.TIKTOK,
          postCount: 1,
          totalEngagement: 5000,
          totalViews: 100000,
        },
      ]);
    });

    it('filters top content by the Prisma label of the requested platform', async () => {
      const capturedQueries = captureQueryRawCalls();

      await service.getTopContent(
        '2025-01-01',
        '2025-01-31',
        10,
        AnalyticsMetric.VIEWS,
        undefined,
        CredentialPlatform.INSTAGRAM,
      );

      expect(capturedQueries[0].values).toContain('INSTAGRAM');
      expect(capturedQueries[0].values).not.toContain('instagram');
    });

    it('should parameterize brand, organization, and date filters in both raw queries', async () => {
      const capturedQueries = captureQueryRawCalls([[], []]);
      const brandId = "brand-filter-'1";
      const organizationId = "org-filter-'1";

      await service.getViralHooks(
        '2025-01-01',
        '2025-01-31',
        brandId,
        organizationId,
      );

      expect(capturedQueries).toHaveLength(2);
      for (const query of capturedQueries) {
        expect(query.sql).toContain('pa."date" >= ?');
        expect(query.sql).toContain('pa."date" <= ?');
        expect(query.sql).toContain('AND pa."brandId" = ?');
        expect(query.sql).toContain('AND pa."organizationId" = ?');
        expect(query.sql).not.toContain(brandId);
        expect(query.sql).not.toContain(organizationId);
        expect(query.values).toContain(brandId);
        expect(query.values).toContain(organizationId);
      }
    });

    // genfeedai/genfeed.ai#5415: the platform totals describe the same post
    // set as the videos, so "Breakouts only" / a focused post never shows
    // unrelated platform totals.
    it('applies the outlier-tier and post filters to the platform aggregation too', async () => {
      const capturedQueries = captureQueryRawCalls([[], []]);

      await service.getViralHooks(
        '2025-01-01',
        '2025-01-31',
        'brand-1',
        'org-1',
        'breakout',
        'post-42',
      );

      expect(capturedQueries).toHaveLength(2);
      for (const query of capturedQueries) {
        expect(query.sql).toContain('FROM "outlier_post_performances" opp');
        expect(query.sql).toContain(`opp."outlierTier" IN ('breakout')`);
        expect(query.sql).toContain('AND pa."postId" = ?');
        expect(query.values).toContain('post-42');
      }
    });

    it('counts distinct posts per platform and returns every platform', async () => {
      const platforms = [
        CredentialPlatform.TIKTOK,
        CredentialPlatform.INSTAGRAM,
        CredentialPlatform.YOUTUBE,
        CredentialPlatform.TWITTER,
        CredentialPlatform.FACEBOOK,
        CredentialPlatform.LINKEDIN,
      ];
      const capturedQueries = captureQueryRawCalls([
        [],
        platforms.map((platform, index) => ({
          platform: platform.toUpperCase(),
          post_count: BigInt(index + 1),
          total_engagement: BigInt(600 - index * 100),
          total_views: BigInt(6000 - index * 1000),
        })),
      ]);

      const result = await service.getViralHooks('2025-01-01', '2025-01-31');

      const platformQuery = capturedQueries[1];
      expect(platformQuery.sql).toContain(
        'COUNT(DISTINCT pa."postId") AS post_count',
      );
      expect(platformQuery.sql).not.toMatch(/\bLIMIT\b/);
      expect(result.analysis.topPlatforms.map((row) => row.platform)).toEqual(
        platforms,
      );
      expect(result.analysis.topPlatforms[5]).toEqual({
        platform: CredentialPlatform.LINKEDIN,
        postCount: 6,
        totalEngagement: 100,
        totalViews: 1000,
      });
    });
  });

  // ==========================================================================
  // soft deletes (genfeedai/genfeed.ai#5419)
  // ==========================================================================
  describe('soft-deleted post_analytics rows', () => {
    const range = ['2025-01-01', '2025-01-31'] as const;
    const reads: Array<
      [string, (service: AnalyticsService) => Promise<unknown>]
    > = [
      ['getTimeSeriesData', (s) => s.getTimeSeriesData(...range, 'org-1')],
      ['getOverview', (s) => s.getOverview(...range, 'brand-1', 'org-1')],
      [
        'getBestPostingTimes',
        (s) => s.getBestPostingTimes(...range, 'brand-1', 'org-1'),
      ],
      [
        'getTopContent',
        (s) =>
          s.getTopContent(
            ...range,
            5,
            AnalyticsMetric.VIEWS,
            'brand-1',
            CredentialPlatform.YOUTUBE,
            'org-1',
          ),
      ],
      [
        'getPlatformComparison',
        (s) => s.getPlatformComparison(...range, 'brand-1', 'org-1'),
      ],
      [
        'getGrowthTrends',
        (s) =>
          s.getGrowthTrends(
            ...range,
            AnalyticsMetric.VIEWS,
            'brand-1',
            'org-1',
          ),
      ],
      [
        'getEngagementBreakdown',
        (s) =>
          s.getEngagementBreakdown(
            ...range,
            'brand-1',
            CredentialPlatform.YOUTUBE,
            'org-1',
          ),
      ],
      [
        'getViralHooks',
        (s) => s.getViralHooks(...range, 'brand-1', 'org-1', 'outlier'),
      ],
    ];

    it.each(reads)(
      '%s excludes soft-deleted analytics rows',
      async (_name, read) => {
        const capturedQueries = captureQueryRawCalls();

        await read(service);

        const analyticsQueries = capturedQueries.filter((query) =>
          query.sql.includes('FROM "post_analytics"'),
        );
        expect(analyticsQueries.length).toBeGreaterThan(0);
        for (const query of analyticsQueries) {
          expect(query.sql).toMatch(/WHERE (pa\.)?"isDeleted" = false/);
        }
      },
    );
  });
});
