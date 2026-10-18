vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { OptimizationCycleService } from '@api/collections/content-performance/services/optimization-cycle.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

describe('OptimizationCycleService', () => {
  const aggregate = vi.fn();
  const findMany = vi.fn();
  const groupBy = vi.fn();
  let service: OptimizationCycleService;

  beforeEach(() => {
    vi.clearAllMocks();
    aggregate.mockResolvedValue({
      _count: { _all: 0, cycleNumber: 0, engagementRate: 0 },
      _max: { cycleNumber: null, engagementRate: null, measuredAt: null },
      _min: { engagementRate: null, measuredAt: null },
      _sum: { engagementRate: null, performanceScore: null },
    });
    findMany.mockResolvedValue([]);
    groupBy.mockResolvedValue([]);
    service = new OptimizationCycleService({
      contentPerformance: { aggregate, findMany, groupBy },
    } as unknown as PrismaService);
  });

  it('does not expose generateNextBatchPrompts on the public surface', () => {
    expect('generateNextBatchPrompts' in service).toBe(false);
  });

  describe('runOptimizationCycle', () => {
    it('returns nextBatchSuggestions derived from winning hooks, platform, and content type', async () => {
      findMany.mockResolvedValue([
        {
          contentType: 'reel',
          cycleNumber: 2,
          engagementRate: 12,
          hookUsed: 'Stop scrolling if you sell online',
          id: 'perf-1',
          measuredAt: new Date('2026-07-20T18:00:00.000Z'),
          performanceScore: 80,
          platform: 'instagram',
          promptUsed: 'Write a hook-led reel',
        },
        {
          contentType: 'reel',
          cycleNumber: 2,
          engagementRate: 8,
          hookUsed: 'Proof first, then the offer',
          id: 'perf-2',
          measuredAt: new Date('2026-07-20T18:00:00.000Z'),
          performanceScore: 60,
          platform: 'instagram',
        },
      ]);
      aggregate.mockResolvedValue({
        _count: { _all: 2, cycleNumber: 2, engagementRate: 2 },
        _max: {
          cycleNumber: 2,
          engagementRate: 12,
          measuredAt: new Date('2026-07-20T18:00:00.000Z'),
        },
        _min: {
          engagementRate: 8,
          measuredAt: new Date('2026-07-20T18:00:00.000Z'),
        },
        _sum: { engagementRate: 20, performanceScore: 140 },
      });

      const result = await service.runOptimizationCycle('org-1', 'brand-1');

      expect(result.nextBatchSuggestions.length).toBeGreaterThan(0);
      expect(result.nextBatchSuggestions[0]).toEqual(
        expect.objectContaining({
          suggestedHook: 'Stop scrolling if you sell online',
          suggestedPlatform: 'instagram',
          suggestedPostTime: '6:00 PM',
        }),
      );
      expect(result.nextBatchSuggestions[0].prompt).toContain('reel');
      expect(result.nextBatchSuggestions[0].prompt).toContain('instagram');
      expect(result.nextBatchSuggestions[0].prompt).toContain(
        'Stop scrolling if you sell online',
      );
      expect(result.nextBatchSuggestions[0].confidence).toBeGreaterThan(0);
      expect(result.cycleStats.dateRange).toEqual({
        end: '2026-07-20T18:00:00.000Z',
        start: '2026-07-20T18:00:00.000Z',
      });
    });

    it('returns a generic nextBatchSuggestion when ranked content has no hooks', async () => {
      findMany.mockResolvedValue([
        {
          contentType: 'post',
          engagementRate: 4,
          id: 'perf-3',
          measuredAt: new Date('2026-07-20T09:00:00.000Z'),
          performanceScore: 40,
          platform: 'x',
        },
      ]);

      const result = await service.runOptimizationCycle('org-1', 'brand-1');

      expect(result.nextBatchSuggestions).toHaveLength(1);
      expect(result.nextBatchSuggestions[0]).toEqual(
        expect.objectContaining({
          suggestedHook: '',
          suggestedPlatform: 'x',
          suggestedPostTime: '9:00 AM',
        }),
      );
      expect(result.nextBatchSuggestions[0].prompt).toContain('post');
      expect(result.nextBatchSuggestions[0].prompt).toContain('x');
    });

    it('scopes the contentPerformance query to the organization and brand', async () => {
      await service.runOptimizationCycle('org-1', 'brand-1');

      const expectedQuery = expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      });

      expect(findMany).toHaveBeenCalledExactlyOnceWith(expectedQuery);
      expect(aggregate).toHaveBeenCalledExactlyOnceWith(expectedQuery);
    });

    it('uses database statistics for large histories and preserves null-as-zero averages and extrema', async () => {
      aggregate.mockResolvedValue({
        _count: { _all: 250_000, cycleNumber: 249_999, engagementRate: 2 },
        _max: {
          cycleNumber: 0,
          engagementRate: -2,
          measuredAt: new Date('2026-07-22T00:00:00.000Z'),
        },
        _min: {
          engagementRate: -6,
          measuredAt: new Date('2026-07-20T00:00:00.000Z'),
        },
        _sum: { engagementRate: -8, performanceScore: 100 },
      });

      const { cycleStats } = await service.runOptimizationCycle(
        'org-1',
        'brand-1',
      );

      expect(cycleStats).toEqual({
        avgEngagementRate: -8 / 250_000,
        avgPerformanceScore: 100 / 250_000,
        bottomEngagementRate: -6,
        cycleNumber: 1,
        dateRange: {
          end: '2026-07-22T00:00:00.000Z',
          start: '2026-07-20T00:00:00.000Z',
        },
        topEngagementRate: 0,
        totalContent: 250_000,
      });
      expect(findMany).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ take: 30 }),
      );
    });

    it('includes missing engagement as zero in the minimum without changing explicit cycle and date filters', async () => {
      aggregate.mockResolvedValue({
        _count: { _all: 3, cycleNumber: 3, engagementRate: 2 },
        _max: { cycleNumber: 0, engagementRate: 6, measuredAt: null },
        _min: { engagementRate: 2, measuredAt: null },
        _sum: { engagementRate: 8, performanceScore: null },
      });
      const options = {
        cycleNumber: 0,
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      };

      const { cycleStats } = await service.runOptimizationCycle(
        'org-1',
        'brand-1',
        options,
      );

      expect(cycleStats).toMatchObject({
        avgEngagementRate: 8 / 3,
        avgPerformanceScore: 0,
        bottomEngagementRate: 0,
        cycleNumber: 0,
        topEngagementRate: 6,
      });
      expect(aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            brandId: 'brand-1',
            isDeleted: false,
            cycleNumber: 0,
            measuredAt: {
              gte: new Date(options.startDate),
              lte: new Date(options.endDate),
            },
          },
        }),
      );
    });

    it('preserves negative measured extrema and cycle zero when no values are missing', async () => {
      aggregate.mockResolvedValue({
        _count: { _all: 2, cycleNumber: 2, engagementRate: 2 },
        _max: { cycleNumber: 0, engagementRate: -2, measuredAt: null },
        _min: { engagementRate: -6, measuredAt: null },
        _sum: { engagementRate: -8, performanceScore: null },
      });

      const { cycleStats } = await service.runOptimizationCycle(
        'org-1',
        'brand-1',
      );

      expect(cycleStats).toMatchObject({
        bottomEngagementRate: -6,
        topEngagementRate: -2,
        cycleNumber: 0,
      });
    });

    it('returns zero statistics and current dates for an empty history', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
        const { cycleStats } = await service.runOptimizationCycle(
          'org-1',
          'brand-1',
        );
        expect(cycleStats).toEqual({
          avgEngagementRate: 0,
          avgPerformanceScore: 0,
          bottomEngagementRate: 0,
          cycleNumber: 1,
          dateRange: {
            start: '2026-10-17T12:00:00.000Z',
            end: '2026-10-17T12:00:00.000Z',
          },
          topEngagementRate: 0,
          totalContent: 0,
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getCycleHistory', () => {
    it('groups in the database and combines null and zero cycles using all rows as the average denominator', async () => {
      groupBy.mockResolvedValue([
        {
          cycleNumber: 2,
          _count: { _all: 250_000 },
          _sum: { engagementRate: 20, performanceScore: 50 },
          _min: { measuredAt: new Date('2026-07-22') },
          _max: { measuredAt: new Date('2026-07-23') },
        },
        {
          cycleNumber: 0,
          _count: { _all: 2 },
          _sum: { engagementRate: 8, performanceScore: null },
          _min: { measuredAt: new Date('2026-07-20') },
          _max: { measuredAt: new Date('2026-07-21') },
        },
        {
          cycleNumber: null,
          _count: { _all: 1 },
          _sum: { engagementRate: null, performanceScore: 30 },
          _min: { measuredAt: new Date('2026-07-19') },
          _max: { measuredAt: null },
        },
      ]);

      const history = await service.getCycleHistory('org-1', 'brand-1');

      expect(history).toEqual([
        {
          cycleNumber: 0,
          totalContent: 3,
          avgEngagementRate: 8 / 3,
          avgPerformanceScore: 10,
          dateRange: {
            start: new Date('2026-07-19'),
            end: new Date('2026-07-21'),
          },
        },
        {
          cycleNumber: 2,
          totalContent: 250_000,
          avgEngagementRate: 20 / 250_000,
          avgPerformanceScore: 50 / 250_000,
          dateRange: {
            start: new Date('2026-07-22'),
            end: new Date('2026-07-23'),
          },
        },
      ]);
      expect(findMany).not.toHaveBeenCalled();
      expect(groupBy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          by: ['cycleNumber'],
          where: {
            organizationId: 'org-1',
            brandId: 'brand-1',
            isDeleted: false,
          },
        }),
      );
    });

    it('returns no cycles for empty history and current dates when a cycle has no measurements', async () => {
      expect(await service.getCycleHistory('org-1', 'brand-1')).toEqual([]);
      vi.useFakeTimers();
      try {
        const now = new Date('2026-10-17T12:00:00.000Z');
        vi.setSystemTime(now);
        groupBy.mockResolvedValue([
          {
            cycleNumber: null,
            _count: { _all: 1 },
            _sum: { engagementRate: null, performanceScore: null },
            _min: { measuredAt: null },
            _max: { measuredAt: null },
          },
        ]);
        expect(await service.getCycleHistory('org-1', 'brand-1')).toEqual([
          {
            cycleNumber: 0,
            totalContent: 1,
            avgEngagementRate: 0,
            avgPerformanceScore: 0,
            dateRange: { start: now, end: now },
          },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
