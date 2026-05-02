import { BotsService } from '@api/collections/bots/services/bots.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { AnalyticsController } from '@api/endpoints/analytics/analytics.controller';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { BusinessAnalyticsService } from '@api/endpoints/analytics/business-analytics.service';
import {
  AdminBrandsQueryDto,
  AdminOrgsQueryDto,
  AnalyticsDateRangeDto,
  AnalyticsFilterQueryDto,
  GrowthQueryDto,
  LeaderboardQueryDto,
  TopContentQueryDto,
  ViralHooksQueryDto,
} from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CacheService } from '@api/services/cache/services/cache.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { IngredientCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

describe('AnalyticsController', () => {
  type MockRequest = ExpressRequest & {
    user: {
      id: string;
      publicMetadata: {
        isSuperAdmin: boolean;
        organization: string;
      };
    };
  };

  let controller: AnalyticsController;
  let analyticsService: vi.Mocked<AnalyticsService>;
  let businessAnalyticsService: vi.Mocked<BusinessAnalyticsService>;
  let brandsService: vi.Mocked<BrandsService>;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let postsService: vi.Mocked<PostsService>;
  let subscriptionsService: vi.Mocked<SubscriptionsService>;
  let usersService: vi.Mocked<UsersService>;
  let tiktokService: vi.Mocked<TiktokService>;
  let twitterService: vi.Mocked<TwitterService>;
  let youtubeService: vi.Mocked<YoutubeService>;
  let instagramService: vi.Mocked<InstagramService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockRequest = {
    originalUrl: '/api/analytics',
    query: {},
    user: {
      id: 'user_123',
      publicMetadata: { isSuperAdmin: true, organization: 'org_123' },
    },
  } as unknown as MockRequest;

  const mockResponse = {
    send: vi.fn(),
    setHeader: vi.fn(),
  } as unknown as ExpressResponse;

  beforeEach(async () => {
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    analyticsService = {
      exportData: vi.fn(),
      getBrandsLeaderboard: vi.fn(),
      getBrandsWithStats: vi.fn(),
      getEngagementBreakdown: vi.fn(),
      getGrowthTrends: vi.fn(),
      getOrganizationsLeaderboard: vi.fn(),
      getOrganizationsWithStats: vi.fn(),
      getOverview: vi.fn(),
      getPlatformComparison: vi.fn(),
      getTimeSeriesData: vi.fn(),
      getTopContent: vi.fn(),
      getViralHooks: vi.fn(),
    } as unknown as vi.Mocked<AnalyticsService>;
    businessAnalyticsService = {
      getBusinessAnalytics: vi.fn(),
    } as unknown as vi.Mocked<BusinessAnalyticsService>;

    brandsService = {
      findAll: vi.fn(),
    } as unknown as vi.Mocked<BrandsService>;
    postsService = {
      findAll: vi.fn(),
    } as unknown as vi.Mocked<PostsService>;
    subscriptionsService = {
      findAll: vi.fn(),
    } as unknown as vi.Mocked<SubscriptionsService>;
    usersService = {
      findAll: vi.fn(),
    } as unknown as vi.Mocked<UsersService>;
    ingredientsService = {
      findAll: vi.fn(),
    } as unknown as vi.Mocked<IngredientsService>;

    tiktokService = {
      getTrends: vi.fn(),
    } as unknown as vi.Mocked<TiktokService>;
    twitterService = {
      getTrends: vi.fn(),
    } as unknown as vi.Mocked<TwitterService>;
    youtubeService = {
      getTrends: vi.fn(),
    } as unknown as vi.Mocked<YoutubeService>;
    instagramService = {
      getTrends: vi.fn(),
    } as unknown as vi.Mocked<InstagramService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: LoggerService, useValue: loggerService },
        {
          provide: MembersService,
          useValue: { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() },
        },
        {
          provide: CacheService,
          useValue: {
            del: vi.fn(),
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn(),
          },
        },
        {
          provide: BotsService,
          useValue: {
            find: vi.fn().mockResolvedValue([]),
            findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
            findOne: vi.fn(),
          },
        },
        {
          provide: CreditTransactionsService,
          useValue: { getUsageMetrics: vi.fn().mockResolvedValue({}) },
        },
        {
          provide: ModelsService,
          useValue: {
            find: vi.fn().mockResolvedValue([]),
            findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
            findOne: vi.fn(),
          },
        },
        {
          provide: OrganizationsService,
          useValue: {
            find: vi.fn().mockResolvedValue([]),
            findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
            findOne: vi.fn(),
          },
        },
        {
          provide: WorkflowsService,
          useValue: {
            find: vi.fn().mockResolvedValue([]),
            findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
            findOne: vi.fn(),
          },
        },
        {
          provide: InstagramService,
          useValue: { getAccountAnalytics: vi.fn().mockResolvedValue({}) },
        },
        { provide: AnalyticsService, useValue: analyticsService },
        {
          provide: BusinessAnalyticsService,
          useValue: businessAnalyticsService,
        },
        { provide: BrandsService, useValue: brandsService },
        { provide: IngredientsService, useValue: ingredientsService },
        { provide: PostsService, useValue: postsService },
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: UsersService, useValue: usersService },
        { provide: TiktokService, useValue: tiktokService },
        { provide: TwitterService, useValue: twitterService },
        { provide: YoutubeService, useValue: youtubeService },
        { provide: InstagramService, useValue: instagramService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should aggregate totals across services', async () => {
      subscriptionsService.findAll.mockResolvedValueOnce({ total: 4 } as never);
      usersService.findAll.mockResolvedValueOnce({ total: 8 } as never);
      postsService.findAll.mockResolvedValueOnce({ total: 12 } as never);
      brandsService.findAll.mockResolvedValueOnce({ total: 3 } as never);
      ingredientsService.findAll
        .mockResolvedValueOnce({ total: 5 } as never)
        .mockResolvedValueOnce({ total: 9 } as never);

      const query = {} as unknown as BaseQueryDto;
      const result = await controller.findAll(mockRequest, query);

      expect(subscriptionsService.findAll).toHaveBeenCalled();
      expect(usersService.findAll).toHaveBeenCalled();
      expect(postsService.findAll).toHaveBeenCalled();
      expect(brandsService.findAll).toHaveBeenCalled();
      expect(ingredientsService.findAll).toHaveBeenCalledTimes(2);
      expect(ingredientsService.findAll.mock.calls[0][0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            match: { category: IngredientCategory.VIDEO },
          }),
        ]),
      );
      expect(ingredientsService.findAll.mock.calls[1][0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            match: { category: IngredientCategory.IMAGE },
          }),
        ]),
      );
      expect(result).toBeDefined();
    });
  });

  describe('exportData', () => {
    it('should export CSV data', async () => {
      analyticsService.exportData.mockResolvedValueOnce('csv-data');

      const mockUser = {
        publicMetadata: { isSuperAdmin: true, organization: 'org-1' },
      } as never;
      await controller.exportData(
        mockUser,
        'csv',
        'videoLabel,views',
        undefined as never,
        mockResponse,
      );

      expect(analyticsService.exportData).toHaveBeenCalledWith(
        'csv',
        ['videoLabel', 'views'],
        undefined,
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv',
      );
      expect(mockResponse.send).toHaveBeenCalledWith('csv-data');
    });

    it('should export XLSX data', async () => {
      analyticsService.exportData.mockResolvedValueOnce('xlsx-data');

      const mockUser = {
        publicMetadata: { isSuperAdmin: true, organization: 'org-1' },
      } as never;
      await controller.exportData(
        mockUser,
        'xlsx',
        '',
        undefined as never,
        mockResponse,
      );

      expect(analyticsService.exportData).toHaveBeenCalledWith(
        'xlsx',
        ['videoLabel', 'views', 'comments', 'likes', 'platform'],
        undefined,
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(mockResponse.send).toHaveBeenCalledWith('xlsx-data');
    });
  });

  describe('getTrends', () => {
    it('should return trends when providers succeed', async () => {
      tiktokService.getTrends.mockResolvedValueOnce([{}] as never);
      twitterService.getTrends.mockResolvedValueOnce([{}] as never);
      youtubeService.getTrends.mockResolvedValueOnce([{}] as never);
      instagramService.getTrends.mockResolvedValueOnce([{}] as never);

      const result = await controller.getTrends(mockRequest);

      expect(tiktokService.getTrends).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle provider errors gracefully', async () => {
      tiktokService.getTrends.mockRejectedValueOnce(new Error('fail'));
      twitterService.getTrends.mockResolvedValueOnce([{}] as never);
      youtubeService.getTrends.mockResolvedValueOnce([{}] as never);
      instagramService.getTrends.mockResolvedValueOnce([{}] as never);

      const result = await controller.getTrends(mockRequest);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('tiktok failed'),
        expect.any(Error),
      );
      expect(result).toBeDefined();
    });
  });

  describe('leaderboards', () => {
    it('should return organization leaderboard', async () => {
      analyticsService.getOrganizationsLeaderboard.mockResolvedValueOnce([]);

      const query = {
        endDate: '2025-01-31',
        limit: 10,
        sort: 'engagement',
        startDate: '2025-01-01',
      } as unknown as LeaderboardQueryDto;

      const result = await controller.getOrganizationsLeaderboard(
        mockRequest,
        query,
      );

      expect(analyticsService.getOrganizationsLeaderboard).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        'engagement',
        10,
      );
      expect(result).toBeDefined();
    });

    it('should return organization stats', async () => {
      analyticsService.getOrganizationsWithStats.mockResolvedValueOnce({
        data: [],
        pagination: { limit: 20, page: 1, total: 0, totalPages: 0 },
      } as never);

      const query = {
        endDate: '2025-01-31',
        limit: 20,
        page: 1,
        sort: 'engagement',
        startDate: '2025-01-01',
      } as unknown as AdminOrgsQueryDto;

      const result = await controller.getOrganizationsWithStats(
        mockRequest,
        query,
      );

      expect(analyticsService.getOrganizationsWithStats).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        1,
        20,
        'engagement',
      );
      expect(result).toBeDefined();
    });

    it('should return brand leaderboard', async () => {
      analyticsService.getBrandsLeaderboard.mockResolvedValueOnce([]);

      const query = {
        endDate: '2025-01-31',
        limit: 5,
        sort: 'engagement',
        startDate: '2025-01-01',
      } as unknown as LeaderboardQueryDto;

      const result = await controller.getBrandsLeaderboard(
        mockRequest.user as never,
        mockRequest,
        query,
      );

      expect(analyticsService.getBrandsLeaderboard).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        'engagement',
        5,
        undefined,
      );
      expect(result).toBeDefined();
    });

    it('should return brand stats', async () => {
      analyticsService.getBrandsWithStats.mockResolvedValueOnce({
        data: [],
        pagination: { limit: 15, page: 2, total: 0, totalPages: 0 },
      } as never);

      const query = {
        endDate: '2025-01-31',
        limit: 15,
        page: 2,
        sort: 'engagement',
        startDate: '2025-01-01',
      } as unknown as AdminBrandsQueryDto;

      const result = await controller.getBrandsWithStats(
        mockRequest.user as never,
        mockRequest,
        query,
      );

      expect(analyticsService.getBrandsWithStats).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        2,
        15,
        'engagement',
        undefined,
      );
      expect(result).toBeDefined();
    });
  });

  describe('time series and filters', () => {
    it('should default time series dates when missing', async () => {
      analyticsService.getTimeSeriesData.mockResolvedValueOnce([]);

      const result = await controller.getTimeSeries(
        mockRequest.user as never,
        mockRequest,
      );

      const [startDate, endDate] =
        analyticsService.getTimeSeriesData.mock.calls[0];

      expect(startDate).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(endDate).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(result).toBeDefined();
    });

    it('should return overview data', async () => {
      analyticsService.getOverview.mockResolvedValueOnce({ total: 1 });

      const query = {
        brand: 'brand_1',
        endDate: '2025-01-31',
        startDate: '2025-01-01',
      } as unknown as AnalyticsDateRangeDto;

      const result = await controller.getOverview(
        mockRequest.user as never,
        mockRequest,
        query,
      );

      expect(analyticsService.getOverview).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        'brand_1',
        undefined,
      );
      expect(result).toBeDefined();
    });

    it('should return top content', async () => {
      analyticsService.getTopContent.mockResolvedValueOnce([]);

      const query = {
        brand: 'brand_1',
        endDate: '2025-01-31',
        limit: 5,
        metric: 'views',
        platform: 'twitter',
        startDate: '2025-01-01',
      } as unknown as TopContentQueryDto;

      const result = await controller.getTopContent(
        mockRequest.user as never,
        mockRequest,
        query,
      );

      expect(analyticsService.getTopContent).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        5,
        'views',
        'brand_1',
        'twitter',
        undefined,
      );
      expect(result).toBeDefined();
    });

    it('should return platform comparison', async () => {
      analyticsService.getPlatformComparison.mockResolvedValueOnce({
        platforms: [],
      });

      const query = {
        brand: 'brand_1',
        endDate: '2025-01-31',
        startDate: '2025-01-01',
      } as unknown as AnalyticsDateRangeDto;

      const result = await controller.getPlatformComparison(mockRequest, query);

      expect(analyticsService.getPlatformComparison).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        'brand_1',
      );
      expect(result).toBeDefined();
    });

    it('should return growth trends', async () => {
      analyticsService.getGrowthTrends.mockResolvedValueOnce({ total: 3 });

      const query = {
        brand: 'brand_1',
        endDate: '2025-01-31',
        metric: 'views',
        startDate: '2025-01-01',
      } as unknown as GrowthQueryDto;

      const result = await controller.getGrowthTrends(mockRequest, query);

      expect(analyticsService.getGrowthTrends).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        'views',
        'brand_1',
      );
      expect(result).toBeDefined();
    });

    it('should return engagement breakdown', async () => {
      analyticsService.getEngagementBreakdown.mockResolvedValueOnce({
        rows: [],
      });

      const query = {
        brand: 'brand_1',
        endDate: '2025-01-31',
        platform: 'twitter',
        startDate: '2025-01-01',
      } as unknown as AnalyticsFilterQueryDto;

      const result = await controller.getEngagement(mockRequest, query);

      expect(analyticsService.getEngagementBreakdown).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        'brand_1',
        'twitter',
      );
      expect(result).toBeDefined();
    });

    it('should return viral hooks', async () => {
      analyticsService.getViralHooks.mockResolvedValueOnce({
        analysis: {
          hookEffectiveness: [],
          topHooks: [],
          topPlatforms: [],
          totalVideos: 0,
        },
        videos: [],
      } as never);

      const query = {
        brand: 'brand_1',
        endDate: '2025-01-31',
        organization: 'org_1',
        startDate: '2025-01-01',
      } as unknown as ViralHooksQueryDto;

      const result = await controller.getViralHooks(mockRequest, query);

      expect(analyticsService.getViralHooks).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        'brand_1',
        'org_1',
      );
      expect(result).toBeDefined();
    });
  });
});
