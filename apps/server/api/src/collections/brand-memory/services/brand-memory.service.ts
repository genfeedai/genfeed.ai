import type {
  BrandMemoryDocument,
  BrandMemoryInsight,
} from '@api/collections/brand-memory/schemas/brand-memory.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface BrandMemoryEntryInput {
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

export interface BrandMemoryInsightInput {
  category: string;
  insight: string;
  confidence: number;
  source: string;
  createdAt?: Date;
}

export interface BrandMemoryMetricsInput {
  postsPublished?: number;
  totalEngagement?: number;
  avgEngagementRate?: number;
  topPerformingFormat?: string;
  topPerformingTime?: string;
}

export interface BrandMemoryDateRange {
  from?: Date;
  to?: Date;
}

@Injectable()
export class BrandMemoryService extends BaseService<BrandMemoryDocument> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'brandMemory', logger);
  }

  async logEntry(
    organizationId: string,
    brandId: string,
    entry: BrandMemoryEntryInput,
  ): Promise<BrandMemoryDocument | null> {
    const date = this.startOfDay(new Date());
    const existing = await this.delegate.findFirst({
      where: this.buildDailyFilter(organizationId, brandId, new Date()),
    });

    const newEntry = {
      content: entry.content,
      metadata: entry.metadata,
      timestamp: entry.timestamp ?? new Date(),
      type: entry.type,
    };

    if (existing) {
      const currentEntries =
        ((existing as Record<string, unknown>).entries as unknown[]) ?? [];
      return this.delegate.update({
        where: { id: (existing as Record<string, unknown>).id as string },
        data: {
          entries: [...currentEntries, newEntry] as unknown as Record<
            string,
            unknown
          >[],
        },
      }) as Promise<BrandMemoryDocument>;
    }

    return this.delegate.create({
      data: {
        brandId,
        date,
        entries: [newEntry] as unknown as Record<string, unknown>[],
        insights: [],
        isDeleted: false,
        organizationId,
      },
    }) as Promise<BrandMemoryDocument>;
  }

  async addInsight(
    organizationId: string,
    brandId: string,
    insight: BrandMemoryInsightInput,
  ): Promise<BrandMemoryDocument | null> {
    const date = this.startOfDay(new Date());
    const existing = await this.delegate.findFirst({
      where: this.buildDailyFilter(organizationId, brandId, new Date()),
    });

    const newInsight = {
      category: insight.category,
      confidence: insight.confidence,
      createdAt: insight.createdAt ?? new Date(),
      insight: insight.insight,
      source: insight.source,
    };

    if (existing) {
      const currentInsights =
        ((existing as Record<string, unknown>).insights as unknown[]) ?? [];
      return this.delegate.update({
        where: { id: (existing as Record<string, unknown>).id as string },
        data: {
          insights: [...currentInsights, newInsight] as unknown as Record<
            string,
            unknown
          >[],
        },
      }) as Promise<BrandMemoryDocument>;
    }

    return this.delegate.create({
      data: {
        brandId,
        date,
        entries: [],
        insights: [newInsight] as unknown as Record<string, unknown>[],
        isDeleted: false,
        organizationId,
      },
    }) as Promise<BrandMemoryDocument>;
  }

  async updateMetrics(
    organizationId: string,
    brandId: string,
    metrics: BrandMemoryMetricsInput,
  ): Promise<BrandMemoryDocument | null> {
    const date = this.startOfDay(new Date());
    const existing = await this.delegate.findFirst({
      where: this.buildDailyFilter(organizationId, brandId, new Date()),
    });

    const metricsUpdate: Record<string, unknown> = {};
    if (metrics.avgEngagementRate !== undefined) {
      metricsUpdate['metrics.avgEngagementRate'] = metrics.avgEngagementRate;
    }
    if (metrics.postsPublished !== undefined) {
      metricsUpdate['metrics.postsPublished'] = metrics.postsPublished;
    }
    if (metrics.topPerformingFormat !== undefined) {
      metricsUpdate['metrics.topPerformingFormat'] =
        metrics.topPerformingFormat;
    }
    if (metrics.topPerformingTime !== undefined) {
      metricsUpdate['metrics.topPerformingTime'] = metrics.topPerformingTime;
    }
    if (metrics.totalEngagement !== undefined) {
      metricsUpdate['metrics.totalEngagement'] = metrics.totalEngagement;
    }

    if (existing) {
      const currentMetrics =
        ((existing as Record<string, unknown>).metrics as Record<
          string,
          unknown
        >) ?? {};
      const updatedMetrics = { ...currentMetrics };
      if (metrics.avgEngagementRate !== undefined) {
        updatedMetrics.avgEngagementRate = metrics.avgEngagementRate;
      }
      if (metrics.postsPublished !== undefined) {
        updatedMetrics.postsPublished = metrics.postsPublished;
      }
      if (metrics.topPerformingFormat !== undefined) {
        updatedMetrics.topPerformingFormat = metrics.topPerformingFormat;
      }
      if (metrics.topPerformingTime !== undefined) {
        updatedMetrics.topPerformingTime = metrics.topPerformingTime;
      }
      if (metrics.totalEngagement !== undefined) {
        updatedMetrics.totalEngagement = metrics.totalEngagement;
      }

      return this.delegate.update({
        where: { id: (existing as Record<string, unknown>).id as string },
        data: {
          metrics: updatedMetrics as unknown as Record<string, unknown>,
        },
      }) as Promise<BrandMemoryDocument>;
    }

    return this.delegate.create({
      data: {
        brandId,
        date,
        entries: [],
        insights: [],
        isDeleted: false,
        metrics: {
          avgEngagementRate: metrics.avgEngagementRate,
          postsPublished: metrics.postsPublished,
          topPerformingFormat: metrics.topPerformingFormat,
          topPerformingTime: metrics.topPerformingTime,
          totalEngagement: metrics.totalEngagement,
        } as unknown as Record<string, unknown>,
        organizationId,
      },
    }) as Promise<BrandMemoryDocument>;
  }

  getMemory(
    organizationId: string,
    brandId: string,
    dateRange?: BrandMemoryDateRange,
  ): Promise<BrandMemoryDocument[]> {
    const where: Record<string, unknown> = {
      brandId,
      isDeleted: false,
      organizationId,
    };

    if (dateRange?.from || dateRange?.to) {
      where.date = {
        ...(dateRange.from && { gte: dateRange.from }),
        ...(dateRange.to && { lte: dateRange.to }),
      };
    }

    return this.delegate.findMany({
      where,
      orderBy: { date: 'desc' },
    }) as Promise<BrandMemoryDocument[]>;
  }

  async getInsights(
    organizationId: string,
    brandId: string,
    limit: number = 20,
  ): Promise<BrandMemoryInsight[]> {
    const rows = await this.delegate.findMany({
      where: {
        brandId,
        isDeleted: false,
        organizationId,
      },
      orderBy: { date: 'desc' },
      take: Math.max(1, limit),
    });

    const insights = rows.flatMap(
      (row) =>
        ((row as Record<string, unknown>).insights as BrandMemoryInsight[]) ??
        [],
    );

    return insights
      .sort((left, right) => {
        const leftTime = left.createdAt
          ? new Date(left.createdAt).getTime()
          : 0;
        const rightTime = right.createdAt
          ? new Date(right.createdAt).getTime()
          : 0;
        return rightTime - leftTime;
      })
      .slice(0, limit);
  }

  async distillLongTermMemory(
    organizationId: string,
    brandId: string,
  ): Promise<BrandMemoryInsight[]> {
    const now = new Date();
    const fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch last 30 days of memory rows
    const rows = await this.delegate.findMany({
      where: {
        brandId,
        date: { gte: fromDate, lte: now },
        isDeleted: false,
        organizationId,
      },
    });

    // Compute top performing formats in-memory
    const formatMap = new Map<
      string,
      { totalEngagement: number; count: number }
    >();
    for (const row of rows) {
      const metrics = (row as Record<string, unknown>).metrics as
        | Record<string, unknown>
        | undefined;
      const fmt = metrics?.topPerformingFormat as string | undefined;
      const eng = (metrics?.avgEngagementRate as number) ?? 0;
      if (fmt) {
        const existing = formatMap.get(fmt) ?? { count: 0, totalEngagement: 0 };
        existing.count += 1;
        existing.totalEngagement += eng;
        formatMap.set(fmt, existing);
      }
    }

    const topFormats = Array.from(formatMap.entries())
      .map(([fmt, data]) => ({
        avgEngagementRate:
          data.count > 0 ? data.totalEngagement / data.count : 0,
        count: data.count,
        format: fmt,
      }))
      .sort(
        (a, b) =>
          b.avgEngagementRate - a.avgEngagementRate || b.count - a.count,
      )
      .slice(0, 3);

    const distilledInsights: BrandMemoryInsight[] = topFormats.map(
      (format) => ({
        category: 'format',
        confidence: Math.min(1, 0.4 + format.count / 30),
        createdAt: now,
        insight: `${format.format} drives the strongest engagement (${format.avgEngagementRate.toFixed(2)}% avg over ${format.count} days).`,
        source: 'memory_distiller_30d',
      }),
    );

    for (const insight of distilledInsights) {
      await this.addInsight(organizationId, brandId, {
        ...insight,
        createdAt:
          insight.createdAt instanceof Date
            ? insight.createdAt
            : insight.createdAt
              ? new Date(insight.createdAt)
              : undefined,
      });
    }

    return distilledInsights;
  }

  private buildDailyFilter(
    organizationId: string,
    brandId: string,
    date: Date,
  ): Record<string, unknown> {
    return {
      brandId,
      date: {
        gte: this.startOfDay(date),
        lt: this.endOfDay(date),
      },
      isDeleted: false,
      organizationId,
    };
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(24, 0, 0, 0);
    return result;
  }
}
