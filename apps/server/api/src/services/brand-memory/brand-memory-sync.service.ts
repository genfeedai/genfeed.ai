import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface PerformanceThresholdAlert {
  type: 'spike' | 'drop';
  metric: 'engagementRate';
  recentAverage: number;
  baselineAverage: number;
  ratio: number;
}

type ContentPerformanceData = {
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  engagementRate?: number;
  measuredAt?: string | Date;
  platform?: string;
  contentType?: string;
};

@Injectable()
export class BrandMemorySyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandMemoryService: BrandMemoryService,
    private readonly logger: LoggerService,
  ) {}

  async syncPostPerformance(
    organizationId: string,
    brandId: string,
    postId: string,
  ): Promise<void> {
    const performance = await this.prisma.contentPerformance.findFirst({
      orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
      where: scopedWhere(organizationId, { brandId, postId }),
    });

    if (!performance) {
      this.logger.warn('BrandMemorySyncService.syncPostPerformance no data', {
        brandId,
        organizationId,
        postId,
      });
      return;
    }

    const data = (performance.data as ContentPerformanceData) ?? {};

    const totalEngagement =
      (performance.likes ?? data.likes ?? 0) +
      (performance.comments ?? data.comments ?? 0) +
      (performance.shares ?? data.shares ?? 0) +
      (performance.saves ?? data.saves ?? 0) +
      (data.clicks ?? 0);

    const measuredAt = performance.measuredAt ?? performance.createdAt;
    const engagementRate =
      performance.engagementRate ?? data.engagementRate ?? 0;
    const platform = performance.platform ?? data.platform;
    const contentType = performance.contentType ?? data.contentType;

    await this.brandMemoryService.logEntry(organizationId, brandId, {
      content: `Post ${postId} on ${platform} reached ${totalEngagement} engagements with ${engagementRate.toFixed(2)}% engagement rate.`,
      metadata: {
        contentType,
        engagementRate,
        measuredAt,
        platform,
        postId,
      },
      timestamp: measuredAt,
      type: 'post_performance',
    });

    await this.brandMemoryService.updateMetrics(organizationId, brandId, {
      avgEngagementRate: engagementRate,
      postsPublished: 1,
      topPerformingFormat: contentType,
      topPerformingTime: this.toHourLabel(measuredAt),
      totalEngagement,
    });
  }

  async detectThresholdAlerts(
    organizationId: string,
    brandId: string,
  ): Promise<PerformanceThresholdAlert[]> {
    const now = new Date();
    const recentStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const baselineStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const baselineEnd = recentStart;

    const [recent, baseline] = await Promise.all([
      this.prisma.contentPerformance.findMany({
        where: scopedWhere(organizationId, {
          brandId,
          measuredAt: { gte: recentStart, lte: now },
        }),
      }),
      this.prisma.contentPerformance.findMany({
        where: scopedWhere(organizationId, {
          brandId,
          measuredAt: { gte: baselineStart, lt: baselineEnd },
        }),
      }),
    ]);

    const getEngagementRate = (item: {
      data: unknown;
      engagementRate: number | null;
    }): number => {
      const d = item.data as ContentPerformanceData;
      return item.engagementRate ?? d?.engagementRate ?? 0;
    };

    const recentAverage = this.average(recent.map(getEngagementRate));
    const baselineAverage = this.average(baseline.map(getEngagementRate));

    if (baselineAverage <= 0 || recent.length === 0) {
      return [];
    }

    const ratio = recentAverage / baselineAverage;

    const type = ratio > 2 ? 'spike' : ratio < 0.5 ? 'drop' : undefined;
    if (!type) {
      return [];
    }

    await this.brandMemoryService.addInsight(organizationId, brandId, {
      category: 'performance',
      confidence: Math.min(1, recent.length / 10),
      createdAt: now,
      insight: `Engagement ${type}: recent posts averaged ${recentAverage.toFixed(2)}% engagement versus ${baselineAverage.toFixed(2)}% in the preceding baseline (${ratio.toFixed(2)}x).`,
      source: `analytics-threshold:engagementRate:${now.toISOString().slice(0, 10)}`,
    });

    return [
      { baselineAverage, metric: 'engagementRate', ratio, recentAverage, type },
    ];
  }

  private average(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private toHourLabel(date: Date): string {
    const hour = new Date(date).getHours();
    return `${hour.toString().padStart(2, '0')}:00`;
  }
}
