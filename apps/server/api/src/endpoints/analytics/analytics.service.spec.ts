vi.mock('@api/services/integrations/youtube/services/youtube.service', () => ({
  YoutubeService: class {},
}));
vi.mock('@api/collections/brands/services/brands.service', () => ({
  BrandsService: class {},
}));
vi.mock(
  '@api/collections/organizations/services/organizations.service',
  () => ({
    OrganizationsService: class {},
  }),
);
vi.mock('@api/collections/posts/services/posts.service', () => ({
  PostsService: class {},
}));
vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@genfeedai/prisma', () => ({
  Prisma: {
    raw: (sql: string) => sql,
  },
  PrismaClient: class {},
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { LeaderboardSort } from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AnalyticsMetric, CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('AnalyticsService', () => {
  const typed = <T>(value: unknown): T => value as T;

  let service: AnalyticsService;

  // Mock services
  const mockPostsService = {
    findAll: vi.fn(),
  };

  const mockOrganizationsService = {
    count: vi.fn(),
    findAll: vi.fn(),
  };

  const mockBrandsService = {
    count: vi.fn(),
    findAll: vi.fn(),
  };

  const mockYoutubeService = {
    getMediaAnalytics: vi.fn(),
  };

  const mockTiktokService = {
    getMediaAnalytics: vi.fn(),
  };

  const mockInstagramService = {
    getMediaAnalytics: vi.fn(),
  };

  const mockPinterestService = {
    getMediaAnalytics: vi.fn(),
  };

  const mockTwitterService = {
    getMediaAnalytics: vi.fn(),
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
        { provide: PostsService, useValue: mockPostsService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: YoutubeService, useValue: mockYoutubeService },
        { provide: TiktokService, useValue: mockTiktokService },
        { provide: InstagramService, useValue: mockInstagramService },
        { provide: PinterestService, useValue: mockPinterestService },
        { provide: TwitterService, useValue: mockTwitterService },
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

  // ==========================================================================
  // exportData
  // ==========================================================================
  describe('exportData', () => {
    beforeEach(() => {
      mockPostsService.findAll.mockResolvedValue({ docs: [] });
    });

    it('should export CSV format', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'post-1',
            brandId: 'brand-1',
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.YOUTUBE },
            label: 'Test Post',
            metadata: { label: 'Video Title' },
            organizationId: 'org-1',
            status: 'published',
            updatedAt: new Date(),
          },
        ],
      });

      const result = await service.exportData('csv', [
        'id',
        'title',
        'platform',
      ]);

      expect(typeof result).toBe('string');
      expect(result).toContain('id,title,platform');
    });

    it('should export XLSX format', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'post-2',
            brandId: 'brand-1',
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.TIKTOK },
            label: 'Test Post',
            metadata: {},
            organizationId: 'org-1',
            status: 'published',
            updatedAt: new Date(),
          },
        ],
      });

      const result = await service.exportData('xlsx', ['id', 'title']);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should return headers only when no data', async () => {
      mockPostsService.findAll.mockResolvedValue({ docs: [] });

      const result = await service.exportData('csv', [
        'id',
        'title',
        'platform',
      ]);

      expect(result).toBe('id,title,platform');
    });

    it('should fetch platform-specific analytics', async () => {
      const postId = 'post-yt-1';
      const orgId = 'org-1';
      const brandId = 'brand-1';

      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: postId,
            brandId,
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.YOUTUBE },
            externalId: 'youtube-123',
            label: 'YT Video',
            metadata: {},
            organizationId: orgId,
            status: 'published',
            updatedAt: new Date(),
          },
        ],
      });

      mockYoutubeService.getMediaAnalytics.mockResolvedValue({
        comments: 50,
        likes: 100,
        views: 1000,
      });

      const result = await service.exportData('csv', ['views', 'likes']);

      expect(mockYoutubeService.getMediaAnalytics).toHaveBeenCalledWith(
        orgId,
        brandId,
        'youtube-123',
      );
      expect(result).toContain('1000');
    });

    it('should fetch TikTok analytics', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'post-tt-1',
            brandId: 'brand-1',
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.TIKTOK },
            externalId: 'tiktok-123',
            label: 'TT Video',
            metadata: {},
            organizationId: 'org-1',
            status: 'published',
            updatedAt: new Date(),
          },
        ],
      });

      mockTiktokService.getMediaAnalytics.mockResolvedValue({
        comments: 25,
        likes: 50,
        views: 500,
      });

      await service.exportData('csv', ['views']);

      expect(mockTiktokService.getMediaAnalytics).toHaveBeenCalled();
    });

    it('should handle analytics fetch errors gracefully', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'post-err-1',
            brandId: 'brand-1',
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.INSTAGRAM },
            externalId: 'error-123',
            label: 'Error Video',
            metadata: {},
            organizationId: 'org-1',
            status: 'published',
            updatedAt: new Date(),
          },
        ],
      });

      mockInstagramService.getMediaAnalytics.mockRejectedValue(
        new Error('API Error'),
      );

      // Should not throw
      const result = await service.exportData('csv', ['id', 'views']);

      expect(result).toBeDefined();
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // exportVideoStatsCsv
  // ==========================================================================
  describe('exportVideoStatsCsv', () => {
    it('should return CSV with video stats fields', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'post-1',
            brandId: 'brand-1',
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.YOUTUBE },
            externalId: 'yt-123',
            label: 'Video 1',
            metadata: { label: 'Test Video' },
            organizationId: 'org-1',
            status: 'published',
            updatedAt: new Date(),
            views: 100,
          },
        ],
      });

      mockYoutubeService.getMediaAnalytics.mockResolvedValue({
        comments: 25,
        likes: 50,
        views: 500,
      });

      const result = await service.exportVideoStatsCsv();

      expect(result).toContain('videoLabel,views,comments,likes,platform');
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
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const brandId = 'brand-filter-1';
      await service.getEngagementBreakdown(
        undefined,
        undefined,
        brandId,
        CredentialPlatform.YOUTUBE,
      );

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
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

    it('should call $queryRaw when filtering by brandId', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const brandId = 'brand-1';
      await service.getViralHooks(undefined, undefined, brandId);

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });

    it('should call $queryRaw when filtering by organizationId', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const orgId = 'org-1';
      await service.getViralHooks(undefined, undefined, undefined, orgId);

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });
  });
});
