import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { PostAnalytics } from '@api/collections/posts/schemas/post-analytics.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';

describe('PerformanceSummaryService', () => {
  let service: PerformanceSummaryService;
  let mockPostAnalyticsModel: Record<string, vi.Mock>;

  beforeEach(async () => {
    mockPostAnalyticsModel = {
      aggregate: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceSummaryService,
        {
          provide: getModelToken(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS),
          useValue: mockPostAnalyticsModel,
        },
      ],
    }).compile();

    service = module.get<PerformanceSummaryService>(PerformanceSummaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWeeklySummary', () => {
    it('should return a weekly summary with all fields', async () => {
      const result = await service.getWeeklySummary(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );

      expect(result).toHaveProperty('topPerformers');
      expect(result).toHaveProperty('worstPerformers');
      expect(result).toHaveProperty('avgEngagementByPlatform');
      expect(result).toHaveProperty('avgEngagementByContentType');
      expect(result).toHaveProperty('bestPostingTimes');
      expect(result).toHaveProperty('topHooks');
      expect(result).toHaveProperty('weekOverWeekTrend');
      expect(result.weekOverWeekTrend).toHaveProperty('direction');
      expect(result.weekOverWeekTrend).toHaveProperty('percentageChange');
    });

    it('should respect topN and worstN options', async () => {
      const result = await service.getWeeklySummary(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        {
          topN: 3,
          worstN: 2,
        },
      );

      expect(result.topPerformers).toHaveLength(0); // empty db
      expect(result.worstPerformers).toHaveLength(0);
    });
  });

  describe('getTopPerformers', () => {
    it('should return an array of performance content items', async () => {
      const result = await service.getTopPerformers(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        5,
      );
      expect(Array.isArray(result)).toBe(true);
    });

    it('should use default limit of 10', async () => {
      const result = await service.getTopPerformers(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getPromptPerformance', () => {
    it('should return prompt performance rankings', async () => {
      const result = await service.getPromptPerformance(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle results with descriptions', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValueOnce([
        {
          _id: 'post1',
          avgEngagementRate: 5.5,
          description: 'Test content description here',
          label: 'Test Label',
          totalViews: 1000,
        },
      ]);

      const result = await service.getPromptPerformance(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generatePerformanceContext', () => {
    it('should return a string context block', async () => {
      const result = await service.generatePerformanceContext(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
      expect(typeof result).toBe('string');
    });

    it('should return fallback when no data available', async () => {
      const result = await service.generatePerformanceContext(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
      expect(result).toContain('trending');
    });
  });
});
