import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface AttributionResult {
  generationId: string;
  promptUsed?: string;
  hookUsed?: string;
  workflowExecutionId?: string;
  totalRecords: number;
  avgPerformanceScore: number;
  avgEngagementRate: number;
  totalViews: number;
  totalEngagements: number;
}

@Injectable()
export class AttributionService {
  constructor(
    private readonly prisma: PrismaService,
    readonly _logger: LoggerService,
  ) {}

  /**
   * Get attribution data for a specific generationId — links performance
   * back to the workflow/prompt that created the content.
   */
  async getAttributionByGenerationId(
    organizationId: string,
    generationId: string,
  ): Promise<AttributionResult | null> {
    const rows = await this.prisma.contentPerformance.groupBy({
      _avg: { engagementRate: true, performanceScore: true },
      _count: { id: true },
      _sum: {
        likes: true,
        comments: true,
        shares: true,
        saves: true,
        views: true,
      },
      by: ['generationId', 'promptUsed', 'hookUsed', 'workflowExecutionId'],
      where: {
        generationId,
        isDeleted: false,
        organizationId,
      },
    });

    if (!rows.length) {
      return null;
    }

    const r = rows[0];
    return {
      avgEngagementRate: r._avg.engagementRate ?? 0,
      avgPerformanceScore: r._avg.performanceScore ?? 0,
      generationId: r.generationId ?? generationId,
      hookUsed: r.hookUsed ?? undefined,
      promptUsed: r.promptUsed ?? undefined,
      totalEngagements:
        (r._sum.likes ?? 0) +
        (r._sum.comments ?? 0) +
        (r._sum.shares ?? 0) +
        (r._sum.saves ?? 0),
      totalRecords: r._count.id,
      totalViews: r._sum.views ?? 0,
      workflowExecutionId: r.workflowExecutionId ?? undefined,
    };
  }

  /**
   * Rank generation strategies by average performance score
   */
  async rankGenerationStrategies(
    organizationId: string,
    brandId?: string,
    limit = 20,
  ): Promise<AttributionResult[]> {
    const rows = await this.prisma.contentPerformance.groupBy({
      _avg: { engagementRate: true, performanceScore: true },
      _count: { id: true },
      _sum: {
        likes: true,
        comments: true,
        shares: true,
        saves: true,
        views: true,
      },
      by: ['generationId', 'promptUsed', 'hookUsed', 'workflowExecutionId'],
      orderBy: { _avg: { performanceScore: 'desc' } },
      take: limit,
      where: {
        generationId: { not: null },
        isDeleted: false,
        organizationId,
        ...(brandId ? { brandId } : {}),
      },
    });

    return rows.map((r) => ({
      avgEngagementRate: r._avg.engagementRate ?? 0,
      avgPerformanceScore: r._avg.performanceScore ?? 0,
      generationId: r.generationId ?? '',
      hookUsed: r.hookUsed ?? undefined,
      promptUsed: r.promptUsed ?? undefined,
      totalEngagements:
        (r._sum.likes ?? 0) +
        (r._sum.comments ?? 0) +
        (r._sum.shares ?? 0) +
        (r._sum.saves ?? 0),
      totalRecords: r._count.id,
      totalViews: r._sum.views ?? 0,
      workflowExecutionId: r.workflowExecutionId ?? undefined,
    }));
  }
}
