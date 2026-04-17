import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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
      orderBy: { createdAt: 'desc' },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        postId,
      },
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
      (data.likes ?? 0) +
      (data.comments ?? 0) +
      (data.shares ?? 0) +
      (data.saves ?? 0) +
      (data.clicks ?? 0);

    const measuredAt = data.measuredAt ? new Date(data.measuredAt) : new Date();

    await this.brandMemoryService.logEntry(organizationId, brandId, {
      content: `Post ${postId} on ${data.platform} reached ${totalEngagement} engagements with ${(data.engagementRate ?? 0).toFixed(2)}% engagement rate.`,
      metadata: {
        contentType: data.contentType,
        engagementRate: data.engagementRate,
        measuredAt,
        platform: data.platform,
        postId,
      },
      timestamp: measuredAt,
      type: 'post_performance',
    });

    await this.brandMemoryService.updateMetrics(organizationId, brandId, {
      avgEngagementRate: data.engagementRate ?? 0,
      postsPublished: 1,
      topPerformingFormat: data.contentType,
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
        where: {
          brandId,
          createdAt: { gte: recentStart, lte: now },
          isDeleted: false,
          organizationId,
        },
      }),
      this.prisma.contentPerformance.findMany({
        where: {
          brandId,
          createdAt: { gte: baselineStart, lt: baselineEnd },
          isDeleted: false,
          organizationId,
        },
      }),
    ]);

    const getEngagementRate = (item: { data: unknown }): number => {
      const d = item.data as ContentPerformanceData;
      return d?.engagementRate ?? 0;
    };

    const recentAverage = this.average(recent.map(getEngagementRate));
    const baselineAverage = this.average(baseline.map(getEngagementRate));

    if (baselineAverage <= 0 || recentAverage <= 0) {
      return [];
    }

    const ratio = recentAverage / baselineAverage;

    if (ratio > 2) {
      return [
        {
          baselineAverage,
          metric: 'engagementRate',
          ratio,
          recentAverage,
          type: 'spike',
        },
      ];
    }

    if (ratio < 0.5) {
      return [
        {
          baselineAverage,
          metric: 'engagementRate',
          ratio,
          recentAverage,
          type: 'drop',
        },
      ];
    }

    return [];
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
