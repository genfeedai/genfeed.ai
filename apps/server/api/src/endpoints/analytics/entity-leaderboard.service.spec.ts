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
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { LeaderboardSort } from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { EntityLeaderboardService } from '@api/endpoints/analytics/entity-leaderboard.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform } from '@genfeedai/enums';
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
    organization: {
      count: vi.fn(),
      findMany: vi.fn(),
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

    mockPrismaService.$queryRaw.mockResolvedValue([]);
    mockPrismaService.brand.groupBy.mockResolvedValue([]);
    mockPrismaService.organization.findMany.mockResolvedValue([]);
    mockBrandsService.resolveBrandLogoUrls.mockResolvedValue(new Map());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityLeaderboardService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        { provide: BrandsService, useValue: mockBrandsService },
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

    it('should return empty array when no organizations exist', async () => {
      mockOrganizationsService.findAll.mockResolvedValue({ docs: [] });

      const result = await service.getOrganizationsLeaderboard();

      expect(result).toEqual([]);
    });

    it('should return organizations with analytics', async () => {
      // $queryRaw is called twice: getCurrentAnalytics, getPreviousEngagement
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          {
            entity_id: mockOrgId,
            avg_engagement_rate: 5.5,
            total_views: BigInt(1000),
            total_likes: BigInt(100),
            total_comments: BigInt(50),
            total_shares: BigInt(25),
            total_saves: BigInt(10),
            unique_posts: BigInt(2),
          },
        ])
        .mockResolvedValueOnce([]); // previous period

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
        .mockResolvedValueOnce([
          {
            entity_id: mockOrgId,
            avg_engagement_rate: 5,
            total_views: BigInt(200),
            total_likes: BigInt(100),
            total_comments: BigInt(50),
            total_shares: BigInt(25),
            total_saves: BigInt(25),
            unique_posts: BigInt(1),
          },
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
        .mockResolvedValueOnce([
          {
            entity_id: mockOrgId,
            avg_engagement_rate: 3,
            total_views: BigInt(100),
            total_likes: BigInt(10),
            total_comments: BigInt(5),
            total_shares: BigInt(2),
            total_saves: BigInt(1),
            unique_posts: BigInt(1),
          },
        ])
        .mockResolvedValueOnce([]); // no previous data

      const result = await service.getOrganizationsLeaderboard();

      expect(result[0].growth).toBe(100);
    });

    it('should sort by views when sort=VIEWS', async () => {
      const org1 = { id: 'org-1', label: 'Org1' };
      const org2 = { id: 'org-2', label: 'Org2' };
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [org1, org2],
      });

      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          {
            entity_id: 'org-1',
            avg_engagement_rate: 0,
            total_views: BigInt(100),
            total_likes: BigInt(50),
            total_comments: BigInt(0),
            total_shares: BigInt(0),
            total_saves: BigInt(0),
            unique_posts: BigInt(0),
          },
          {
            entity_id: 'org-2',
            avg_engagement_rate: 0,
            total_views: BigInt(500),
            total_likes: BigInt(10),
            total_comments: BigInt(0),
            total_shares: BigInt(0),
            total_saves: BigInt(0),
            unique_posts: BigInt(0),
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getOrganizationsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.VIEWS,
      );

      expect(result[0].organization.name).toBe('Org2');
      expect(result[0].totalViews).toBe(500);
    });

    it('should respect limit parameter', async () => {
      const orgs = Array.from({ length: 20 }, (_, i) => ({
        id: `org-${i}`,
        label: `Org ${i}`,
      }));
      mockOrganizationsService.findAll.mockResolvedValue({ docs: orgs });
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.getOrganizationsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.ENGAGEMENT,
        5,
      );

      expect(result).toHaveLength(5);
    });

    it('should parameterize organization ids and date windows in raw analytics queries', async () => {
      const capturedQueries = captureQueryRawCalls([[], []]);

      await service.getOrganizationsLeaderboard('2025-01-01', '2025-01-31');

      expect(capturedQueries).toHaveLength(2);
      for (const query of capturedQueries) {
        expect(query.sql).toContain('"organizationId" = ANY(?::text[])');
        expect(query.sql).toContain('"date" >= ?');
        expect(query.sql).toContain('"date" <= ?');
        expect(query.values).toContainEqual([mockOrgId]);
      }
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

    it('should return empty array when no brands exist', async () => {
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });

      const result = await service.getBrandsLeaderboard();

      expect(result).toEqual([]);
    });

    it('should return brands with analytics', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          {
            entity_id: mockBrandId,
            avg_engagement_rate: 8.5,
            total_views: BigInt(2000),
            total_likes: BigInt(200),
            total_comments: BigInt(100),
            total_shares: BigInt(50),
            total_saves: BigInt(20),
            unique_posts: BigInt(1),
            platforms: [CredentialPlatform.YOUTUBE, CredentialPlatform.TIKTOK],
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getBrandsLeaderboard();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Brand');
      expect(result[0].totalViews).toBe(2000);
      expect(result[0].totalEngagement).toBe(370);
      expect(result[0].activePlatforms).toContain(CredentialPlatform.YOUTUBE);
    });

    it('should sort by posts when sort=POSTS', async () => {
      const brand1 = { id: 'brand-1', label: 'Brand1', org: { label: 'Org1' } };
      const brand2 = { id: 'brand-2', label: 'Brand2', org: { label: 'Org2' } };
      mockBrandsService.findAll.mockResolvedValue({ docs: [brand1, brand2] });

      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          {
            entity_id: 'brand-1',
            avg_engagement_rate: 0,
            total_views: BigInt(100),
            total_likes: BigInt(0),
            total_comments: BigInt(0),
            total_shares: BigInt(0),
            total_saves: BigInt(0),
            unique_posts: BigInt(1),
            platforms: [],
          },
          {
            entity_id: 'brand-2',
            avg_engagement_rate: 0,
            total_views: BigInt(50),
            total_likes: BigInt(0),
            total_comments: BigInt(0),
            total_shares: BigInt(0),
            total_saves: BigInt(0),
            unique_posts: BigInt(3),
            platforms: [],
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getBrandsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.POSTS,
      );

      expect(result[0].name).toBe('Brand2');
      expect(result[0].totalPosts).toBe(3);
    });

    it('should scope BrandsService.findAll to the given organizationId', async () => {
      const orgId = 'org-scoped-xyz';
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });

      await service.getBrandsLeaderboard(
        undefined,
        undefined,
        LeaderboardSort.ENGAGEMENT,
        10,
        orgId,
      );

      expect(mockBrandsService.findAll).toHaveBeenCalledWith(
        { where: { isDeleted: false, organizationId: orgId } },
        { pagination: false },
      );
    });

    it('should NOT include organizationId filter when no organizationId provided to getBrandsLeaderboard', async () => {
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });

      await service.getBrandsLeaderboard();

      expect(mockBrandsService.findAll).toHaveBeenCalledWith(
        { where: { isDeleted: false } },
        { pagination: false },
      );
    });

    it('should parameterize brand ids and date windows in raw analytics queries', async () => {
      const capturedQueries = captureQueryRawCalls([[], []]);

      await service.getBrandsLeaderboard('2025-01-01', '2025-01-31');

      expect(capturedQueries).toHaveLength(2);
      for (const query of capturedQueries) {
        expect(query.sql).toContain('"brandId" = ANY(?::text[])');
        expect(query.sql).toContain('"date" >= ?');
        expect(query.sql).toContain('"date" <= ?');
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
    });

    it('should return paginated response', async () => {
      const orgs = Array.from({ length: 25 }, (_, i) => ({
        id: `org-${i}`,
        label: `Org ${i}`,
      }));
      mockOrganizationsService.findAll.mockResolvedValue({ docs: orgs });

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
    });

    it('should include brand counts per org', async () => {
      const orgId = 'org-cuid-1';
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [{ id: orgId, label: 'Test Org' }],
      });
      mockPrismaService.brand.groupBy.mockResolvedValue([
        { organizationId: orgId, _count: { id: 5 } },
      ]);

      const result = await service.getOrganizationsWithStats();

      expect(result.data[0].totalBrands).toBe(5);
    });
  });

  // ==========================================================================
  // getBrandsWithStats
  // ==========================================================================
  describe('getBrandsWithStats', () => {
    beforeEach(() => {
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });
      mockPrismaService.$queryRaw.mockResolvedValue([]);
    });

    it('should return paginated response', async () => {
      const brands = Array.from({ length: 30 }, (_, i) => ({
        id: `brand-${i}`,
        label: `Brand ${i}`,
        org: { label: 'Org' },
      }));
      mockBrandsService.findAll.mockResolvedValue({ docs: brands });

      const result = await service.getBrandsWithStats(
        undefined,
        undefined,
        2,
        10,
      );

      expect(result.data).toHaveLength(10);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.total).toBe(30);
    });

    it('should scope BrandsService.findAll to the given organizationId', async () => {
      const orgId = 'org-stats-scoped';
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });

      await service.getBrandsWithStats(
        undefined,
        undefined,
        1,
        20,
        LeaderboardSort.ENGAGEMENT,
        orgId,
      );

      expect(mockBrandsService.findAll).toHaveBeenCalledWith(
        { where: { isDeleted: false, organizationId: orgId } },
        { pagination: false },
      );
    });

    it('should NOT include organizationId filter when no organizationId provided to getBrandsWithStats', async () => {
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });

      await service.getBrandsWithStats();

      expect(mockBrandsService.findAll).toHaveBeenCalledWith(
        { where: { isDeleted: false } },
        { pagination: false },
      );
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

    it('resolves brand logos from Asset rows, not the dead brand.logo alias', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: [brandDoc('brand-1', 'org-1')],
      });
      mockBrandsService.resolveBrandLogoUrls.mockResolvedValue(
        new Map([['brand-1', 'https://cdn.example.com/logos/asset-a']]),
      );

      const result = await service.getBrandsLeaderboard();

      expect(result[0].logo).toBe('https://cdn.example.com/logos/asset-a');
    });

    it('leaves a brand logo undefined when no live logo asset exists', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: [brandDoc('brand-1', 'org-1')],
      });
      mockBrandsService.resolveBrandLogoUrls.mockResolvedValue(new Map());

      const result = await service.getBrandsLeaderboard();

      expect(result[0].logo).toBeUndefined();
    });

    it('groups brand ids by owning organization for the batched read', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: [
          brandDoc('brand-1', 'org-1'),
          brandDoc('brand-2', 'org-1'),
          brandDoc('brand-3', 'org-2'),
        ],
      });

      await service.getBrandsLeaderboard();

      expect(mockBrandsService.resolveBrandLogoUrls).toHaveBeenCalledWith(
        new Map([
          ['org-1', ['brand-1', 'brand-2']],
          ['org-2', ['brand-3']],
        ]),
      );
    });

    it('resolves a whole page of brands in one batched call, not one per brand', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: Array.from({ length: 25 }, (_, index) =>
          brandDoc(`brand-${index}`, 'org-1'),
        ),
      });

      await service.getBrandsLeaderboard();

      expect(mockBrandsService.resolveBrandLogoUrls).toHaveBeenCalledTimes(1);
    });

    it('resolves brand logos on the paginated stats path too', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: [brandDoc('brand-1', 'org-1')],
      });
      mockBrandsService.resolveBrandLogoUrls.mockResolvedValue(
        new Map([['brand-1', 'https://cdn.example.com/logos/asset-a']]),
      );

      const result = await service.getBrandsWithStats();

      expect(result.data[0].logo).toBe('https://cdn.example.com/logos/asset-a');
    });

    it('reads organization avatars from authProviderLogoUrl, not the dead org.logo alias', async () => {
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
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [{ id: 'org-1', authProviderLogoUrl: null, label: 'Test Org' }],
      });

      const result = await service.getOrganizationsLeaderboard();

      expect(result[0].organization.logo).toBeUndefined();
    });

    it('reads organization avatars from authProviderLogoUrl on the paginated stats path too', async () => {
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
      mockBrandsService.findAll.mockResolvedValue({
        docs: Array.from({ length: 25 }, (_, index) =>
          brandDoc(`brand-${index}`, 'org-1'),
        ),
      });

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

    it('resolves logos only for the requested page on the paginated path', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: Array.from({ length: 30 }, (_, index) =>
          brandDoc(`brand-${index}`, 'org-1'),
        ),
      });

      await service.getBrandsWithStats(undefined, undefined, 2, 10);

      const [brandIdsByOrganization] =
        mockBrandsService.resolveBrandLogoUrls.mock.calls[0];
      expect(brandIdsByOrganization.get('org-1')).toHaveLength(10);
    });

    it('does not resolve brand logos when the page is empty', async () => {
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });

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

    it('resolves organizationName from Organization rows, not the dead brand.org alias', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: [brandDoc('brand-1', 'org-1')],
      });
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-1', label: 'Real Org' },
      ]);

      const result = await service.getBrandsLeaderboard();

      expect(result[0].organizationName).toBe('Real Org');
      expect(result[0].organizationId).toBe('org-1');
    });

    it('falls back to Unknown when the organization row is missing', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: [brandDoc('brand-1', 'org-1')],
      });
      mockPrismaService.organization.findMany.mockResolvedValue([]);

      const result = await service.getBrandsLeaderboard();

      expect(result[0].organizationName).toBe('Unknown');
    });

    it('takes organizationId from the scalar FK and never from the org alias', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: [brandDoc('brand-1', undefined)],
      });

      const result = await service.getBrandsLeaderboard();

      expect(result[0].organizationId).toBeUndefined();
      expect(result[0].organizationName).toBe('Unknown');
    });

    it('scopes the organization read to live rows by id', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: [brandDoc('brand-1', 'org-1')],
      });

      await service.getBrandsLeaderboard();

      expect(mockPrismaService.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['org-1'] }, isDeleted: false },
        }),
      );
    });

    it('reads a page of brands in one batched query with deduplicated org ids', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: Array.from({ length: 25 }, (_, index) =>
          brandDoc(`brand-${index}`, index % 2 === 0 ? 'org-1' : 'org-2'),
        ),
      });

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
      mockBrandsService.findAll.mockResolvedValue({
        docs: Array.from({ length: 25 }, (_, index) =>
          brandDoc(`brand-${index}`, `org-${index}`),
        ),
      });

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
      mockBrandsService.findAll.mockResolvedValue({
        docs: [brandDoc('brand-1', 'org-1')],
      });
      mockPrismaService.organization.findMany.mockResolvedValue([
        { id: 'org-1', label: 'Real Org' },
      ]);

      const result = await service.getBrandsWithStats();

      expect(result.data[0].organizationName).toBe('Real Org');
      expect(result.data[0].organizationId).toBe('org-1');
    });

    it('resolves names only for the requested page on the paginated path', async () => {
      mockBrandsService.findAll.mockResolvedValue({
        docs: Array.from({ length: 30 }, (_, index) =>
          brandDoc(`brand-${index}`, `org-${index}`),
        ),
      });

      await service.getBrandsWithStats(undefined, undefined, 2, 10);

      const [{ where }] = mockPrismaService.organization.findMany.mock.calls[0];
      expect(where.id.in).toHaveLength(10);
    });

    it('does not query organizations when the page is empty', async () => {
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });

      await service.getBrandsLeaderboard();

      expect(mockPrismaService.organization.findMany).not.toHaveBeenCalled();
    });
  });
});
