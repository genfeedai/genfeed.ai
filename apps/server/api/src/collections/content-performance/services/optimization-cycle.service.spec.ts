vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { OptimizationCycleService } from '@api/collections/content-performance/services/optimization-cycle.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

describe('OptimizationCycleService', () => {
  const findMany = vi.fn();
  let service: OptimizationCycleService;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    service = new OptimizationCycleService({
      contentPerformance: { findMany },
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

      expect(findMany).toHaveBeenCalledTimes(2);
      expect(findMany).toHaveBeenNthCalledWith(1, expectedQuery);
      expect(findMany).toHaveBeenNthCalledWith(2, expectedQuery);
    });
  });
});
