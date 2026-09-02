import { AnalyticsController } from '@api/endpoints/analytics/analytics.controller';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { AnalyticsExportService } from '@api/endpoints/analytics/analytics-export.service';
import { BusinessAnalyticsService } from '@api/endpoints/analytics/business-analytics.service';
import {
  AnalyticsDateRangeDto,
  AnalyticsFilterQueryDto,
  GrowthQueryDto,
  TopContentQueryDto,
  ViralHooksQueryDto,
} from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CacheService } from '@api/services/cache/cache.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
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
      isSuperAdmin: boolean;
      organizationId: string;
    };
  };

  let controller: AnalyticsController;
  let analyticsService: vi.Mocked<AnalyticsService>;
  let analyticsExportService: vi.Mocked<AnalyticsExportService>;
  let businessAnalyticsService: vi.Mocked<BusinessAnalyticsService>;
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
      isSuperAdmin: true,
      organizationId: 'org_123',
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
      getEngagementBreakdown: vi.fn(),
      getGrowthTrends: vi.fn(),
      getOverview: vi.fn(),
      getPlatformComparison: vi.fn(),
      getTimeSeriesData: vi.fn(),
      getTopContent: vi.fn(),
      getViralHooks: vi.fn(),
    } as unknown as vi.Mocked<AnalyticsService>;
    analyticsExportService = {
      exportData: vi.fn(),
    } as unknown as vi.Mocked<AnalyticsExportService>;
    businessAnalyticsService = {
      getBusinessAnalytics: vi.fn(),
    } as unknown as vi.Mocked<BusinessAnalyticsService>;

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
        {
          provide: CacheService,
          useValue: { get: vi.fn(), set: vi.fn() },
        },
        { provide: LoggerService, useValue: loggerService },
        { provide: AnalyticsService, useValue: analyticsService },
        {
          provide: AnalyticsExportService,
          useValue: analyticsExportService,
        },
        {
          provide: BusinessAnalyticsService,
          useValue: businessAnalyticsService,
        },
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

  describe('exportData', () => {
    it('should export CSV data', async () => {
      analyticsExportService.exportData.mockResolvedValueOnce('csv-data');

      const mockUser = {
        isSuperAdmin: true,
        organizationId: 'org-1',
      } as never;
      await controller.exportData(
        mockUser,
        { fields: 'videoLabel,views', format: 'csv' },
        mockResponse,
      );

      expect(analyticsExportService.exportData).toHaveBeenCalledWith(
        'csv',
        ['videoLabel', 'views'],
        {
          brandId: undefined,
          endDate: undefined,
          organizationId: undefined,
          platform: undefined,
          postId: undefined,
          startDate: undefined,
        },
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv',
      );
      expect(mockResponse.send).toHaveBeenCalledWith('csv-data');
    });

    it('should export XLSX data', async () => {
      analyticsExportService.exportData.mockResolvedValueOnce(
        Buffer.from('xlsx-data'),
      );

      const mockUser = {
        isSuperAdmin: true,
        organizationId: 'org-1',
      } as never;
      await controller.exportData(
        mockUser,
        { fields: '', format: 'xlsx' },
        mockResponse,
      );

      expect(analyticsExportService.exportData).toHaveBeenCalledWith(
        'xlsx',
        ['videoLabel', 'views', 'comments', 'likes', 'platform'],
        {
          brandId: undefined,
          endDate: undefined,
          organizationId: undefined,
          platform: undefined,
          postId: undefined,
          startDate: undefined,
        },
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(mockResponse.send).toHaveBeenCalledWith(Buffer.from('xlsx-data'));
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
        brandId: 'brand_1',
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
        brandId: 'brand_1',
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
        brandId: 'brand_1',
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
        brandId: 'brand_1',
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
        brandId: 'brand_1',
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

    it('should return viral hooks for a superadmin without scoping by the requested org', async () => {
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
        brandId: 'brand_1',
        endDate: '2025-01-31',
        organizationId: 'org_1',
        startDate: '2025-01-01',
      } as unknown as ViralHooksQueryDto;

      const result = await controller.getViralHooks(
        mockRequest.user as never,
        mockRequest,
        query,
      );

      expect(analyticsService.getViralHooks).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        'brand_1',
        undefined,
      );
      expect(result).toBeDefined();
    });

    it('ignores a foreign organizationId in the query for non-superadmin users', async () => {
      analyticsService.getViralHooks.mockResolvedValueOnce({
        analysis: {
          hookEffectiveness: [],
          topHooks: [],
          topPlatforms: [],
          totalVideos: 0,
        },
        videos: [],
      } as never);

      const nonSuperAdmin = {
        id: 'user_456',
        isSuperAdmin: false,
        organizationId: 'org-own',
      } as never;
      const query = {
        brandId: 'brand_1',
        endDate: '2025-01-31',
        organizationId: 'org-foreign',
        startDate: '2025-01-01',
      } as unknown as ViralHooksQueryDto;

      await controller.getViralHooks(nonSuperAdmin, mockRequest, query);

      expect(analyticsService.getViralHooks).toHaveBeenCalledWith(
        '2025-01-01',
        '2025-01-31',
        'brand_1',
        'org-own',
      );
    });
  });
});
