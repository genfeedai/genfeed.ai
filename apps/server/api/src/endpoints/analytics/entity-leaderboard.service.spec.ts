vi.mock('@genfeedai/prisma', () => ({
  Prisma: {
    empty: { sql: '', values: [] },
    raw: (sql: string) => ({ sql, values: [] }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
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

      return { sql: parts.join(''), values: parameters };
    },
  },
  PrismaClient: class {},
}));

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

  const mockOrganizationsService = {
    count: vi.fn(),
    findAll: vi.fn(),
  };

  const mockBrandsService = {
    count: vi.fn(),
    findAll: vi.fn(),
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
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockPrismaService.$queryRaw.mockResolvedValue([]);
    mockPrismaService.brand.groupBy.mockResolvedValue([]);

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
  });
});
