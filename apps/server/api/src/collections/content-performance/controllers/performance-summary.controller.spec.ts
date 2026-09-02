import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { PerformanceSummaryController } from '@api/collections/content-performance/controllers/performance-summary.controller';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PerformanceSummaryController', () => {
  let controller: PerformanceSummaryController;
  let mockService: Record<string, vi.Mock>;

  const mockBrandId = testId('brand');
  const mockOrgId = testId('org');

  const mockUser = {
    id: 'user_123',
    brandId: mockBrandId,
    organizationId: mockOrgId,
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
      .overrideGuard(BetterAuthGuard)
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

    it('clamps topN and worstN to the maximum summary limit', async () => {
      await controller.getWeeklySummary(
        mockReq,
        mockBrandId,
        '5000',
        '9999',
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
          topN: 50,
          worstN: 50,
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

    it('clamps a client-supplied limit to the maximum summary limit', async () => {
      await controller.getTopPerformers(
        mockBrandId,
        '10000',
        undefined as any,
        undefined as any,
        mockUser as any,
      );

      expect(mockService.getTopPerformers).toHaveBeenCalledWith(
        mockOrgId,
        mockBrandId,
        50,
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

  describe('validateBrandId', () => {
    it('accepts a canonical cuid brandId', async () => {
      const cuidBrand = testId('brand', 2);

      const result = await controller.getGenerationContext(
        cuidBrand,
        mockUser as any,
      );

      expect(result).toEqual({
        context: 'No performance data available yet.',
      });
      expect(mockService.generatePerformanceContext).toHaveBeenCalledWith(
        mockOrgId,
        cuidBrand,
      );
    });

    it('rejects an empty brandId', async () => {
      await expect(
        controller.getGenerationContext('', mockUser as any),
      ).rejects.toThrow();
      expect(mockService.generatePerformanceContext).not.toHaveBeenCalled();
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
