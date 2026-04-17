import {
  ContentPerformance,
  PerformanceSource,
} from '@api/collections/content-performance/schemas/content-performance.schema';
import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Post, type PostAnalytics } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

/**
 * Integration test: Full closed-loop flow
 *
 * Simulates the complete cycle:
 *   create post → record metrics → attribute → summarize → optimize → generate next batch
 */
describe('Closed-Loop Flow (Integration)', () => {
  let contentPerformanceService: ContentPerformanceService;
  let attributionService: AttributionService;
  let performanceSummaryService: PerformanceSummaryService;

  const orgId = '507f191e810c19729de860ee'.toString();
  const userId = '507f191e810c19729de860ee'.toString();
  const brandId = '507f191e810c19729de860ee'.toString();
  const postId = '507f191e810c19729de860ee'.toString();
  const workflowExecutionId = '507f191e810c19729de860ee'.toString();
  const generationId = 'gen-closed-loop-001';

  // ─── Mock data returned by aggregation pipelines ───────────────────

  const mockPerformanceDoc = {
    _id: '507f191e810c19729de860ee',
    brand: brandId,
    clicks: 50,
    comments: 150,
    contentType: 'image',
    createdAt: new Date(),
    cycleNumber: 1,
    engagementRate: 15.0,
    generationId,
    hookUsed: '5 habits that changed my life',
    isDeleted: false,
    likes: 800,
    measuredAt: new Date('2026-02-10'),
    organization: orgId,
    performanceScore: 85,
    platform: 'instagram',
    post: postId,
    promptUsed: 'Create a carousel about productivity hacks',
    revenue: 0,
    saves: 300,
    shares: 200,
    source: PerformanceSource.API,
    updatedAt: new Date(),
    user: userId,
    views: 10000,
    workflowExecutionId: workflowExecutionId,
  };

  const mockAttributionResult = {
    _id: generationId,
    avgEngagementRate: 15.0,
    avgPerformanceScore: 85,
    hookUsed: '5 habits that changed my life',
    promptUsed: 'Create a carousel about productivity hacks',
    totalEngagements: 1450,
    totalRecords: 1,
    totalViews: 10000,
    workflowExecutionId: workflowExecutionId,
  };

  const mockTopPerformers = [
    {
      _id: postId,
      avgEngagementRate: 15.0,
      comments: 150,
      description:
        '5 habits that changed my life - a deep dive into daily routines',
      likes: 800,
      platform: 'instagram',
      postDoc: {
        category: 'lifestyle',
        description:
          '5 habits that changed my life - a deep dive into daily routines',
        label: '5 habits that changed my life',
        publicationDate: new Date('2026-02-10'),
      },
      publishDate: new Date('2026-02-10'),
      saves: 300,
      shares: 200,
      title: '5 habits that changed my life',
      views: 10000,
    },
  ];

  const mockPromptPerformance = [
    {
      _id: postId,
      avgEngagementRate: 15.0,
      description: 'Create a carousel about productivity hacks',
      label: 'Productivity hacks',
      postDoc: {
        description: 'Create a carousel about productivity hacks',
        label: 'Productivity hacks',
      },
      totalViews: 10000,
    },
  ];

  // ─── Mock models ───────────────────────────────────────────────────

  const mockSave = vi.fn();
  const mockConstructorArgs: Record<string, unknown>[] = [];

  // Model mock must support both constructor usage (BaseService.create) and static methods
  class MockContentPerformanceModel {
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
      mockConstructorArgs.push({ ...data });
    }

    save() {
      return mockSave();
    }

    static aggregate = vi.fn().mockReturnThis();
    static aggregatePaginate = vi.fn();
    static collection = { name: 'content-performance' };
    static create = vi.fn();
    static exec = vi.fn();
    static find = vi.fn().mockReturnThis();
    static findById = vi.fn().mockReturnThis();
    static findOne = vi.fn().mockReturnThis();
    static insertMany = vi.fn();
    static limit = vi.fn().mockReturnThis();
    static modelName = 'ContentPerformance';
    static sort = vi.fn().mockReturnThis();
  }

  const mockContentPerformanceModel = MockContentPerformanceModel;

  const mockPostAnalyticsModel = {
    aggregate: vi.fn(),
    exec: vi.fn(),
    find: vi.fn().mockReturnThis(),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    setContext: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConstructorArgs.length = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentPerformanceService,
        AttributionService,
        PerformanceSummaryService,
        {
          provide: PrismaService,
          useValue: {
            ...mockContentPerformanceModel,
            ...mockContentPerformanceModel,
            ...mockPostAnalyticsModel,
          },
        },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    contentPerformanceService = module.get(ContentPerformanceService);
    attributionService = module.get(AttributionService);
    performanceSummaryService = module.get(PerformanceSummaryService);
  });

  // ─── Step 1: Create post with generationId + promptUsed ───────────

  describe('Step 1: Create content performance record', () => {
    it('should create a record with generationId and promptUsed', async () => {
      mockSave.mockResolvedValue(mockPerformanceDoc);

      const result = await contentPerformanceService.createPerformance(
        {
          brand: brandId,
          clicks: 50,
          comments: 150,
          contentType: 'image' as any,
          generationId,
          hookUsed: '5 habits that changed my life',
          likes: 800,
          measuredAt: '2026-02-10T00:00:00.000Z',
          platform: 'instagram' as any,
          post: postId,
          promptUsed: 'Create a carousel about productivity hacks',
          saves: 300,
          shares: 200,
          views: 10000,
          workflowExecutionId,
        },
        orgId,
        userId,
      );

      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect(result.generationId).toBe(generationId);
    });
  });

  // ─── Step 2: Record performance metrics ────────────────────────────

  describe('Step 2: Record performance metrics', () => {
    it('should compute performanceScore and engagementRate automatically', async () => {
      const mockDoc = { _id: '507f191e810c19729de860ee' };
      mockSave.mockResolvedValue(mockDoc);

      await contentPerformanceService.createPerformance(
        {
          brand: brandId,
          clicks: 50,
          comments: 150,
          contentType: 'image' as any,
          likes: 800,
          measuredAt: '2026-02-10T00:00:00.000Z',
          platform: 'instagram' as any,
          saves: 300,
          shares: 200,
          views: 10000,
        },
        orgId,
        userId,
      );

      // Data is captured via constructor since BaseService.create uses new model(data)
      const constructedData = mockConstructorArgs[0];
      // engagementRate = (800+150+200+300) / 10000 * 100 = 14.5
      expect(constructedData.engagementRate).toBeCloseTo(14.5, 1);
      // performanceScore = min(100, round(15.0 * 10)) = 100 (capped at 100)
      // (800+150+200+300+50)/10000*100=15, score = min(100, 150) = 100
      expect(constructedData.performanceScore).toBeLessThanOrEqual(100);
      expect(constructedData.performanceScore).toBeGreaterThan(0);
    });
  });

  // ─── Step 3: Attribution — link performance → generation ───────────

  describe('Step 3: Run attribution', () => {
    it('should link performance data back to generationId', async () => {
      mockContentPerformanceModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([mockAttributionResult]),
      });

      const result = await attributionService.getAttributionByGenerationId(
        orgId,
        generationId,
      );

      expect(result).not.toBeNull();
      expect(result?.generationId).toBe(generationId);
      expect(result?.promptUsed).toBe(
        'Create a carousel about productivity hacks',
      );
      expect(result?.hookUsed).toBe('5 habits that changed my life');
      expect(result?.avgPerformanceScore).toBe(85);
      expect(result?.totalViews).toBe(10000);
      expect(result?.totalEngagements).toBe(1450);
    });
  });

  // ─── Step 4: Weekly summary with top performers ────────────────────

  describe('Step 4: Weekly summary', () => {
    it('should return top performers in weekly summary', async () => {
      // Mock all the aggregate calls made by getWeeklySummary
      mockPostAnalyticsModel.aggregate
        // topPerformers
        .mockResolvedValueOnce(mockTopPerformers)
        // worstPerformers
        .mockResolvedValueOnce([])
        // avgEngagementByPlatform
        .mockResolvedValueOnce([
          { _id: 'instagram', avgEngagementRate: 15.0, posts: [postId] },
        ])
        // avgEngagementByContentType
        .mockResolvedValueOnce([
          { _id: 'lifestyle', avgEngagementRate: 15.0, posts: [postId] },
        ])
        // bestPostingTimes
        .mockResolvedValueOnce([
          { _id: 10, avgEngagementRate: 15.0, postCount: 1 },
        ])
        // topHooks (calls getContentByEngagement internally)
        .mockResolvedValueOnce(mockTopPerformers)
        // weekOverWeekTrend current
        .mockResolvedValueOnce([{ totalEngagement: 1450 }])
        // weekOverWeekTrend previous
        .mockResolvedValueOnce([{ totalEngagement: 1000 }]);

      const summary = await performanceSummaryService.getWeeklySummary(
        orgId,
        brandId,
      );

      expect(summary.topPerformers).toBeDefined();
      expect(summary.topPerformers.length).toBeGreaterThan(0);
      expect(summary.topPerformers[0].engagementRate).toBe(15.0);
      expect(summary.weekOverWeekTrend.direction).toBe('up');
    });
  });

  // ─── Step 5: Prompt performance rankings ───────────────────────────

  describe('Step 5: Prompt performance rankings', () => {
    it('should rank prompts by engagement rate', async () => {
      mockPostAnalyticsModel.aggregate.mockResolvedValueOnce(
        mockPromptPerformance,
      );

      const rankings = await performanceSummaryService.getPromptPerformance(
        orgId,
        brandId,
      );

      expect(rankings).toBeDefined();
      expect(rankings.length).toBeGreaterThan(0);
      expect(rankings[0].promptSnippet).toContain('carousel');
      expect(rankings[0].avgEngagementRate).toBe(15.0);
    });
  });

  // ─── Step 6: Performance context text ──────────────────────────────

  describe('Step 6: Generate performance context', () => {
    it('should produce context text that includes top hooks', async () => {
      // generatePerformanceContext calls: getContentByEngagement, getAvgEngagementByPlatform,
      // getBestPostingTimes, getWeekOverWeekTrend
      mockPostAnalyticsModel.aggregate
        // topPerformers (3)
        .mockResolvedValueOnce(mockTopPerformers)
        // platformEngagement
        .mockResolvedValueOnce([
          { avgEngagementRate: 15.0, platform: 'instagram', posts: [postId] },
        ])
        // bestTimes
        .mockResolvedValueOnce([
          { _id: 10, avgEngagementRate: 15.0, postCount: 1 },
        ])
        // weekOverWeekTrend current
        .mockResolvedValueOnce([{ totalEngagement: 1450 }])
        // weekOverWeekTrend previous
        .mockResolvedValueOnce([{ totalEngagement: 1000 }]);

      const context =
        await performanceSummaryService.generatePerformanceContext(
          orgId,
          brandId,
        );

      expect(context).toContain('top hooks');
      expect(context).toContain('5 habits');
      expect(context).toContain('Best posting time');
      expect(context).toContain('Best platform: instagram');
    });
  });

  // ─── Step 7: Optimization cycle — strategy ranking ─────────────────

  describe('Step 7: Optimization cycle (strategy ranking)', () => {
    it('should rank generation strategies and produce recommendations', async () => {
      const mockRankingResults = [
        {
          _id: generationId,
          avgEngagementRate: 15.0,
          avgPerformanceScore: 85,
          hookUsed: '5 habits that changed my life',
          promptUsed: 'Create a carousel about productivity hacks',
          totalEngagements: 1450,
          totalRecords: 3,
          totalViews: 30000,
          workflowExecutionId: workflowExecutionId,
        },
        {
          _id: 'gen-low-perf-002',
          avgEngagementRate: 2.0,
          avgPerformanceScore: 20,
          hookUsed: 'Check this out',
          promptUsed: 'Generic post about stuff',
          totalEngagements: 100,
          totalRecords: 2,
          totalViews: 5000,
          workflowExecutionId: '507f191e810c19729de860ee',
        },
      ];

      mockContentPerformanceModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockRankingResults),
      });

      const rankings = await attributionService.rankGenerationStrategies(
        orgId,
        brandId,
        10,
      );

      expect(rankings.length).toBe(2);
      // Top performer should be first (sorted by avgPerformanceScore desc)
      expect(rankings[0].generationId).toBe(generationId);
      expect(rankings[0].avgPerformanceScore).toBe(85);
      expect(rankings[1].avgPerformanceScore).toBe(20);

      // Verify recommendations can be derived: top strategy has hooks/prompts
      expect(rankings[0].hookUsed).toBe('5 habits that changed my life');
      expect(rankings[0].promptUsed).toContain('productivity hacks');
    });
  });

  // ─── Step 8: Next batch — biased toward top performers ─────────────

  describe('Step 8: Generate next batch prompts biased toward top performers', () => {
    it('should provide top-performing strategies for next generation', async () => {
      // Simulate fetching top performers to inform next generation
      mockContentPerformanceModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              { ...mockPerformanceDoc, performanceScore: 85 },
              {
                ...mockPerformanceDoc,
                _id: '507f191e810c19729de860ee',
                generationId: 'gen-also-good-003',
                hookUsed: 'The morning routine nobody talks about',
                performanceScore: 78,
                promptUsed: 'Create a reel about morning routines',
              },
            ]),
          }),
        }),
      });

      const topPerformers = await contentPerformanceService.getTopPerformers(
        orgId,
        brandId,
        5,
      );

      expect(topPerformers.length).toBe(2);
      // All returned records are high performers
      expect(
        topPerformers.every(
          (p: { performanceScore: number }) => p.performanceScore >= 70,
        ),
      ).toBe(true);

      // Extract winning hooks/prompts for next generation
      const winningHooks = topPerformers
        .map((p: { hookUsed: string }) => p.hookUsed)
        .filter(Boolean);
      const winningPrompts = topPerformers
        .map((p: { promptUsed: string }) => p.promptUsed)
        .filter(Boolean);

      expect(winningHooks).toContain('5 habits that changed my life');
      expect(winningHooks).toContain('The morning routine nobody talks about');
      expect(winningPrompts.length).toBeGreaterThan(0);
    });
  });
});
