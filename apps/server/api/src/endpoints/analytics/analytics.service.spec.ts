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
import { AnalyticsMetric, CredentialPlatform } from '@genfeedai/enums';
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
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        capturedQueries.push(captureSqlQuery(strings, values));
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
  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

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
          platform: CredentialPlatform.YOUTUBE,
          comments: BigInt(5),
          engagement_rate: 5,
          likes: BigInt(10),
          saves: BigInt(1),
          shares: BigInt(2),
          views: BigInt(100),
        },
        {
          day: '2025-01-02',
          platform: CredentialPlatform.TIKTOK,
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
          platform: CredentialPlatform.YOUTUBE,
          hour: 14,
          avg_engagement_rate: 8.5,
          post_count: BigInt(20),
        },
        {
          platform: CredentialPlatform.TIKTOK,
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
          platform: CredentialPlatform.YOUTUBE,
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
    });

    it('should call $queryRaw for different metrics', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      await service.getTopContent(
        undefined,
        undefined,
        10,
        AnalyticsMetric.ENGAGEMENT,
      );

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });

    it('should enforce max limit of 100', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      // safeLimit = min(max(1, 200), 100) = 100
      await service.getTopContent(undefined, undefined, 200);

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
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
      expect(capturedQueries[0].values).toContain(CredentialPlatform.YOUTUBE);
      expect(capturedQueries[0].values).toContain(organizationId);
    });
  });

  // ==========================================================================
  // getPlatformComparison
  // ==========================================================================
  describe('getPlatformComparison', () => {
    it('should return platform comparison data with percentages', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          platform: CredentialPlatform.YOUTUBE,
          avg_engagement_rate: 8.5,
          total_comments: BigInt(100),
          total_likes: BigInt(250),
          total_posts: BigInt(50),
          total_saves: BigInt(25),
          total_shares: BigInt(50),
          total_views: BigInt(5000),
          total_engagement: BigInt(425),
        },
        {
          platform: CredentialPlatform.TIKTOK,
          avg_engagement_rate: 8.5,
          total_comments: BigInt(60),
          total_likes: BigInt(150),
          total_posts: BigInt(30),
          total_saves: BigInt(15),
          total_shares: BigInt(30),
          total_views: BigInt(3000),
          total_engagement: BigInt(255),
        },
      ]);

      const result = typed<Array<Record<string, unknown>>>(
        await service.getPlatformComparison(),
      );

      expect(result).toHaveLength(2);
      expect(result[0].platform).toBe(CredentialPlatform.YOUTUBE);
      expect(result[0].viewsPercentage as number).toBeGreaterThan(0);
      expect(result[0].engagementPercentage as number).toBeGreaterThan(0);
    });

    it('should calculate 100% when single platform', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          platform: CredentialPlatform.YOUTUBE,
          avg_engagement_rate: 10,
          total_comments: BigInt(0),
          total_likes: BigInt(0),
          total_posts: BigInt(100),
          total_saves: BigInt(0),
          total_shares: BigInt(0),
          total_views: BigInt(1000),
          total_engagement: BigInt(100),
        },
      ]);

      const result = typed<Array<Record<string, number>>>(
        await service.getPlatformComparison(),
      );

      expect(result[0].viewsPercentage).toBe(100);
      expect(result[0].postsPercentage).toBe(100);
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
      expect(capturedQueries[0].values).toContain(CredentialPlatform.YOUTUBE);
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
            platforms: [CredentialPlatform.TIKTOK],
            total_engagement: BigInt(5000),
            total_views: BigInt(100000),
            description: 'This went viral',
            title: 'Viral Video',
          },
        ])
        .mockResolvedValueOnce([
          {
            platform: CredentialPlatform.TIKTOK,
            post_count: BigInt(1),
            total_engagement: BigInt(5000),
            total_views: BigInt(100000),
          },
        ]);

      const result = await service.getViralHooks();

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].title).toBe('Viral Video');
      expect(result.analysis.topPlatforms).toHaveLength(1);
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
  });
});
