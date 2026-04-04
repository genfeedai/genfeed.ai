import { PerformanceSummaryController } from '@api/collections/content-performance/controllers/performance-summary.controller';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PerformanceSummaryController', () => {
  let controller: PerformanceSummaryController;
  let mockService: Record<string, vi.Mock>;

  const mockBrandId = '507f1f77bcf86cd799439012';
  const mockOrgId = '507f1f77bcf86cd799439011';

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: mockBrandId,
      organization: mockOrgId,
    },
  };

  const mockReq = { originalUrl: '/content-performance/summary' } as Request;

  beforeEach(async () => {
    mockService = {
      generatePerformanceContext: vi
        .fn()
        .mockResolvedValue('No performance data available yet.'),
      getPromptPerformance: vi.fn().mockResolvedValue([]),
      getTopPerformers: vi.fn().mockResolvedValue([]),
      getWeeklySummary: vi.fn().mockResolvedValue({
        avgEngagementByContentType: [],
        avgEngagementByPlatform: [],
        bestPostingTimes: [],
        topHooks: [],
        topPerformers: [],
        weekOverWeekTrend: {
          currentEngagement: 0,
          direction: 'stable',
          percentageChange: 0,
          previousEngagement: 0,
        },
        worstPerformers: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PerformanceSummaryController],
      providers: [
        {
          provide: PerformanceSummaryService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PerformanceSummaryController>(
      PerformanceSummaryController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getWeeklySummary', () => {
    it('should call service with correct params', async () => {
      await controller.getWeeklySummary(
        mockReq,
        mockBrandId,
        '5',
        '3',
        '2025-01-01',
        '2025-01-07',
        mockUser as any,
      );

      expect(mockService.getWeeklySummary).toHaveBeenCalledWith(
        mockOrgId,
        mockBrandId,
        {
          endDate: '2025-01-07',
          startDate: '2025-01-01',
          topN: 5,
          worstN: 3,
        },
      );
    });

    it('should handle missing optional params', async () => {
      await controller.getWeeklySummary(
        mockReq,
        mockBrandId,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        mockUser as any,
      );

      expect(mockService.getWeeklySummary).toHaveBeenCalledWith(
        mockOrgId,
        mockBrandId,
        {
          endDate: undefined,
          startDate: undefined,
          topN: undefined,
          worstN: undefined,
        },
      );
    });
  });

  describe('getTopPerformers', () => {
    it('should call service with parsed limit', async () => {
      await controller.getTopPerformers(
        mockBrandId,
        '20',
        undefined as any,
        undefined as any,
        mockUser as any,
      );

      expect(mockService.getTopPerformers).toHaveBeenCalledWith(
        mockOrgId,
        mockBrandId,
        20,
        { endDate: undefined, startDate: undefined },
      );
    });

    it('should default limit to 10', async () => {
      await controller.getTopPerformers(
        mockBrandId,
        undefined as any,
        undefined as any,
        undefined as any,
        mockUser as any,
      );

      expect(mockService.getTopPerformers).toHaveBeenCalledWith(
        mockOrgId,
        mockBrandId,
        10,
        { endDate: undefined, startDate: undefined },
      );
    });
  });

  describe('getPromptPerformance', () => {
    it('should call service correctly', async () => {
      await controller.getPromptPerformance(
        mockBrandId,
        '2025-01-01',
        '2025-01-07',
        mockUser as any,
      );

      expect(mockService.getPromptPerformance).toHaveBeenCalledWith(
        mockOrgId,
        mockBrandId,
        '2025-01-01',
        '2025-01-07',
      );
    });
  });

  describe('getGenerationContext', () => {
    it('should return context object', async () => {
      const result = await controller.getGenerationContext(
        mockBrandId,
        mockUser as any,
      );

      expect(result).toEqual({
        context: 'No performance data available yet.',
      });
      expect(mockService.generatePerformanceContext).toHaveBeenCalledWith(
        mockOrgId,
        mockBrandId,
      );
    });
  });
});
