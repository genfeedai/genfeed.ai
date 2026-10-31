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

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationLogoService } from '@api/collections/organizations/services/organization-logo.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import {
  LeaderboardOrder,
  LeaderboardSort,
} from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { EntityLeaderboardService } from '@api/endpoints/analytics/entity-leaderboard.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, OrganizationCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('EntityLeaderboardService', () => {
  let service: EntityLeaderboardService;

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

  const mockOrganizationsService = {
    count: vi.fn(),
    findAll: vi.fn(),
  };

  const mockBrandsService = {
    count: vi.fn(),
    findAll: vi.fn(),
    resolveBrandLogoUrls: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockPrismaService = {
    $queryRaw: vi.fn(),
    brand: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    member: {
      groupBy: vi.fn(),
    },
    organization: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  };

  const mockOrganizationLogoService = {
    resolveLogoUrls: vi.fn(),
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

    mockPrismaService.$queryRaw.mockResolvedValue([]);
    mockPrismaService.brand.count.mockResolvedValue(0);
    mockPrismaService.brand.groupBy.mockResolvedValue([]);
    mockPrismaService.member.groupBy.mockResolvedValue([]);
    mockPrismaService.organization.count.mockResolvedValue(0);
    mockPrismaService.organization.findMany.mockResolvedValue([]);
    mockPrismaService.user.findMany.mockResolvedValue([]);
    mockOrganizationLogoService.resolveLogoUrls.mockResolvedValue(new Map());
    mockBrandsService.resolveBrandLogoUrls.mockResolvedValue(new Map());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityLeaderboardService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        { provide: BrandsService, useValue: mockBrandsService },
        {
          provide: OrganizationLogoService,
          useValue: mockOrganizationLogoService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<EntityLeaderboardService>(EntityLeaderboardService);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  // The first raw query of every list call ranks one page of entity ids in the
  // database; the rest are the per-entity analytics lookups for those ids.
  const rankRows = (...ids: string[]) =>
    ids.map((entityId) => ({ entity_id: entityId }));

  // Published posts per entity, the last of the per-entity lookups.
  const postCountRows = (...counts: Array<[string, number]>) =>
    counts.map(([entityId, total]) => ({
      entity_id: entityId,
      total_posts: BigInt(total),
    }));

  const analyticsRow = (
    entityId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    avg_engagement_rate: 0,
    entity_id: entityId,
    platforms: [],
    total_comments: BigInt(0),
    total_likes: BigInt(0),
    total_saves: BigInt(0),
    total_shares: BigInt(0),
    total_views: BigInt(0),
    ...overrides,
  });

  // ==========================================================================
  // getOrganizationsLeaderboard
  // ==========================================================================
  describe('getOrganizationsLeaderboard', () => {
    const mockOrgId = 'org-cuid-1';
    const mockOrgs = [
      {
        id: mockOrgId,
        createdAt: new Date(),
        label: 'Test Org',
        logo: { cdnUrl: 'https://cdn.example.com/logo.png' },
        name: 'Test Organization',
      },
    ];

    beforeEach(() => {
      mockOrganizationsService.findAll.mockResolvedValue({ docs: mockOrgs });
      mockPrismaService.$queryRaw.mockResolvedValue([]);
    });

    it('should return empty array and skip hydration when no organizations rank', async () => {
      const result = await service.getOrganizationsLeaderboard();

      expect(result).toEqual([]);
      expect(mockOrganizationsService.findAll).not.toHaveBeenCalled();
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return organizations with analytics', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(rankRows(mockOrgId))
        .mockResolvedValueOnce([
          analyticsRow(mockOrgId, {
            avg_engagement_rate: 5.5,
            total_comments: BigInt(50),
            total_likes: BigInt(100),
            total_saves: BigInt(10),
            total_shares: BigInt(25),
            total_views: BigInt(1000),
          }),
        ])
        .mockResolvedValueOnce([]) // previous period
        .mockResolvedValueOnce(postCountRows([mockOrgId, 2]));

      const result = await service.getOrganizationsLeaderboard();

      expect(result).toHaveLength(1);
      expect(result[0].rank).toBe(1);
      expect(result[0].organization.name).toBe('Test Org');
      expect(result[0].totalViews).toBe(1000);
      expect(result[0].totalEngagement).toBe(185); // 100+50+25+10
      expect(result[0].totalPosts).toBe(2);
    });

    it('should calculate growth percentage correctly', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(rankRows(mockOrgId))
        .mockResolvedValueOnce([
          analyticsRow(mockOrgId, {
            avg_engagement_rate: 5,
            total_comments: BigInt(50),
            total_likes: BigInt(100),
            total_saves: BigInt(25),
            total_shares: BigInt(25),
            total_views: BigInt(200),
          }),
        ])
        .mockResolvedValueOnce([
          { entity_id: mockOrgId, total_engagement: BigInt(100) },
        ]);

      const result = await service.getOrganizationsLeaderboard();

      // Current: 100+50+25+25 = 200, Previous: 100, Growth: 100%
      expect(result[0].growth).toBe(100);
    });

    it('should handle 100% growth for new orgs with no previous data', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(rankRows(mockOrgId))
        .mockResolvedValueOnce([
          analyticsRow(mockOrgId, {
            avg_engagement_rate: 3,
            total_comments: BigInt(5),
            total_likes: BigInt(10),
            total_saves: BigInt(1),
            total_shares: BigInt(2),
            total_views: BigInt(100),
          }),
        ])
        .mockResolvedValueOnce([]); // no previous data

      const result = await service.getOrganizationsLeaderboard();

      expect(result[0].growth).toBe(100);
    });

    it('should keep the order the database ranked the organizations in', async () => {
      mockOrganizationsService.findAll.mockResolvedValue({
        // Hydration order is arbitrary; rank order must win.
        docs: [
          { id: 'org-1', label: 'Org1' },
          { id: 'org-2', label: 'Org2' },
        ],
      });
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(rankRows('org-2', 'org-1'))
        .mockResolvedValueOnce([
          analyticsRow('org-1', { total_views: BigInt(100) }),
          analyticsRow('org-2', { total_views: BigInt(500) }),
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getOrganizationsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.VIEWS,
      );

      expect(result.map((item) => item.organization.name)).toEqual([
        'Org2',
        'Org1',
      ]);
      expect(result.map((item) => item.rank)).toEqual([1, 2]);
      expect(result[0].totalViews).toBe(500);
    });

    it('should push the limit into the ranking query and look up only those ids', async () => {
      const rankedIds = Array.from({ length: 5 }, (_, i) => `org-${i}`);
      const capturedQueries = captureQueryRawCalls([rankRows(...rankedIds)]);
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: rankedIds.map((id) => ({ id, label: id })),
      });

      const result = await service.getOrganizationsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.ENGAGEMENT,
        5,
      );

      expect(result).toHaveLength(5);
      const [rankQuery, ...lookups] = capturedQueries;
      expect(rankQuery.sql).toContain('LIMIT ? OFFSET ?');
      expect(rankQuery.values.slice(-2)).toEqual([5, 0]);
      expect(lookups).toHaveLength(3);
      for (const lookup of lookups) {
        expect(lookup.values).toContainEqual(rankedIds);
      }
    });

    it('should rank in SQL by the metric mapped from the sort enum', async () => {
      const cases: Array<[LeaderboardSort, string]> = [
        [LeaderboardSort.VIEWS, 'SUM("totalViews") AS metric'],
        [LeaderboardSort.POSTS, 'COUNT(*) AS metric'],
        [
          LeaderboardSort.ENGAGEMENT,
          'SUM("totalLikes" + "totalComments" + "totalShares" + "totalSaves") AS metric',
        ],
      ];

      for (const [sort, metric] of cases) {
        const capturedQueries = captureQueryRawCalls([[]]);

        await service.getOrganizationsLeaderboard(
          undefined,
          undefined,
          sort,
          10,
        );

        expect(capturedQueries[0].sql).toContain(metric);
        expect(capturedQueries[0].sql).toContain(
          'ORDER BY COALESCE(m.metric, 0) DESC, e."createdAt" DESC, e."id" DESC',
        );
      }
    });

    it('should rank live organizations only, including those with no analytics', async () => {
      const capturedQueries = captureQueryRawCalls([[]]);

      await service.getOrganizationsLeaderboard();

      expect(capturedQueries[0].sql).toContain('FROM "organizations" e');
      expect(capturedQueries[0].sql).toContain('LEFT JOIN');
      expect(capturedQueries[0].sql).toContain('e."isDeleted" = false');
    });

    it('should rank by published posts, not synced analytics rows, when sorting by posts', async () => {
      const capturedQueries = captureQueryRawCalls([[]]);

      await service.getOrganizationsLeaderboard(
        '2025-01-01',
        '2025-01-31',
        LeaderboardSort.POSTS,
      );

      expect(capturedQueries[0].sql).toContain('FROM "posts"');
      expect(capturedQueries[0].sql).toContain('"publishedAt" IS NOT NULL');
      expect(capturedQueries[0].sql).not.toContain('post_analytics');
    });

    it('should hydrate only the ranked ids and exclude deleted organizations', async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce(rankRows(mockOrgId));

      await service.getOrganizationsLeaderboard();

      expect(mockOrganizationsService.findAll).toHaveBeenCalledWith(
        { where: { id: { in: [mockOrgId] }, isDeleted: false } },
        { pagination: false },
      );
    });

    it('should parameterize organization ids and date windows in raw analytics queries', async () => {
      const capturedQueries = captureQueryRawCalls([
        rankRows(mockOrgId),
        [],
        [],
        [],
      ]);

      await service.getOrganizationsLeaderboard('2025-01-01', '2025-01-31');

      expect(capturedQueries).toHaveLength(4);
      const [rankQuery, ...lookups] = capturedQueries;
      expect(rankQuery.sql).toContain('"date" >= ?');
      expect(rankQuery.sql).toContain('"date" <= ?');
      for (const query of lookups) {
        expect(query.sql).toContain('"organizationId" = ANY(?::text[])');
        expect(query.sql).toMatch(/"(date|publishedAt)" >= \?/);
        expect(query.sql).toMatch(/"(date|publishedAt)" <= \?/);
        expect(query.values).toContainEqual([mockOrgId]);
      }
      // Posts are counted from published posts, not from synced analytics rows.
      const postsLookup = lookups.find(({ sql }) =>
        sql.includes('FROM "posts"'),
      );
      expect(postsLookup?.sql).toContain('"publishedAt" IS NOT NULL');
      expect(postsLookup?.sql).toContain('"isDeleted" = false');
    });
  });

  // ==========================================================================
  // getBrandsLeaderboard
  // ==========================================================================
  describe('getBrandsLeaderboard', () => {
    const mockBrandId = 'brand-cuid-1';
    const mockOrgId = 'org-cuid-1';
    const mockBrands = [
      {
        id: mockBrandId,
        createdAt: new Date(),
        label: 'Test Brand',
        logo: { cdnUrl: 'https://cdn.example.com/brand-logo.png' },
        name: 'Test Brand Name',
        org: { id: mockOrgId, label: 'Parent Org' },
        organizationId: mockOrgId,
      },
    ];

    beforeEach(() => {
      mockBrandsService.findAll.mockResolvedValue({ docs: mockBrands });
      mockPrismaService.$queryRaw.mockResolvedValue([]);
    });

    it('should return empty array and skip hydration when no brands rank', async () => {
      const result = await service.getBrandsLeaderboard();

      expect(result).toEqual([]);
      expect(mockBrandsService.findAll).not.toHaveBeenCalled();
    });

    it('should return brands with analytics', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(rankRows(mockBrandId))
        .mockResolvedValueOnce([
          analyticsRow(mockBrandId, {
            avg_engagement_rate: 8.5,
            platforms: [CredentialPlatform.YOUTUBE, CredentialPlatform.TIKTOK],
            total_comments: BigInt(100),
            total_likes: BigInt(200),
            total_saves: BigInt(20),
            total_shares: BigInt(50),
            total_views: BigInt(2000),
          }),
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getBrandsLeaderboard();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Brand');
      expect(result[0].totalViews).toBe(2000);
      expect(result[0].totalEngagement).toBe(370);
      expect(result[0].activePlatforms).toContain(CredentialPlatform.YOUTUBE);
    });

    it('should keep the order the database ranked the brands in', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: [
          { id: 'brand-1', label: 'Brand1' },
          { id: 'brand-2', label: 'Brand2' },
        ],
      });
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(rankRows('brand-2', 'brand-1'))
        .mockResolvedValueOnce([
          analyticsRow('brand-1'),
          analyticsRow('brand-2'),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(postCountRows(['brand-1', 1], ['brand-2', 3]));

      const result = await service.getBrandsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.POSTS,
      );

      expect(result.map((brand) => brand.name)).toEqual(['Brand2', 'Brand1']);
      expect(result[0].totalPosts).toBe(3);
    });

    it('should scope ranking and hydration to the given organizationId', async () => {
      const orgId = 'org-scoped-xyz';
      const capturedQueries = captureQueryRawCalls([rankRows(mockBrandId)]);

      await service.getBrandsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.ENGAGEMENT,
        10,
        orgId,
      );

      expect(capturedQueries[0].sql).toContain('e."organizationId" = ?');
      expect(capturedQueries[0].sql).toContain('AND "organizationId" = ?');
      expect(
        capturedQueries[0].values.filter((value) => value === orgId),
      ).toHaveLength(2);
      expect(mockBrandsService.findAll).toHaveBeenCalledWith(
        {
          where: {
            id: { in: [mockBrandId] },
            isDeleted: false,
            organizationId: orgId,
          },
        },
        { pagination: false },
      );
    });

    it('should NOT include an organizationId filter when none is provided', async () => {
      const capturedQueries = captureQueryRawCalls([rankRows(mockBrandId)]);

      await service.getBrandsLeaderboard();

      expect(capturedQueries[0].sql).not.toContain('"organizationId" = ?');
      expect(mockBrandsService.findAll).toHaveBeenCalledWith(
        { where: { id: { in: [mockBrandId] }, isDeleted: false } },
        { pagination: false },
      );
    });

    it('should rank live brands only, including those with no analytics', async () => {
      const capturedQueries = captureQueryRawCalls([[]]);

      await service.getBrandsLeaderboard();

      expect(capturedQueries[0].sql).toContain('FROM "brands" e');
      expect(capturedQueries[0].sql).toContain('LEFT JOIN');
      expect(capturedQueries[0].sql).toContain('e."isDeleted" = false');
      expect(capturedQueries[0].sql).toContain('GROUP BY "brandId"');
    });

    it('should parameterize brand ids and date windows in raw analytics queries', async () => {
      const capturedQueries = captureQueryRawCalls([
        rankRows(mockBrandId),
        [],
        [],
        [],
      ]);

      await service.getBrandsLeaderboard('2025-01-01', '2025-01-31');

      expect(capturedQueries).toHaveLength(4);
      const [rankQuery, ...lookups] = capturedQueries;
      expect(rankQuery.sql).toContain('"date" >= ?');
      expect(rankQuery.sql).toContain('"date" <= ?');
      for (const query of lookups) {
        expect(query.sql).toContain('"brandId" = ANY(?::text[])');
        expect(query.sql).toMatch(/"(date|publishedAt)" >= \?/);
        expect(query.sql).toMatch(/"(date|publishedAt)" <= \?/);
        expect(query.values).toContainEqual([mockBrandId]);
      }
    });
  });

  // ==========================================================================
  // getOrganizationsWithStats
  // ==========================================================================
  describe('getOrganizationsWithStats', () => {
    beforeEach(() => {
      mockOrganizationsService.findAll.mockResolvedValue({ docs: [] });
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.brand.groupBy.mockResolvedValue([]);
      mockPrismaService.organization.count.mockResolvedValue(0);
    });

    it('should return a database-paged response', async () => {
      const rankedIds = Array.from({ length: 10 }, (_, i) => `org-${i}`);
      const capturedQueries = captureQueryRawCalls([rankRows(...rankedIds)]);
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: rankedIds.map((id) => ({ id, label: id })),
      });
      mockPrismaService.organization.count.mockResolvedValue(25);

      const result = await service.getOrganizationsWithStats(
        undefined,
        undefined,
        1,
        10,
      );

      expect(result.data).toHaveLength(10);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
      expect(capturedQueries[0].values.slice(-2)).toEqual([10, 0]);
      expect(mockPrismaService.organization.count).toHaveBeenCalledWith({
        where: { isDeleted: false },
      });
    });

    it('should offset the ranking query by the requested page', async () => {
      const capturedQueries = captureQueryRawCalls([[]]);
      mockPrismaService.organization.count.mockResolvedValue(25);

      const result = await service.getOrganizationsWithStats(
        undefined,
        undefined,
        3,
        10,
      );

      expect(capturedQueries[0].values.slice(-2)).toEqual([10, 20]);
      // A page past the end is empty but still reports the real total.
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(25);
      expect(mockOrganizationsService.findAll).not.toHaveBeenCalled();
    });

    it('should include brand counts per org, for the page only', async () => {
      const orgId = 'org-cuid-1';
      mockPrismaService.$queryRaw.mockResolvedValueOnce(rankRows(orgId));
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [{ id: orgId, label: 'Test Org' }],
      });
      mockPrismaService.brand.groupBy.mockResolvedValue([
        { organizationId: orgId, _count: { id: 5 } },
      ]);

      const result = await service.getOrganizationsWithStats();

      expect(result.data[0].totalBrands).toBe(5);
      expect(mockPrismaService.brand.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: false, organizationId: { in: [orgId] } },
        }),
      );
    });

    it('applies the name search to the ranking query and the total, not in memory', async () => {
      const capturedQueries = captureQueryRawCalls([rankRows('acme-1')]);
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [{ id: 'acme-1', label: 'Acme 1' }],
      });
      mockPrismaService.organization.count.mockResolvedValue(12);

      const result = await service.getOrganizationsWithStats(
        undefined,
        undefined,
        2,
        10,
        LeaderboardSort.ENGAGEMENT,
        ' ACME ',
      );

      expect(capturedQueries[0].sql).toContain('e."label" ILIKE ?');
      expect(capturedQueries[0].values).toContain('%ACME%');
      expect(mockPrismaService.organization.count).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          label: { contains: 'ACME', mode: 'insensitive' },
        },
      });
      expect(result.pagination.total).toBe(12);
      expect(result.pagination.totalPages).toBe(2);
    });

    it('ignores a blank search', async () => {
      const capturedQueries = captureQueryRawCalls([[]]);

      await service.getOrganizationsWithStats(
        undefined,
        undefined,
        1,
        10,
        LeaderboardSort.ENGAGEMENT,
        '   ',
      );

      expect(capturedQueries[0].sql).not.toContain('ILIKE');
    });

    it('returns each organization owner, falling back from name to email', async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce(
        rankRows('org-a', 'org-b', 'org-c'),
      );
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [
          { id: 'org-a', label: 'A', userId: 'user-a' },
          { id: 'org-b', label: 'B', userId: 'user-b' },
          { id: 'org-c', label: 'C', userId: null },
        ],
      });
      mockPrismaService.user.findMany.mockResolvedValue([
        {
          avatar: 'https://cdn.test/a.png',
          email: 'ada@example.com',
          firstName: 'Ada',
          handle: 'ada',
          id: 'user-a',
          lastName: 'Lovelace',
          name: null,
        },
        {
          avatar: null,
          email: 'bob@example.com',
          firstName: null,
          handle: 'bob',
          id: 'user-b',
          lastName: null,
          name: null,
        },
      ]);

      const result = await service.getOrganizationsWithStats();

      expect(result.data.map(({ id, owner }) => [id, owner])).toEqual([
        [
          'org-a',
          {
            avatar: 'https://cdn.test/a.png',
            email: 'ada@example.com',
            id: 'user-a',
            name: 'Ada Lovelace',
          },
        ],
        [
          'org-b',
          {
            avatar: undefined,
            email: 'bob@example.com',
            id: 'user-b',
            name: 'bob@example.com',
          },
        ],
        ['org-c', undefined],
      ]);
    });

    it("prefers the organization's own logo asset over the auth provider logo", async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce(
        rankRows('org-a', 'org-b', 'org-c'),
      );
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [
          { id: 'org-a', label: 'A', authProviderLogoUrl: 'https://auth/a' },
          { id: 'org-b', label: 'B', authProviderLogoUrl: 'https://auth/b' },
          { id: 'org-c', label: 'C' },
        ],
      });
      mockOrganizationLogoService.resolveLogoUrls.mockResolvedValue(
        new Map([['org-a', 'https://cdn/a-logo.png']]),
      );

      const result = await service.getOrganizationsWithStats();

      expect(result.data.map(({ id, logo }) => [id, logo])).toEqual([
        ['org-a', 'https://cdn/a-logo.png'],
        ['org-b', 'https://auth/b'],
        ['org-c', undefined],
      ]);
    });

    it('ranks and counts only the requested organization', async () => {
      const capturedQueries = captureQueryRawCalls([rankRows('org-9')]);
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [{ id: 'org-9', label: 'Nine' }],
      });
      mockPrismaService.organization.count.mockResolvedValue(1);

      const result = await service.getOrganizationsWithStats(
        undefined,
        undefined,
        1,
        1,
        LeaderboardSort.ENGAGEMENT,
        undefined,
        'org-9',
      );

      expect(capturedQueries[0].sql).toContain('e."id" = ?');
      expect(capturedQueries[0].values).toContain('org-9');
      expect(mockPrismaService.organization.count).toHaveBeenCalledWith({
        where: { id: 'org-9', isDeleted: false },
      });
      expect(result.data.map(({ id }) => id)).toEqual(['org-9']);
    });

    it('keeps only organizations of the requested type, by account type then category', async () => {
      const capturedQueries = captureQueryRawCalls([rankRows('agency-1')]);
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [{ id: 'agency-1', label: 'Agency One' }],
      });
      mockPrismaService.organization.count.mockResolvedValue(3);

      const result = await service.getOrganizationsWithStats(
        undefined,
        undefined,
        1,
        10,
        LeaderboardSort.ENGAGEMENT,
        undefined,
        undefined,
        OrganizationCategory.AGENCY,
      );

      expect(capturedQueries[0].sql).toContain(
        'COALESCE(e."accountType", e."category") = ?::"OrganizationCategory"',
      );
      expect(capturedQueries[0].values).toContain('AGENCY');
      expect(mockPrismaService.organization.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { accountType: 'AGENCY' },
            { accountType: null, category: 'AGENCY' },
          ],
          isDeleted: false,
        },
      });
      expect(result.pagination.total).toBe(3);
    });

    it('does not filter by type when none is requested', async () => {
      const capturedQueries = captureQueryRawCalls([[]]);

      await service.getOrganizationsWithStats(undefined, undefined, 1, 10);

      expect(capturedQueries[0].sql).not.toContain('OrganizationCategory');
    });

    it.each([
      [LeaderboardOrder.ASC, 'ASC'],
      [LeaderboardOrder.DESC, 'DESC'],
    ])(
      'ranks %s by the metric in the requested direction',
      async (order, keyword) => {
        const capturedQueries = captureQueryRawCalls([[]]);

        await service.getOrganizationsWithStats(
          undefined,
          undefined,
          1,
          10,
          LeaderboardSort.VIEWS,
          undefined,
          undefined,
          undefined,
          order,
        );

        expect(capturedQueries[0].sql).toContain(
          `ORDER BY COALESCE(m.metric, 0) ${keyword}, e."createdAt" DESC`,
        );
      },
    );

    it('reports the organization type, preferring onboarding accountType over category', async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce(
        rankRows('org-a', 'org-b'),
      );
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [
          {
            accountType: 'AGENCY',
            category: 'BUSINESS',
            createdAt: new Date('2026-10-01T10:00:00.000Z'),
            id: 'org-a',
            label: 'A',
            slug: 'a-slug',
          },
          { accountType: null, category: 'BUSINESS', id: 'org-b', label: 'B' },
        ],
      });

      const result = await service.getOrganizationsWithStats();

      expect(
        result.data.map(({ id, slug, type, createdAt }) => [
          id,
          slug,
          type,
          createdAt,
        ]),
      ).toEqual([
        ['org-a', 'a-slug', 'AGENCY', '2026-10-01T10:00:00.000Z'],
        ['org-b', undefined, 'BUSINESS', undefined],
      ]);
    });

    it('should not count brands when the page is empty', async () => {
      await service.getOrganizationsWithStats();

      expect(mockPrismaService.brand.groupBy).not.toHaveBeenCalled();
    });

    it('should include active member counts per org', async () => {
      const orgId = 'org-cuid-2';
      mockPrismaService.$queryRaw.mockResolvedValueOnce(rankRows(orgId));
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [{ id: orgId, label: 'Test Org' }],
      });
      mockPrismaService.member.groupBy.mockResolvedValue([
        { organizationId: orgId, _count: { id: 3 } },
      ]);

      const result = await service.getOrganizationsWithStats();

      expect(result.data[0].totalMembers).toBe(3);
      expect(mockPrismaService.member.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            isDeleted: false,
            organizationId: { in: [orgId] },
          },
        }),
      );
    });
  });

  // ==========================================================================
  // getBrandsWithStats
  // ==========================================================================
  describe('getBrandsWithStats', () => {
    beforeEach(() => {
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.brand.count.mockResolvedValue(0);
    });

    it('should return a database-paged response', async () => {
      const rankedIds = Array.from({ length: 10 }, (_, i) => `brand-${i}`);
      const capturedQueries = captureQueryRawCalls([rankRows(...rankedIds)]);
      mockBrandsService.findAll.mockResolvedValue({
        docs: rankedIds.map((id) => ({ id, label: id })),
      });
      mockPrismaService.brand.count.mockResolvedValue(30);

      const result = await service.getBrandsWithStats(
        undefined,
        undefined,
        2,
        10,
      );

      expect(result.data).toHaveLength(10);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.total).toBe(30);
      expect(result.pagination.totalPages).toBe(3);
      expect(capturedQueries[0].values.slice(-2)).toEqual([10, 10]);
    });

    it('applies the name search to the ranking query and the total, not in memory', async () => {
      const capturedQueries = captureQueryRawCalls([rankRows('acme-1')]);
      mockBrandsService.findAll.mockResolvedValue({
        docs: [{ id: 'acme-1', label: 'Acme 1' }],
      });
      mockPrismaService.brand.count.mockResolvedValue(12);

      const result = await service.getBrandsWithStats(
        undefined,
        undefined,
        2,
        10,
        LeaderboardSort.ENGAGEMENT,
        undefined,
        ' ACME ',
      );

      expect(capturedQueries[0].sql).toContain('e."label" ILIKE ?');
      expect(capturedQueries[0].values).toContain('%ACME%');
      expect(mockPrismaService.brand.count).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          label: { contains: 'ACME', mode: 'insensitive' },
        },
      });
      expect(result.pagination.total).toBe(12);
      expect(result.pagination.totalPages).toBe(2);
    });

    it('escapes LIKE wildcards in the name search', async () => {
      const capturedQueries = captureQueryRawCalls([[]]);

      await service.getBrandsWithStats(
        undefined,
        undefined,
        1,
        10,
        LeaderboardSort.ENGAGEMENT,
        undefined,
        '50%_off\\',
      );

      expect(capturedQueries[0].values).toContain('%50\\%\\_off\\\\%');
    });

    it('ignores a blank search', async () => {
      const capturedQueries = captureQueryRawCalls([[]]);

      await service.getBrandsWithStats(
        undefined,
        undefined,
        1,
        10,
        LeaderboardSort.ENGAGEMENT,
        undefined,
        '   ',
      );

      expect(capturedQueries[0].sql).not.toContain('ILIKE');
      expect(mockPrismaService.brand.count).toHaveBeenCalledWith({
        where: { isDeleted: false },
      });
    });

    it('narrows ranking and count to the selected brand within the organization', async () => {
      const capturedQueries = captureQueryRawCalls([rankRows('brand-1')]);
      mockBrandsService.findAll.mockResolvedValue({
        docs: [{ id: 'brand-1', label: 'Brand 1', organizationId: 'org-1' }],
      });
      mockPrismaService.brand.count.mockResolvedValue(1);

      const result = await service.getBrandsWithStats(
        undefined,
        undefined,
        1,
        20,
        LeaderboardSort.ENGAGEMENT,
        'org-1',
        undefined,
        'brand-1',
      );

      expect(capturedQueries[0].sql).toContain('e."id" = ?');
      expect(capturedQueries[0].sql).toContain('e."organizationId" = ?');
      expect(capturedQueries[0].values).toContain('brand-1');
      expect(mockPrismaService.brand.count).toHaveBeenCalledWith({
        where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
      });
      expect(result.pagination.total).toBe(1);
    });

    it('does not filter by brand when none is selected', async () => {
      const capturedQueries = captureQueryRawCalls([[]]);

      await service.getBrandsWithStats(undefined, undefined, 1, 20);

      expect(capturedQueries[0].sql).not.toContain('e."id" = ?');
    });

    it('should scope ranking, count and hydration to the given organizationId', async () => {
      const orgId = 'org-stats-scoped';
      const capturedQueries = captureQueryRawCalls([rankRows('brand-1')]);
      mockBrandsService.findAll.mockResolvedValue({
        docs: [{ id: 'brand-1', label: 'Brand 1', organizationId: orgId }],
      });

      await service.getBrandsWithStats(
        undefined,
        undefined,
        1,
        20,
        LeaderboardSort.ENGAGEMENT,
        orgId,
      );

      expect(capturedQueries[0].sql).toContain('e."organizationId" = ?');
      expect(mockPrismaService.brand.count).toHaveBeenCalledWith({
        where: { isDeleted: false, organizationId: orgId },
      });
      expect(mockBrandsService.findAll).toHaveBeenCalledWith(
        {
          where: {
            id: { in: ['brand-1'] },
            isDeleted: false,
            organizationId: orgId,
          },
        },
        { pagination: false },
      );
    });

    it('should NOT include an organizationId filter when none is provided', async () => {
      const capturedQueries = captureQueryRawCalls([rankRows('brand-1')]);
      mockBrandsService.findAll.mockResolvedValue({
        docs: [{ id: 'brand-1', label: 'Brand 1' }],
      });

      await service.getBrandsWithStats();

      expect(capturedQueries[0].sql).not.toContain('"organizationId" = ?');
      expect(mockPrismaService.brand.count).toHaveBeenCalledWith({
        where: { isDeleted: false },
      });
    });
  });

  // ==========================================================================
  // Avatars
  //
  // `entity.logo` is a Mongo-era populated relation that survives only in the
  // `*Document` index signature: the Prisma `Brand` model has no logo column
  // and `Organization` has only `authProviderLogoUrl`. Reading it type-checks
  // and is permanently `undefined`, which is why every avatar rendered blank.
  // ==========================================================================
  describe('avatars', () => {
    const brandDoc = (id: string, organizationId: string) => ({
      id,
      label: `Brand ${id}`,
      // The dead alias, present exactly as a populated Mongo doc would carry
      // it. Nothing may read it.
      logo: { cdnUrl: 'https://cdn.example.com/dead-alias.png' },
      organizationId,
    });

    /** Rank and hydrate exactly these docs, as the database page would. */
    const givenRankedBrands = (docs: ReturnType<typeof brandDoc>[]) => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce(
        rankRows(...docs.map((doc) => doc.id)),
      );
      mockBrandsService.findAll.mockResolvedValue({ docs });
    };

    it('resolves brand logos from Asset rows, not the dead brand.logo alias', async () => {
      givenRankedBrands([brandDoc('brand-1', 'org-1')]);
      mockBrandsService.resolveBrandLogoUrls.mockResolvedValue(
        new Map([['brand-1', 'https://cdn.example.com/logos/asset-a']]),
      );

      const result = await service.getBrandsLeaderboard();

      expect(result[0].logo).toBe('https://cdn.example.com/logos/asset-a');
    });

    it('leaves a brand logo undefined when no live logo asset exists', async () => {
      givenRankedBrands([brandDoc('brand-1', 'org-1')]);
      mockBrandsService.resolveBrandLogoUrls.mockResolvedValue(new Map());

      const result = await service.getBrandsLeaderboard();

      expect(result[0].logo).toBeUndefined();
    });

    it('groups brand ids by owning organization for the batched read', async () => {
      givenRankedBrands([
        brandDoc('brand-1', 'org-1'),
        brandDoc('brand-2', 'org-1'),
        brandDoc('brand-3', 'org-2'),
      ]);

      await service.getBrandsLeaderboard();

      expect(mockBrandsService.resolveBrandLogoUrls).toHaveBeenCalledWith(
        new Map([
          ['org-1', ['brand-1', 'brand-2']],
          ['org-2', ['brand-3']],
        ]),
      );
    });

    it('resolves a whole page of brands in one batched call, not one per brand', async () => {
      givenRankedBrands(
        Array.from({ length: 25 }, (_, index) =>
          brandDoc(`brand-${index}`, 'org-1'),
        ),
      );

      await service.getBrandsLeaderboard();

      expect(mockBrandsService.resolveBrandLogoUrls).toHaveBeenCalledTimes(1);
    });

    it('resolves brand logos on the paginated stats path too', async () => {
      givenRankedBrands([brandDoc('brand-1', 'org-1')]);
      mockBrandsService.resolveBrandLogoUrls.mockResolvedValue(
        new Map([['brand-1', 'https://cdn.example.com/logos/asset-a']]),
      );

      const result = await service.getBrandsWithStats();

      expect(result.data[0].logo).toBe('https://cdn.example.com/logos/asset-a');
    });

    it('reads organization avatars from authProviderLogoUrl, not the dead org.logo alias', async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce(rankRows('org-1'));
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'org-1',
            authProviderLogoUrl: 'https://auth.example.com/org.png',
            label: 'Test Org',
            logo: { cdnUrl: 'https://cdn.example.com/dead-alias.png' },
          },
        ],
      });

      const result = await service.getOrganizationsLeaderboard();

      expect(result[0].organization.logo).toBe(
        'https://auth.example.com/org.png',
      );
    });

    it('leaves an organization avatar undefined when the auth provider supplied none', async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce(rankRows('org-1'));
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [{ id: 'org-1', authProviderLogoUrl: null, label: 'Test Org' }],
      });

      const result = await service.getOrganizationsLeaderboard();

      expect(result[0].organization.logo).toBeUndefined();
    });

    it('reads organization avatars from authProviderLogoUrl on the paginated stats path too', async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce(rankRows('org-1'));
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'org-1',
            authProviderLogoUrl: 'https://auth.example.com/org.png',
            label: 'Test Org',
          },
        ],
      });

      const result = await service.getOrganizationsWithStats();

      expect(result.data[0].logo).toBe('https://auth.example.com/org.png');
    });

    it('resolves logos only for the ranked page, not the whole brand table', async () => {
      // The database returns just the page; hydration and logos never see the
      // other 20 brands.
      givenRankedBrands(
        Array.from({ length: 5 }, (_, index) =>
          brandDoc(`brand-${index}`, 'org-1'),
        ),
      );

      await service.getBrandsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.ENGAGEMENT,
        5,
      );

      const [brandIdsByOrganization] =
        mockBrandsService.resolveBrandLogoUrls.mock.calls[0];
      expect(brandIdsByOrganization.get('org-1')).toHaveLength(5);
    });

    it('does not resolve brand logos when the page is empty', async () => {
      await service.getBrandsLeaderboard();

      expect(mockBrandsService.resolveBrandLogoUrls).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Organization names
  //
  // `brand.org` is a Mongo-era populated relation surviving only in the
  // `BrandDocument` index signature. `BrandsService` passes `undefined` for
  // the populate argument, so nothing ever populates it — reading it
  // type-checks and is permanently `undefined`, which is why every row of the
  // brands leaderboard rendered the literal string "Unknown". Names come from
  // `Organization` rows keyed by the `organizationId` scalar FK instead.
  // ==========================================================================
  describe('organization names', () => {
    const brandDoc = (id: string, organizationId?: string) => ({
      id,
      label: `Brand ${id}`,
      // The dead alias, present exactly as a populated Mongo doc would carry
      // it. Nothing may read it.
      org: { id: 'org-ghost', label: 'Ghost Org', name: 'Ghost Org Name' },
      organizationId,
    });

    /** Rank and hydrate exactly these docs, as the database page would. */
    const givenRankedBrands = (docs: ReturnType<typeof brandDoc>[]) => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce(
        rankRows(...docs.map((doc) => doc.id)),
      );
      mockBrandsService.findAll.mockResolvedValue({ docs });
    };

    it('resolves organizationName from Organization rows, not the dead brand.org alias', async () => {
      givenRankedBrands([brandDoc('brand-1', 'org-1')]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-1', label: 'Real Org' },
      ]);

      const result = await service.getBrandsLeaderboard();

      expect(result[0].organizationName).toBe('Real Org');
      expect(result[0].organizationId).toBe('org-1');
    });

    it('falls back to Unknown when the organization row is missing', async () => {
      givenRankedBrands([brandDoc('brand-1', 'org-1')]);
      mockPrismaService.organization.findMany.mockResolvedValue([]);

      const result = await service.getBrandsLeaderboard();

      expect(result[0].organizationName).toBe('Unknown');
    });

    it('takes organizationId from the scalar FK and never from the org alias', async () => {
      givenRankedBrands([brandDoc('brand-1', undefined)]);

      const result = await service.getBrandsLeaderboard();

      expect(result[0].organizationId).toBeUndefined();
      expect(result[0].organizationName).toBe('Unknown');
    });

    it('scopes the organization read to live rows by id', async () => {
      givenRankedBrands([brandDoc('brand-1', 'org-1')]);

      await service.getBrandsLeaderboard();

      expect(mockPrismaService.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['org-1'] }, isDeleted: false },
        }),
      );
    });

    it('reads a page of brands in one batched query with deduplicated org ids', async () => {
      givenRankedBrands(
        Array.from({ length: 25 }, (_, index) =>
          brandDoc(`brand-${index}`, index % 2 === 0 ? 'org-1' : 'org-2'),
        ),
      );

      await service.getBrandsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.ENGAGEMENT,
        25,
      );

      expect(mockPrismaService.organization.findMany).toHaveBeenCalledTimes(1);
      const [{ where }] = mockPrismaService.organization.findMany.mock.calls[0];
      expect(where.id.in).toEqual(['org-1', 'org-2']);
    });

    it('resolves names only for the ranked page, not the whole brand table', async () => {
      givenRankedBrands(
        Array.from({ length: 5 }, (_, index) =>
          brandDoc(`brand-${index}`, `org-${index}`),
        ),
      );

      await service.getBrandsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.ENGAGEMENT,
        5,
      );

      const [{ where }] = mockPrismaService.organization.findMany.mock.calls[0];
      expect(where.id.in).toHaveLength(5);
    });

    it('resolves names on the paginated stats path too', async () => {
      givenRankedBrands([brandDoc('brand-1', 'org-1')]);
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-1', label: 'Real Org' },
      ]);

      const result = await service.getBrandsWithStats();

      expect(result.data[0].organizationName).toBe('Real Org');
      expect(result.data[0].organizationId).toBe('org-1');
    });

    it('does not query organizations when the page is empty', async () => {
      await service.getBrandsLeaderboard();

      expect(mockPrismaService.organization.findMany).not.toHaveBeenCalled();
    });
  });
});
