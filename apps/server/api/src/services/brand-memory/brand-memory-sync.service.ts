import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import {
  ContentPerformance,
  type ContentPerformanceDocument,
} from '@api/collections/content-performance/schemas/content-performance.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export interface PerformanceThresholdAlert {
  type: 'spike' | 'drop';
  metric: 'engagementRate';
  recentAverage: number;
  baselineAverage: number;
  ratio: number;
}

@Injectable()
export class BrandMemorySyncService {
  constructor(
    @InjectModel(ContentPerformance.name, DB_CONNECTIONS.CLOUD)
    private readonly contentPerformanceModel: AggregatePaginateModel<ContentPerformanceDocument>,
    private readonly brandMemoryService: BrandMemoryService,
    private readonly logger: LoggerService,
  ) {}

  async syncPostPerformance(
    organizationId: string,
    brandId: string,
    postId: string,
  ): Promise<void> {
    const performance = await this.contentPerformanceModel
      .findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        post: new Types.ObjectId(postId),
      })
      .sort({ measuredAt: -1 })
      .lean()
      .exec();

    if (!performance) {
      this.logger.warn('BrandMemorySyncService.syncPostPerformance no data', {
        brandId,
        organizationId,
        postId,
      });
      return;
    }

    const totalEngagement =
      (performance.likes ?? 0) +
      (performance.comments ?? 0) +
      (performance.shares ?? 0) +
      (performance.saves ?? 0) +
      (performance.clicks ?? 0);

    await this.brandMemoryService.logEntry(organizationId, brandId, {
      content: `Post ${postId} on ${performance.platform} reached ${totalEngagement} engagements with ${performance.engagementRate.toFixed(2)}% engagement rate.`,
      metadata: {
        contentType: performance.contentType,
        engagementRate: performance.engagementRate,
        measuredAt: performance.measuredAt,
        platform: performance.platform,
        postId,
      },
      timestamp: performance.measuredAt,
      type: 'post_performance',
    });

    await this.brandMemoryService.updateMetrics(organizationId, brandId, {
      avgEngagementRate: performance.engagementRate,
      postsPublished: 1,
      topPerformingFormat: performance.contentType,
      topPerformingTime: this.toHourLabel(performance.measuredAt),
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
      this.contentPerformanceModel
        .find({
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
          measuredAt: { $gte: recentStart, $lte: now },
          organization: new Types.ObjectId(organizationId),
        })
        .lean()
        .exec(),
      this.contentPerformanceModel
        .find({
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
          measuredAt: { $gte: baselineStart, $lt: baselineEnd },
          organization: new Types.ObjectId(organizationId),
        })
        .lean()
        .exec(),
    ]);

    const recentAverage = this.average(
      recent.map((item) => item.engagementRate),
    );
    const baselineAverage = this.average(
      baseline.map((item) => item.engagementRate),
    );

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
