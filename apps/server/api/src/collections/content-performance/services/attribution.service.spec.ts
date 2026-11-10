import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function createService(groups: unknown[]) {
  const groupBy = vi.fn().mockResolvedValue(groups);
  const findMany = vi.fn();
  const service = new AttributionService(
    { contentPerformance: { findMany, groupBy } } as unknown as PrismaService,
    {} as LoggerService,
  );

  return { findMany, groupBy, service };
}

describe('AttributionService.rankGenerationStrategies', () => {
  it('ranks generations by average performance score from SQL-side sums', async () => {
    const { findMany, service } = createService([
      {
        _count: { _all: 4 },
        _sum: {
          comments: 2,
          engagementRate: 0.8,
          likes: 10,
          performanceScore: 40,
          saves: 1,
          shares: 3,
          views: 1000,
        },
        generationId: 'gen-slow',
        workflowExecutionId: null,
      },
      {
        _count: { _all: 2 },
        _sum: {
          comments: null,
          engagementRate: 0.5,
          likes: 5,
          performanceScore: 50,
          saves: null,
          shares: null,
          views: 300,
        },
        generationId: 'gen-fast',
        workflowExecutionId: 'exec-1',
      },
    ]);

    await expect(
      service.rankGenerationStrategies('org-1', undefined, 20),
    ).resolves.toEqual([
      {
        avgEngagementRate: 0.25,
        avgPerformanceScore: 25,
        generationId: 'gen-fast',
        hookUsed: undefined,
        promptUsed: undefined,
        totalEngagements: 5,
        totalRecords: 2,
        totalViews: 300,
        workflowExecutionId: 'exec-1',
      },
      {
        avgEngagementRate: 0.2,
        avgPerformanceScore: 10,
        generationId: 'gen-slow',
        hookUsed: undefined,
        promptUsed: undefined,
        totalEngagements: 16,
        totalRecords: 4,
        totalViews: 1000,
        workflowExecutionId: undefined,
      },
    ]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('keeps only the requested number of strategies', async () => {
    const group = (generationId: string, score: number) => ({
      _count: { _all: 1 },
      _sum: { performanceScore: score },
      generationId,
      workflowExecutionId: null,
    });
    const { service } = createService([
      group('gen-a', 1),
      group('gen-b', 3),
      group('gen-c', 2),
    ]);

    const ranked = await service.rankGenerationStrategies(
      'org-1',
      'brand-1',
      2,
    );

    expect(ranked.map((row) => row.generationId)).toEqual(['gen-b', 'gen-c']);
  });
});
