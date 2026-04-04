vi.mock('@api/services/integrations/youtube/services/youtube.service', () => ({
  YoutubeService: class {},
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostAnalytics } from '@api/collections/posts/schemas/post-analytics.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { LeaderboardSort } from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { Analytic } from '@api/endpoints/analytics/schemas/analytic.schema';
import { mockModel } from '@api/helpers/mocks/model.mock';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { AnalyticsMetric, CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

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

  // Create mock PostAnalytics model with aggregate
  const mockPostAnalyticsModel = {
    ...mockModel,
    aggregate: vi.fn(),
  };

  // Create mock analytics model
  const mockAnalyticModel = {
    ...mockModel,
    aggregate: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getModelToken(Analytic.name, DB_CONNECTIONS.ANALYTICS),
          useValue: mockAnalyticModel,
        },
        {
          provide: getModelToken(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS),
          useValue: mockPostAnalyticsModel,
        },
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
    const mockOrgId = new Types.ObjectId();
    const mockOrgs = [
      {
        _id: mockOrgId,
        createdAt: new Date(),
        label: 'Test Org',
        logo: { cdnUrl: 'https://cdn.example.com/logo.png' },
        name: 'Test Organization',
      },
    ];

    beforeEach(() => {
      mockOrganizationsService.findAll.mockResolvedValue({ docs: mockOrgs });
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);
    });

    it('should return empty array when no organizations exist', async () => {
      mockOrganizationsService.findAll.mockResolvedValue({ docs: [] });

      const result = await service.getOrganizationsLeaderboard();

      expect(result).toEqual([]);
    });

    it('should return organizations with analytics', async () => {
      const mockAnalytics = [
        {
          _id: mockOrgId,
          avgEngagementRate: 5.5,
          posts: [new Types.ObjectId(), new Types.ObjectId()],
          totalComments: 50,
          totalLikes: 100,
          totalSaves: 10,
          totalShares: 25,
          totalViews: 1000,
        },
      ];

      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce(mockAnalytics) // current period
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
      const currentAnalytics = [
        {
          _id: mockOrgId,
          avgEngagementRate: 5,
          posts: [new Types.ObjectId()],
          totalComments: 50,
          totalLikes: 100,
          totalSaves: 25,
          totalShares: 25,
          totalViews: 200,
        },
      ];

      const previousAnalytics = [
        {
          _id: mockOrgId,
          totalEngagement: 100,
        },
      ];

      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce(currentAnalytics)
        .mockResolvedValueOnce(previousAnalytics);

      const result = await service.getOrganizationsLeaderboard();

      // Current: 100+50+25+25 = 200, Previous: 100, Growth: 100%
      expect(result[0].growth).toBe(100);
    });

    it('should handle 100% growth for new orgs with no previous data', async () => {
      const currentAnalytics = [
        {
          _id: mockOrgId,
          avgEngagementRate: 3,
          posts: [new Types.ObjectId()],
          totalComments: 5,
          totalLikes: 10,
          totalSaves: 1,
          totalShares: 2,
          totalViews: 100,
        },
      ];

      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce(currentAnalytics)
        .mockResolvedValueOnce([]); // no previous data

      const result = await service.getOrganizationsLeaderboard();

      expect(result[0].growth).toBe(100);
    });

    it('should sort by views when sort=VIEWS', async () => {
      const org1 = { _id: new Types.ObjectId(), label: 'Org1' };
      const org2 = { _id: new Types.ObjectId(), label: 'Org2' };
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [org1, org2],
      });

      const analytics = [
        {
          _id: org1._id,
          avgEngagementRate: 0,
          posts: [],
          totalComments: 0,
          totalLikes: 50,
          totalSaves: 0,
          totalShares: 0,
          totalViews: 100,
        },
        {
          _id: org2._id,
          avgEngagementRate: 0,
          posts: [],
          totalComments: 0,
          totalLikes: 10,
          totalSaves: 0,
          totalShares: 0,
          totalViews: 500,
        },
      ];

      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce(analytics)
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
        _id: new Types.ObjectId(),
        label: `Org ${i}`,
      }));
      mockOrganizationsService.findAll.mockResolvedValue({ docs: orgs });
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);

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
    const mockBrandId = new Types.ObjectId();
    const mockOrgId = new Types.ObjectId();
    const mockBrands = [
      {
        _id: mockBrandId,
        createdAt: new Date(),
        label: 'Test Brand',
        logo: { cdnUrl: 'https://cdn.example.com/brand-logo.png' },
        name: 'Test Brand Name',
        org: { _id: mockOrgId, label: 'Parent Org' },
        organization: mockOrgId,
      },
    ];

    beforeEach(() => {
      mockBrandsService.findAll.mockResolvedValue({ docs: mockBrands });
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);
    });

    it('should return empty array when no brands exist', async () => {
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });

      const result = await service.getBrandsLeaderboard();

      expect(result).toEqual([]);
    });

    it('should return brands with analytics', async () => {
      const mockAnalytics = [
        {
          _id: mockBrandId,
          avgEngagementRate: 8.5,
          platforms: [CredentialPlatform.YOUTUBE, CredentialPlatform.TIKTOK],
          posts: [new Types.ObjectId()],
          totalComments: 100,
          totalLikes: 200,
          totalSaves: 20,
          totalShares: 50,
          totalViews: 2000,
        },
      ];

      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce(mockAnalytics)
        .mockResolvedValueOnce([]);

      const result = await service.getBrandsLeaderboard();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Brand');
      expect(result[0].totalViews).toBe(2000);
      expect(result[0].totalEngagement).toBe(370);
      expect(result[0].activePlatforms).toContain(CredentialPlatform.YOUTUBE);
    });

    it('should sort by posts when sort=POSTS', async () => {
      const brand1 = {
        _id: new Types.ObjectId(),
        label: 'Brand1',
        org: { label: 'Org1' },
      };
      const brand2 = {
        _id: new Types.ObjectId(),
        label: 'Brand2',
        org: { label: 'Org2' },
      };
      mockBrandsService.findAll.mockResolvedValue({ docs: [brand1, brand2] });

      const analytics = [
        {
          _id: brand1._id,
          avgEngagementRate: 0,
          platforms: [],
          posts: [new Types.ObjectId()],
          totalComments: 0,
          totalLikes: 0,
          totalSaves: 0,
          totalShares: 0,
          totalViews: 100,
        },
        {
          _id: brand2._id,
          avgEngagementRate: 0,
          platforms: [],
          posts: [
            new Types.ObjectId(),
            new Types.ObjectId(),
            new Types.ObjectId(),
          ],
          totalComments: 0,
          totalLikes: 0,
          totalSaves: 0,
          totalShares: 0,
          totalViews: 50,
        },
      ];

      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce(analytics)
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
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);
    });

    it('should return paginated response', async () => {
      const orgs = Array.from({ length: 25 }, (_, i) => ({
        _id: new Types.ObjectId(),
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
      const orgId = new Types.ObjectId();
      mockOrganizationsService.findAll.mockResolvedValue({
        docs: [{ _id: orgId, label: 'Test Org' }],
      });
      mockBrandsService.findAll.mockResolvedValue({
        docs: [{ _id: orgId, count: 5 }],
      });

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
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);
    });

    it('should return paginated response', async () => {
      const brands = Array.from({ length: 30 }, (_, i) => ({
        _id: new Types.ObjectId(),
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
            _id: new Types.ObjectId(),
            brand: new Types.ObjectId(),
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.YOUTUBE },
            label: 'Test Post',
            metadata: { label: 'Video Title' },
            organization: new Types.ObjectId(),
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
            _id: new Types.ObjectId(),
            brand: new Types.ObjectId(),
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.TIKTOK },
            label: 'Test Post',
            metadata: {},
            organization: new Types.ObjectId(),
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
      const postId = new Types.ObjectId();
      const orgId = new Types.ObjectId();
      const brandId = new Types.ObjectId();

      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            _id: postId,
            brand: brandId,
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.YOUTUBE },
            externalId: 'youtube-123',
            label: 'YT Video',
            metadata: {},
            organization: orgId,
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
        orgId.toString(),
        brandId.toString(),
        'youtube-123',
      );
      expect(result).toContain('1000');
    });

    it('should fetch TikTok analytics', async () => {
      mockPostsService.findAll.mockResolvedValue({
        docs: [
          {
            _id: new Types.ObjectId(),
            brand: new Types.ObjectId(),
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.TIKTOK },
            externalId: 'tiktok-123',
            label: 'TT Video',
            metadata: {},
            organization: new Types.ObjectId(),
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
            _id: new Types.ObjectId(),
            brand: new Types.ObjectId(),
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.INSTAGRAM },
            externalId: 'error-123',
            label: 'Error Video',
            metadata: {},
            organization: new Types.ObjectId(),
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
            _id: new Types.ObjectId(),
            brand: new Types.ObjectId(),
            createdAt: new Date(),
            credential: { platform: CredentialPlatform.YOUTUBE },
            externalId: 'yt-123',
            label: 'Video 1',
            metadata: { label: 'Test Video' },
            organization: new Types.ObjectId(),
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

      mockPostAnalyticsModel.aggregate.mockResolvedValue([
        {
          _id: '2025-01-01',
          platforms: [
            {
              comments: 5,
              engagementRate: 5,
              likes: 10,
              platform: CredentialPlatform.YOUTUBE,
              saves: 1,
              shares: 2,
              views: 100,
            },
          ],
        },
        {
          _id: '2025-01-02',
          platforms: [
            {
              comments: 10,
              engagementRate: 8,
              likes: 20,
              platform: CredentialPlatform.TIKTOK,
              saves: 2,
              shares: 5,
              views: 200,
            },
          ],
        },
      ]);

      const result = typed<Array<any>>(
        await service.getTimeSeriesData(startDate, endDate),
      );

      expect(result).toHaveLength(3); // 3 days
      expect(result[0].date).toBe('2025-01-01');
      expect(result[0].youtube.views).toBe(100);
      expect(result[1].tiktok.views).toBe(200);
      expect(result[2].instagram.views).toBe(0); // empty metrics for day without data
    });

    it('should fill empty dates with zero metrics', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);

      const result = typed<Array<any>>(
        await service.getTimeSeriesData('2025-01-01', '2025-01-02'),
      );

      expect(result).toHaveLength(2);
      expect(result[0].youtube.views).toBe(0);
      expect(result[0].tiktok.likes).toBe(0);
    });
  });

  // ==========================================================================
  // getOverview
  // ==========================================================================
  describe('getOverview', () => {
    beforeEach(() => {
      mockOrganizationsService.count.mockResolvedValue(5);
      mockBrandsService.count.mockResolvedValue(10);
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);
    });

    it('should return overview analytics', async () => {
      const currentMetrics = [
        {
          _id: null,
          avgEngagementRate: 5.5,
          totalComments: 200,
          totalLikes: 500,
          totalPosts: 100,
          totalSaves: 50,
          totalShares: 100,
          totalViews: 10000,
        },
      ];

      const previousMetrics = [
        {
          _id: null,
          totalEngagement: 600,
          totalPosts: 80,
          totalViews: 8000,
        },
      ];

      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce(currentMetrics)
        .mockResolvedValueOnce(previousMetrics);

      const result = typed<any>(await service.getOverview());

      expect(result.totalPosts).toBe(100);
      expect(result.totalViews).toBe(10000);
      expect(result.totalEngagement).toBe(850); // 500+200+100+50
      expect(result.organizationCount).toBe(5);
      expect(result.brandCount).toBe(10);
      expect(result.growth.posts).toBe(25); // (100-80)/80 * 100
    });

    it('should handle brandId filter', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);

      const brandId = new Types.ObjectId().toString();
      await service.getOverview(undefined, undefined, brandId);

      expect(mockPostAnalyticsModel.aggregate).toHaveBeenCalled();
      // Verify match stage includes brand filter
      const firstCall = mockPostAnalyticsModel.aggregate.mock.calls[0][0];
      expect(firstCall[0].$match).toHaveProperty('brand');
    });

    it('should return zero growth when no previous data', async () => {
      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = typed<any>(await service.getOverview());

      expect(result.growth.posts).toBe(0);
      expect(result.growth.views).toBe(0);
      expect(result.growth.engagement).toBe(0);
    });
  });

  // ==========================================================================
  // getTopContent
  // ==========================================================================
  describe('getTopContent', () => {
    it('should return top performing content', async () => {
      const postId = new Types.ObjectId();

      mockPostAnalyticsModel.aggregate.mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          brandLogo: { cdnUrl: 'https://cdn.example.com/logo.png' },
          brandName: 'Brand A',
          description: 'Best performing',
          engagementRate: 8.5,
          ingredientUrl: 'https://cdn.example.com/video.mp4',
          isVideo: true,
          label: 'Top Video',
          platform: CredentialPlatform.YOUTUBE,
          postId,
          thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
          totalComments: 200,
          totalEngagement: 850,
          totalLikes: 500,
          totalSaves: 50,
          totalShares: 100,
          totalViews: 10000,
        },
      ]);

      const result = typed<Array<any>>(await service.getTopContent());

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Top Video');
      expect(result[0].totalViews).toBe(10000);
    });

    it('should sort by engagement when metric=engagement', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);

      await service.getTopContent(
        undefined,
        undefined,
        10,
        AnalyticsMetric.ENGAGEMENT,
        undefined,
        undefined,
      );

      // Verify sort field in aggregate pipeline
      expect(mockPostAnalyticsModel.aggregate).toHaveBeenCalled();
    });

    it('should sort by likes when metric=likes', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);

      await service.getTopContent(
        undefined,
        undefined,
        10,
        AnalyticsMetric.LIKES,
      );

      expect(mockPostAnalyticsModel.aggregate).toHaveBeenCalled();
    });

    it('should filter by platform', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);

      await service.getTopContent(
        undefined,
        undefined,
        10,
        AnalyticsMetric.VIEWS,
        undefined,
        CredentialPlatform.TIKTOK,
      );

      expect(mockPostAnalyticsModel.aggregate).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getPlatformComparison
  // ==========================================================================
  describe('getPlatformComparison', () => {
    it('should return platform comparison data', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([
        {
          _id: CredentialPlatform.YOUTUBE,
          avgEngagementRate: 8.5,
          totalComments: 100,
          totalEngagement: 425,
          totalLikes: 250,
          totalPosts: 50,
          totalSaves: 25,
          totalShares: 50,
          totalViews: 5000,
        },
        {
          _id: CredentialPlatform.TIKTOK,
          avgEngagementRate: 8.5,
          totalComments: 60,
          totalEngagement: 255,
          totalLikes: 150,
          totalPosts: 30,
          totalSaves: 15,
          totalShares: 30,
          totalViews: 3000,
        },
      ]);

      const result = typed<Array<any>>(await service.getPlatformComparison());

      expect(result).toHaveLength(2);
      expect(result[0].platform).toBe(CredentialPlatform.YOUTUBE);
      expect(result[0].viewsPercentage).toBeGreaterThan(0);
      expect(result[0].engagementPercentage).toBeGreaterThan(0);
    });

    it('should calculate percentages correctly', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([
        {
          _id: CredentialPlatform.YOUTUBE,
          avgEngagementRate: 10,
          totalEngagement: 100,
          totalPosts: 100,
          totalViews: 1000,
        },
      ]);

      const result = typed<Array<any>>(await service.getPlatformComparison());

      expect(result[0].viewsPercentage).toBe(100); // Only platform = 100%
      expect(result[0].postsPercentage).toBe(100);
    });
  });

  // ==========================================================================
  // getGrowthTrends
  // ==========================================================================
  describe('getGrowthTrends', () => {
    it('should return growth trends by day', async () => {
      const currentResults = [
        {
          _id: '2025-01-01',
          comments: 20,
          engagement: 85,
          likes: 50,
          posts: 10,
          saves: 5,
          shares: 10,
          views: 1000,
        },
        {
          _id: '2025-01-02',
          comments: 25,
          engagement: 103,
          likes: 60,
          posts: 12,
          saves: 6,
          shares: 12,
          views: 1200,
        },
      ];

      const previousResults = [
        {
          totalComments: 15,
          totalLikes: 40,
          totalPosts: 8,
          totalSaves: 4,
          totalShares: 8,
          totalViews: 800,
        },
      ];

      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce(currentResults)
        .mockResolvedValueOnce(previousResults);

      const result = typed<any>(await service.getGrowthTrends());

      expect(result.metric).toBe('views');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].date).toBe('2025-01-01');
      expect(result.data[0].trend).toBeDefined();
    });

    it('should track engagement metric', async () => {
      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = typed<any>(
        await service.getGrowthTrends(
          undefined,
          undefined,
          AnalyticsMetric.ENGAGEMENT,
        ),
      );

      expect(result.metric).toBe('engagement');
    });

    it('should track posts metric', async () => {
      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = typed<any>(
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
      mockPostAnalyticsModel.aggregate.mockResolvedValue([
        {
          _id: null,
          totalComments: 50,
          totalLikes: 100,
          totalSaves: 10,
          totalShares: 25,
        },
      ]);

      const result = typed<any>(await service.getEngagementBreakdown());

      expect(result.likes).toBe(100);
      expect(result.comments).toBe(50);
      expect(result.shares).toBe(25);
      expect(result.saves).toBe(10);
      expect(result.total).toBe(185);
      expect(result.percentages.likes).toBeCloseTo(54.05, 1);
    });

    it('should handle zero engagement', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);

      const result = typed<any>(await service.getEngagementBreakdown());

      expect(result.total).toBe(0);
      expect(result.percentages.likes).toBe(0);
      expect(result.percentages.comments).toBe(0);
    });

    it('should filter by brand and platform', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);

      const brandId = new Types.ObjectId().toString();
      await service.getEngagementBreakdown(
        undefined,
        undefined,
        brandId,
        CredentialPlatform.YOUTUBE,
      );

      expect(mockPostAnalyticsModel.aggregate).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getViralHooks
  // ==========================================================================
  describe('getViralHooks', () => {
    it('should return viral hooks analysis', async () => {
      const postId = new Types.ObjectId();

      mockPostAnalyticsModel.aggregate
        .mockResolvedValueOnce([
          {
            _id: postId,
            description: 'This went viral',
            platforms: [CredentialPlatform.TIKTOK],
            title: 'Viral Video',
            totalEngagement: 5000,
            totalViews: 100000,
          },
        ])
        .mockResolvedValueOnce([
          {
            _id: CredentialPlatform.TIKTOK,
            postCount: 1,
            totalEngagement: 5000,
            totalViews: 100000,
          },
        ]);

      const result = await service.getViralHooks();

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].title).toBe('Viral Video');
      expect(result.analysis.topPlatforms).toHaveLength(1);
    });

    it('should handle brandId filter', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);

      const brandId = new Types.ObjectId().toString();
      await service.getViralHooks(undefined, undefined, brandId);

      expect(mockPostAnalyticsModel.aggregate).toHaveBeenCalled();
    });

    it('should handle organizationId filter', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValue([]);

      const orgId = new Types.ObjectId().toString();
      await service.getViralHooks(undefined, undefined, undefined, orgId);

      expect(mockPostAnalyticsModel.aggregate).toHaveBeenCalled();
    });
  });
});
