vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { InsightsController } from '@api/collections/insights/controllers/insights.controller';
import { GetForecastDto } from '@api/collections/insights/dto/forecast.dto';
import { PredictViralDto } from '@api/collections/insights/dto/predict-viral.dto';
import { InsightsService } from '@api/collections/insights/services/insights.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('InsightsController', () => {
  let controller: InsightsController;
  let service: InsightsService;

  const mockUser: User = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockInsightsService = {
    getBestTimes: vi.fn(),
    getContentGaps: vi.fn(),
    getForecast: vi.fn(),
    getGrowthPrediction: vi.fn(),
    getInsights: vi.fn(),
    needsInsightGeneration: vi.fn().mockResolvedValue(false),
    predictViral: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InsightsController],
      providers: [
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: InsightsService,
          useValue: mockInsightsService,
        },
      ],
    })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InsightsController>(InsightsController);
    service = module.get<InsightsService>(InsightsService);
  });

  const mockReq = {} as Request;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getForecast', () => {
    it('should return trend forecasts', async () => {
      const dto: GetForecastDto = {
        timeframe: '30days',
        topic: 'AI Technology',
      };

      const forecast = {
        prediction: 'Rising',
        topic: 'AI Technology',
        trendScore: 85,
      };

      mockInsightsService.getForecast.mockResolvedValue(forecast);

      const result = await controller.getForecast(dto, mockUser);

      expect(service.getForecast).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(forecast);
    });
  });

  describe('getInsights', () => {
    it('should return AI insights', async () => {
      const insights = [
        {
          actionableSteps: [],
          category: 'trend',
          confidence: 85,
          description: 'Test',
          impact: 'high',
          isRead: false,
          relatedMetrics: [],
          title: 'Test',
        },
        {
          actionableSteps: [],
          category: 'opportunity',
          confidence: 72,
          description: 'Test',
          impact: 'medium',
          isRead: false,
          relatedMetrics: [],
          title: 'Test',
        },
      ];

      mockInsightsService.getInsights.mockResolvedValue(insights);

      const result = await controller.getInsights(mockReq, mockUser);

      expect(service.getInsights).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        5,
        expect.any(Function),
      );
      expect(result).toEqual(insights);
    });

    it('should accept custom limit', async () => {
      const insights = [];
      mockInsightsService.getInsights.mockResolvedValue(insights);

      await controller.getInsights(mockReq, mockUser, '10');

      expect(service.getInsights).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        10,
        expect.any(Function),
      );
    });
  });

  describe('predictViral', () => {
    it('should predict viral potential', async () => {
      const dto: PredictViralDto = {
        content: 'Amazing AI breakthrough!',
        platform: 'twitter',
      };

      const prediction = {
        factors: ['trending topic', 'engaging headline'],
        viralScore: 78,
      };

      mockInsightsService.predictViral.mockResolvedValue(prediction);

      const result = await controller.predictViral(mockReq, dto, mockUser);

      expect(service.predictViral).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(result).toEqual(prediction);
    });
  });

  describe('getContentGaps', () => {
    it('should return content gaps', async () => {
      const gaps = [
        { category: 'tutorials', opportunity: 'high', score: 65 },
        { category: 'reviews', opportunity: 'medium', score: 45 },
      ];

      mockInsightsService.getContentGaps.mockResolvedValue(gaps);

      const result = await controller.getContentGaps(mockReq, mockUser);

      expect(service.getContentGaps).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(result).toEqual(gaps);
    });
  });

  describe('getBestTimes', () => {
    it('should return best posting times', async () => {
      const times = {
        bestTimes: ['14:00', '18:00', '20:00'],
        platform: 'instagram',
        timezone: 'UTC',
      };

      mockInsightsService.getBestTimes.mockResolvedValue(times);

      const result = await controller.getBestTimes(mockReq, mockUser);

      expect(service.getBestTimes).toHaveBeenCalledWith(
        'instagram',
        'UTC',
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(result).toEqual(times);
    });

    it('should accept custom platform and timezone', async () => {
      const times = {
        bestTimes: ['10:00', '15:00'],
        platform: 'twitter',
        timezone: 'America/New_York',
      };

      mockInsightsService.getBestTimes.mockResolvedValue(times);

      await controller.getBestTimes(
        mockReq,
        mockUser,
        'twitter',
        'America/New_York',
      );

      expect(service.getBestTimes).toHaveBeenCalledWith(
        'twitter',
        'America/New_York',
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
    });
  });

  describe('getGrowthPrediction', () => {
    it('should return growth prediction', async () => {
      const prediction = {
        confidence: 0.85,
        platform: 'instagram',
        predictedGrowth: 15,
        timeframe: '30days',
      };

      mockInsightsService.getGrowthPrediction.mockResolvedValue(prediction);

      const result = await controller.getGrowthPrediction(mockUser);

      expect(service.getGrowthPrediction).toHaveBeenCalledWith(
        'instagram',
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(prediction);
    });

    it('should accept custom platform', async () => {
      const prediction = {
        confidence: 0.9,
        platform: 'youtube',
        predictedGrowth: 20,
        timeframe: '30days',
      };

      mockInsightsService.getGrowthPrediction.mockResolvedValue(prediction);

      await controller.getGrowthPrediction(mockUser, 'youtube');

      expect(service.getGrowthPrediction).toHaveBeenCalledWith(
        'youtube',
        mockUser.publicMetadata.organization,
      );
    });
  });
});
