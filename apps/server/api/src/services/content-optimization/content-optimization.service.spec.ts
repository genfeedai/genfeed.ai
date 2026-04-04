import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('openai', () => ({ default: vi.fn() }));

import { ContentOptimizationService } from '@api/services/content-optimization/content-optimization.service';

describe('ContentOptimizationService', () => {
  let service: ContentOptimizationService;
  let mockPerformanceSummary: { getWeeklySummary: ReturnType<typeof vi.fn> };
  let mockOptimizationCycle: { runOptimizationCycle: ReturnType<typeof vi.fn> };
  let mockOpenAiLlm: { chatCompletion: ReturnType<typeof vi.fn> };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let mockBrandMemory: {
    getMemory: ReturnType<typeof vi.fn>;
    logEntry: ReturnType<typeof vi.fn>;
    addInsight: ReturnType<typeof vi.fn>;
  };

  const orgId = 'org-123';
  const brandId = 'brand-456';

  const mockWeeklySummary = {
    avgEngagementByContentType: [
      { avgEngagementRate: 7.5, category: 'video', totalPosts: 10 },
      { avgEngagementRate: 3.2, category: 'image', totalPosts: 20 },
    ],
    avgEngagementByPlatform: [
      { avgEngagementRate: 8.1, platform: 'instagram', totalPosts: 15 },
      { avgEngagementRate: 4.3, platform: 'twitter', totalPosts: 12 },
    ],
    bestPostingTimes: [
      { avgEngagementRate: 9.0, hour: 10, postCount: 5 },
      { avgEngagementRate: 7.5, hour: 14, postCount: 4 },
    ],
    topHooks: ['Amazing results with this trick'],
    topPerformers: [],
    weekOverWeekTrend: {
      currentEngagement: 1200,
      direction: 'up' as const,
      percentageChange: 15.5,
      previousEngagement: 1039,
    },
    worstPerformers: [],
  };

  const mockCycleResult = {
    cycleStats: {
      avgEngagementRate: 5.4,
      avgPerformanceScore: 62,
      bottomEngagementRate: 0.1,
      cycleNumber: 1,
      dateRange: { end: new Date(), start: new Date() },
      topEngagementRate: 12.3,
      totalContent: 32,
    },
    nextBatchSuggestions: [
      {
        confidence: 0.8,
        prompt: 'test prompt',
        suggestedHook: 'Hook A',
        suggestedPlatform: 'instagram',
        suggestedPostTime: '10:00',
      },
      {
        confidence: 0.6,
        prompt: 'test prompt 2',
        suggestedHook: 'Hook B',
        suggestedPlatform: 'twitter',
        suggestedPostTime: '14:00',
      },
    ],
    recommendations: [
      {
        basedOn: 10,
        category: 'hook',
        confidence: 0.8,
        recommendation: 'Use question-style hooks',
      },
    ],
    topPatterns: {
      contentTypes: [],
      hooks: [],
      platforms: [],
      postingTimes: [],
      sentimentStyles: [],
    },
  };

  beforeEach(() => {
    mockLogger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    mockPerformanceSummary = {
      generatePerformanceContext: vi
        .fn()
        .mockResolvedValue('Best platform: instagram.'),
      getTopPerformers: vi.fn().mockResolvedValue([
        {
          comments: 10,
          description: 'Amazing results with this simple trick',
          engagementRate: 8.5,
          likes: 100,
          platform: 'instagram',
          postId: 'p1',
          saves: 5,
          shares: 20,
          title: 'Top Post',
          views: 5000,
        },
      ]),
      getWeeklySummary: vi.fn().mockResolvedValue(mockWeeklySummary),
    };

    mockOptimizationCycle = {
      runOptimizationCycle: vi.fn().mockResolvedValue(mockCycleResult),
    };

    mockOpenAiLlm = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                confidenceScore: 0.85,
                optimizedPrompt: 'Optimized: Amazing hook with CTA',
                reasoning: 'Added CTA and engagement pattern',
                suggestions: ['Add emoji', 'Keep under 150 chars'],
              }),
              role: 'assistant',
            },
          },
        ],
        id: 'test-id',
        usage: { completion_tokens: 100, prompt_tokens: 200 },
      }),
    };

    mockBrandMemory = {
      addInsight: vi.fn().mockResolvedValue(undefined),
      getMemory: vi.fn().mockResolvedValue([
        {
          date: new Date('2026-02-20T00:00:00.000Z'),
          entries: [
            {
              content: 'Hook: Stop scrolling if you sell online',
              type: 'hook',
            },
          ],
          insights: [],
          metrics: {
            avgEngagementRate: 6.8,
            postsPublished: 3,
            topPerformingFormat: 'video',
            topPerformingTime: '18:00',
            totalEngagement: 540,
          },
        },
      ]),
      logEntry: vi.fn().mockResolvedValue(undefined),
    };

    service = new ContentOptimizationService(
      mockLogger,
      mockPerformanceSummary,
      mockOptimizationCycle,
      mockOpenAiLlm,
      mockBrandMemory,
    );
  });

  describe('analyzePerformance', () => {
    it('should return analysis with summary, cycle, and insights', async () => {
      const result = await service.analyzePerformance(orgId, brandId);

      expect(mockPerformanceSummary.getWeeklySummary).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.any(Object),
      );
      expect(mockOptimizationCycle.runOptimizationCycle).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.any(Object),
      );
      expect(result.summary).toEqual(mockWeeklySummary);
      expect(result.optimizationCycle).toEqual(mockCycleResult);
      expect(result.insights).toBeInstanceOf(Array);
      expect(result.insights.length).toBeGreaterThan(0);
    });

    it('should include trend insight when engagement is up', async () => {
      const result = await service.analyzePerformance(orgId, brandId);

      const trendInsight = result.insights.find((i) => i.includes('UP'));
      expect(trendInsight).toBeDefined();
      expect(trendInsight).toContain('15.5%');
    });

    it('should include platform insight', async () => {
      const result = await service.analyzePerformance(orgId, brandId);

      const platformInsight = result.insights.find((i) =>
        i.includes('instagram'),
      );
      expect(platformInsight).toBeDefined();
    });
  });

  describe('optimizePrompt', () => {
    it('should call LLM and return parsed optimization result', async () => {
      const result = await service.optimizePrompt(
        orgId,
        brandId,
        'Create a post about fitness',
      );

      expect(mockOpenAiLlm.chatCompletion).toHaveBeenCalled();
      expect(result.optimizedPrompt).toBe('Optimized: Amazing hook with CTA');
      expect(result.reasoning).toBe('Added CTA and engagement pattern');
      expect(result.suggestions).toHaveLength(2);
      expect(result.confidenceScore).toBe(0.85);
    });

    it('should fallback to heuristic when LLM fails', async () => {
      mockOpenAiLlm.chatCompletion.mockRejectedValue(new Error('API error'));

      const result = await service.optimizePrompt(
        orgId,
        brandId,
        'Create a post about fitness',
      );

      expect(result.confidenceScore).toBe(0.4);
      expect(result.reasoning).toContain('Heuristic');
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle malformed LLM response gracefully', async () => {
      mockOpenAiLlm.chatCompletion.mockResolvedValue({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: 'not json', role: 'assistant' },
          },
        ],
        id: 'test',
        usage: { completion_tokens: 10, prompt_tokens: 20 },
      });

      const result = await service.optimizePrompt(
        orgId,
        brandId,
        'test prompt',
      );

      expect(result.confidenceScore).toBe(0.3);
      expect(result.optimizedPrompt).toBe('test prompt');
    });
  });

  describe('getRecommendations', () => {
    it('should return structured recommendations', async () => {
      const result = await service.getRecommendations(orgId, brandId);

      expect(result.postingSchedule).toBeInstanceOf(Array);
      expect(result.contentTypes).toBeInstanceOf(Array);
      expect(result.pipelineConfigs).toBeInstanceOf(Array);
      expect(result.abTestSuggestions).toBeInstanceOf(Array);
      expect(result.general).toBeInstanceOf(Array);
    });

    it('should include posting schedule per platform', async () => {
      const result = await service.getRecommendations(orgId, brandId);

      expect(result.postingSchedule.length).toBeGreaterThan(0);
      expect(result.postingSchedule[0].platform).toBeDefined();
      expect(result.postingSchedule[0].bestHours).toBeInstanceOf(Array);
    });

    it('should include content type recommendations with engagement', async () => {
      const result = await service.getRecommendations(orgId, brandId);

      const videoRec = result.contentTypes.find((ct) => ct.type === 'video');
      expect(videoRec).toBeDefined();
      expect(videoRec!.recommendation).toContain('performs well');
    });

    it('should include A/B test suggestions', async () => {
      const result = await service.getRecommendations(orgId, brandId);

      expect(result.abTestSuggestions.length).toBeGreaterThan(0);
      const timingTest = result.abTestSuggestions.find(
        (s) => s.variable === 'posting_time',
      );
      expect(timingTest).toBeDefined();
    });

    it('should map optimization cycle recommendations with priority', async () => {
      const result = await service.getRecommendations(orgId, brandId);

      expect(result.general.length).toBeGreaterThan(0);
      expect(result.general[0].priority).toBe('high');
      expect(result.general[0].category).toBe('hook');
    });
  });

  describe('generateSuggestions', () => {
    it('should generate typed suggestions from brand memory', async () => {
      const suggestions = await service.generateSuggestions(orgId, brandId);

      expect(mockBrandMemory.getMemory).toHaveBeenCalledWith(orgId, brandId, {
        from: expect.any(Date),
        to: expect.any(Date),
      });
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toEqual(
        expect.objectContaining({
          category: expect.any(String),
          confidence: expect.any(Number),
          dataPoints: expect.any(Number),
          id: expect.any(String),
          suggestion: expect.any(String),
        }),
      );
    });
  });

  describe('autoApplySuggestion', () => {
    it('should not apply low confidence suggestions', async () => {
      vi.spyOn(service, 'generateSuggestions').mockResolvedValue([
        {
          category: 'timing',
          confidence: 0.55,
          dataPoints: 3,
          id: 'low-confidence',
          suggestion: 'Post at 6PM',
        },
      ]);

      const result = await service.autoApplySuggestion(
        orgId,
        brandId,
        'low-confidence',
      );

      expect(result.applied).toBe(false);
      expect(mockBrandMemory.logEntry).not.toHaveBeenCalled();
    });

    it('should apply high confidence suggestions to brand memory', async () => {
      vi.spyOn(service, 'generateSuggestions').mockResolvedValue([
        {
          category: 'format',
          confidence: 0.91,
          dataPoints: 12,
          id: 'high-confidence',
          suggestion: 'Increase short-form video output',
        },
      ]);

      const result = await service.autoApplySuggestion(
        orgId,
        brandId,
        'high-confidence',
      );

      expect(result.applied).toBe(true);
      expect(mockBrandMemory.logEntry).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.objectContaining({
          content: expect.stringContaining('Increase short-form video output'),
          type: 'optimization_auto_apply',
        }),
      );
      expect(mockBrandMemory.addInsight).toHaveBeenCalled();
    });
  });
});
