import type { ContentPerformanceDocument } from '@api/collections/content-performance/schemas/content-performance.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface AttributionResult {
  avgEngagementRate: number;
  avgPerformanceScore: number;
  generationId: string;
  hookUsed?: string;
  promptUsed?: string;
  totalEngagements: number;
  totalRecords: number;
  totalViews: number;
  workflowExecutionId?: string;
}

type AttributionAccumulator = {
  generationId: string;
  hookUsed?: string;
  promptUsed?: string;
  totalEngagementRate: number;
  totalEngagements: number;
  totalPerformanceScore: number;
  totalRecords: number;
  totalViews: number;
  workflowExecutionId?: string;
};

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
    const rows = (await this.prisma.contentPerformance.findMany({
      where: {
        generationId,
        isDeleted: false,
        organizationId,
      },
    })) as ContentPerformanceDocument[];

    if (!rows.length) {
      return null;
    }

    return this.toAttributionResult(
      this.aggregateRows(rows).find(
        (row) => row.generationId === generationId,
      ) ?? null,
      generationId,
    );
  }

  /**
   * Rank generation strategies by average performance score
   */
  async rankGenerationStrategies(
    organizationId: string,
    brandId?: string,
    limit = 20,
  ): Promise<AttributionResult[]> {
    const rows = (await this.prisma.contentPerformance.findMany({
      where: {
        generationId: { not: null },
        isDeleted: false,
        organizationId,
        ...(brandId ? { brandId } : {}),
      },
    })) as ContentPerformanceDocument[];

    return this.aggregateRows(rows)
      .sort((a, b) => {
        const avgPerformanceA =
          a.totalRecords > 0 ? a.totalPerformanceScore / a.totalRecords : 0;
        const avgPerformanceB =
          b.totalRecords > 0 ? b.totalPerformanceScore / b.totalRecords : 0;
        return avgPerformanceB - avgPerformanceA;
      })
      .slice(0, limit)
      .map((row) => this.toAttributionResult(row))
      .filter((row): row is AttributionResult => row !== null);
  }

  private aggregateRows(
    rows: ContentPerformanceDocument[],
  ): AttributionAccumulator[] {
    const grouped = new Map<string, AttributionAccumulator>();

    for (const row of rows) {
      const generationId = row.generationId ?? '';
      if (!generationId) {
        continue;
      }

      const key = [
        generationId,
        row.promptUsed ?? '',
        row.hookUsed ?? '',
        row.workflowExecutionId ?? '',
      ].join('::');

      const current = grouped.get(key) ?? {
        generationId,
        hookUsed: row.hookUsed ?? undefined,
        promptUsed: row.promptUsed ?? undefined,
        totalEngagementRate: 0,
        totalEngagements: 0,
        totalPerformanceScore: 0,
        totalRecords: 0,
        totalViews: 0,
        workflowExecutionId: row.workflowExecutionId ?? undefined,
      };

      current.totalEngagementRate += row.engagementRate ?? 0;
      current.totalEngagements +=
        (row.likes ?? 0) +
        (row.comments ?? 0) +
        (row.shares ?? 0) +
        (row.saves ?? 0);
      current.totalPerformanceScore += row.performanceScore ?? 0;
      current.totalRecords += 1;
      current.totalViews += row.views ?? 0;

      grouped.set(key, current);
    }

    return [...grouped.values()];
  }

  private toAttributionResult(
    row: AttributionAccumulator | null,
    fallbackGenerationId?: string,
  ): AttributionResult | null {
    if (!row) {
      return null;
    }

    return {
      avgEngagementRate:
        row.totalRecords > 0 ? row.totalEngagementRate / row.totalRecords : 0,
      avgPerformanceScore:
        row.totalRecords > 0 ? row.totalPerformanceScore / row.totalRecords : 0,
      generationId: row.generationId || fallbackGenerationId || '',
      hookUsed: row.hookUsed ?? undefined,
      promptUsed: row.promptUsed ?? undefined,
      totalEngagements: row.totalEngagements,
      totalRecords: row.totalRecords,
      totalViews: row.totalViews,
      workflowExecutionId: row.workflowExecutionId ?? undefined,
    };
  }
}
