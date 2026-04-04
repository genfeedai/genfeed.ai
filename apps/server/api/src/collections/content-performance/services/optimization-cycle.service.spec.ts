import { ContentPerformance } from '@api/collections/content-performance/schemas/content-performance.schema';
import { OptimizationCycleService } from '@api/collections/content-performance/services/optimization-cycle.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';

describe('OptimizationCycleService', () => {
  let service: OptimizationCycleService;
  let mockModel: Record<string, vi.Mock>;
  let mockSummaryService: Partial<PerformanceSummaryService>;

  const mockContentData = [
    {
      _id: 'cp1',
      combinedScore: 0.15 * 0.6 + 80 * 0.4,
      contentType: 'reel',
      cycleNumber: 1,
      engagementRate: 0.15,
      hookUsed: 'Stop scrolling — this changed everything',
      measuredAt: new Date('2026-02-10T14:00:00Z'),
      performanceScore: 80,
      platform: 'instagram',
    },
    {
      _id: 'cp2',
      combinedScore: 0.12 * 0.6 + 70 * 0.4,
      contentType: 'reel',
      cycleNumber: 1,
      engagementRate: 0.12,
      hookUsed: '3 things nobody tells you about AI',
      measuredAt: new Date('2026-02-11T10:00:00Z'),
      performanceScore: 70,
      platform: 'tiktok',
    },
    {
      _id: 'cp3',
      combinedScore: 0.08 * 0.6 + 55 * 0.4,
      contentType: 'carousel',
      cycleNumber: 1,
      engagementRate: 0.08,
      measuredAt: new Date('2026-02-12T18:00:00Z'),
      performanceScore: 55,
      platform: 'instagram',
      promptUsed: 'How to build a brand in 2026',
    },
  ];

  const mockStatsResult = [
    {
      avgEngagementRate: 0.1167,
      avgPerformanceScore: 68.33,
      bottomEngagementRate: 0.08,
      endDate: new Date('2026-02-12'),
      maxCycle: 1,
      startDate: new Date('2026-02-10'),
      topEngagementRate: 0.15,
      totalContent: 3,
    },
  ];

  beforeEach(async () => {
    mockModel = {
      aggregate: vi.fn(),
    };

    mockSummaryService = {
      generatePerformanceContext: vi
        .fn()
        .mockResolvedValue(
          'Your top hooks last week: [Stop scrolling]. Best posting time: 2PM. Best platform: instagram. Engagement trending UP 12%.',
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizationCycleService,
        {
          provide: getModelToken(ContentPerformance.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        {
          provide: PerformanceSummaryService,
          useValue: mockSummaryService,
        },
      ],
    }).compile();

    service = module.get<OptimizationCycleService>(OptimizationCycleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runOptimizationCycle', () => {
    it('should return a full optimization cycle result', async () => {
      mockModel.aggregate
        .mockResolvedValueOnce(mockContentData) // getRankedContent
        .mockResolvedValueOnce(mockStatsResult); // computeCycleStats

      const result = await service.runOptimizationCycle(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );

      expect(result).toHaveProperty('topPatterns');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('nextBatchSuggestions');
      expect(result).toHaveProperty('cycleStats');
      expect(result.topPatterns.hooks.length).toBeGreaterThan(0);
      expect(result.topPatterns.platforms.length).toBeGreaterThan(0);
      expect(result.topPatterns.contentTypes.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle empty data gracefully', async () => {
      mockModel.aggregate
        .mockResolvedValueOnce([]) // no content
        .mockResolvedValueOnce([]); // no stats

      const result = await service.runOptimizationCycle(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );

      expect(result.topPatterns.hooks).toHaveLength(0);
      expect(result.cycleStats.totalContent).toBe(0);
      expect(result.nextBatchSuggestions.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by cycleNumber', async () => {
      mockModel.aggregate
        .mockResolvedValueOnce(mockContentData)
        .mockResolvedValueOnce(mockStatsResult);

      await service.runOptimizationCycle(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        {
          cycleNumber: 2,
        },
      );

      const firstCall = mockModel.aggregate.mock.calls[0][0];
      expect(firstCall[0].$match).toHaveProperty('cycleNumber', 2);
    });

    it('should filter by date range', async () => {
      mockModel.aggregate
        .mockResolvedValueOnce(mockContentData)
        .mockResolvedValueOnce(mockStatsResult);

      await service.runOptimizationCycle(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        {
          endDate: '2026-02-15',
          startDate: '2026-02-01',
        },
      );

      const firstCall = mockModel.aggregate.mock.calls[0][0];
      expect(firstCall[0].$match).toHaveProperty('measuredAt');
    });

    it('should rank hooks by engagement rate', async () => {
      mockModel.aggregate
        .mockResolvedValueOnce(mockContentData)
        .mockResolvedValueOnce(mockStatsResult);

      const result = await service.runOptimizationCycle(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );

      const hooks = result.topPatterns.hooks;
      for (let i = 1; i < hooks.length; i++) {
        expect(hooks[i - 1].avgEngagementRate).toBeGreaterThanOrEqual(
          hooks[i].avgEngagementRate,
        );
      }
    });
  });

  describe('generateNextBatchPrompts', () => {
    it('should return the requested number of suggestions', async () => {
      mockModel.aggregate
        .mockResolvedValueOnce(mockContentData)
        .mockResolvedValueOnce(mockStatsResult);

      const suggestions = await service.generateNextBatchPrompts(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        3,
      );

      expect(suggestions).toHaveLength(3);
      for (const s of suggestions) {
        expect(s).toHaveProperty('prompt');
        expect(s).toHaveProperty('suggestedHook');
        expect(s).toHaveProperty('suggestedPlatform');
        expect(s).toHaveProperty('suggestedPostTime');
        expect(s).toHaveProperty('confidence');
        expect(typeof s.prompt).toBe('string');
        expect(s.prompt.length).toBeGreaterThan(0);
      }
    });

    it('should call generatePerformanceContext', async () => {
      mockModel.aggregate
        .mockResolvedValueOnce(mockContentData)
        .mockResolvedValueOnce(mockStatsResult);

      await service.generateNextBatchPrompts(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        2,
      );

      expect(
        mockSummaryService.generatePerformanceContext,
      ).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );
    });

    it('should include performance context in prompts', async () => {
      mockModel.aggregate
        .mockResolvedValueOnce(mockContentData)
        .mockResolvedValueOnce(mockStatsResult);

      const suggestions = await service.generateNextBatchPrompts(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        1,
      );

      expect(suggestions[0].prompt).toContain('Performance context:');
    });
  });

  describe('getCycleHistory', () => {
    it('should return cycle history entries', async () => {
      mockModel.aggregate.mockResolvedValueOnce([
        {
          _id: 1,
          avgEngagementRate: 0.1,
          avgPerformanceScore: 65,
          endDate: new Date('2026-01-15'),
          startDate: new Date('2026-01-01'),
          totalContent: 10,
        },
        {
          _id: 2,
          avgEngagementRate: 0.13,
          avgPerformanceScore: 72,
          endDate: new Date('2026-01-31'),
          startDate: new Date('2026-01-16'),
          totalContent: 12,
        },
      ]);

      const history = await service.getCycleHistory(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );

      expect(history).toHaveLength(2);
      expect(history[0].cycleNumber).toBe(1);
      expect(history[1].cycleNumber).toBe(2);
      expect(history[1].avgEngagementRate).toBeGreaterThan(
        history[0].avgEngagementRate,
      );
    });

    it('should handle empty history', async () => {
      mockModel.aggregate.mockResolvedValueOnce([]);

      const history = await service.getCycleHistory(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      );

      expect(history).toHaveLength(0);
    });
  });
});
