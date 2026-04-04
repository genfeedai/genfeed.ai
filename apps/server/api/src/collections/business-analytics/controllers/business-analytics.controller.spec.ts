import { BusinessAnalyticsController } from '@api/collections/business-analytics/controllers/business-analytics.controller';
import type { BusinessAnalyticsData } from '@api/collections/business-analytics/services/business-analytics.service';
import { BusinessAnalyticsService } from '@api/collections/business-analytics/services/business-analytics.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request as ExpressRequest } from 'express';

describe('BusinessAnalyticsController', () => {
  let controller: BusinessAnalyticsController;
  let businessAnalyticsService: vi.Mocked<BusinessAnalyticsService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockRequest = {
    originalUrl: '/v1/analytics/business',
    query: {},
  } as unknown as ExpressRequest;

  const mockBusinessData: BusinessAnalyticsData = {
    credits: {
      bySource: [
        { amount: 100000, count: 500, source: 'image_generation' },
        { amount: 50000, count: 100, source: 'video_generation' },
      ],
      dailySeries: [{ count: 42, creditsConsumed: 6500, date: '2026-03-29' }],
      topOrganizations: [
        {
          creditsConsumed: 50000,
          organizationId: 'org_1',
          transactionCount: 200,
        },
      ],
      totalConsumed7d: 45000,
      totalConsumed30d: 180000,
      wowGrowth: 8.3,
    },
    ingredients: {
      byCategory: [
        { category: 'image', count: 800 },
        { category: 'video', count: 250 },
      ],
      dailySeries: [{ count: 55, date: '2026-03-29' }],
      topOrganizations: [{ ingredientCount: 400, organizationId: 'org_1' }],
      total7d: 350,
      total30d: 1200,
      wowGrowth: 15.2,
    },
    revenue: {
      creditsSoldTotal: 250000,
      dailySeries: [{ count: 3, date: '2026-03-29', revenue: 150.5 }],
      revenue7d: 1200.75,
      revenue30d: 4500.25,
      revenueMtd: 3200.0,
      revenueToday: 150.5,
      wowGrowth: 12.5,
    },
  };

  beforeEach(async () => {
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    businessAnalyticsService = {
      getBusinessAnalytics: vi.fn().mockResolvedValue(mockBusinessData),
    } as unknown as vi.Mocked<BusinessAnalyticsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BusinessAnalyticsController],
      providers: [
        { provide: LoggerService, useValue: loggerService },
        {
          provide: BusinessAnalyticsService,
          useValue: businessAnalyticsService,
        },
        {
          provide: CacheService,
          useValue: {
            del: vi.fn(),
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BusinessAnalyticsController>(
      BusinessAnalyticsController,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getBusinessAnalytics', () => {
    it('should call service and return serialized data', async () => {
      const result = await controller.getBusinessAnalytics(mockRequest, {});

      expect(
        businessAnalyticsService.getBusinessAnalytics,
      ).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('should pass through when service returns empty data', async () => {
      const emptyData: BusinessAnalyticsData = {
        credits: {
          bySource: [],
          dailySeries: [],
          topOrganizations: [],
          totalConsumed7d: 0,
          totalConsumed30d: 0,
          wowGrowth: 0,
        },
        ingredients: {
          byCategory: [],
          dailySeries: [],
          topOrganizations: [],
          total7d: 0,
          total30d: 0,
          wowGrowth: 0,
        },
        revenue: {
          creditsSoldTotal: 0,
          dailySeries: [],
          revenue7d: 0,
          revenue30d: 0,
          revenueMtd: 0,
          revenueToday: 0,
          wowGrowth: 0,
        },
      };
      businessAnalyticsService.getBusinessAnalytics.mockResolvedValueOnce(
        emptyData,
      );

      const result = await controller.getBusinessAnalytics(mockRequest, {});

      expect(
        businessAnalyticsService.getBusinessAnalytics,
      ).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('should log the request', async () => {
      await controller.getBusinessAnalytics(mockRequest, {});

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('BusinessAnalyticsController'),
      );
    });
  });
});
