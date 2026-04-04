import {
  BrandMemory,
  type BrandMemoryDocument,
  type BrandMemoryInsight,
} from '@api/collections/brand-memory/schemas/brand-memory.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

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
    @InjectModel(BrandMemory.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<BrandMemoryDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  logEntry(
    organizationId: string,
    brandId: string,
    entry: BrandMemoryEntryInput,
  ): Promise<BrandMemoryDocument | null> {
    return this.model.findOneAndUpdate(
      this.buildDailyFilter(organizationId, brandId, new Date()),
      {
        $push: {
          entries: {
            content: entry.content,
            metadata: entry.metadata,
            timestamp: entry.timestamp ?? new Date(),
            type: entry.type,
          },
        },
        $setOnInsert: {
          brand: new Types.ObjectId(brandId),
          date: this.startOfDay(new Date()),
          organization: new Types.ObjectId(organizationId),
        },
      },
      { new: true, upsert: true },
    );
  }

  addInsight(
    organizationId: string,
    brandId: string,
    insight: BrandMemoryInsightInput,
  ): Promise<BrandMemoryDocument | null> {
    return this.model.findOneAndUpdate(
      this.buildDailyFilter(organizationId, brandId, new Date()),
      {
        $push: {
          insights: {
            category: insight.category,
            confidence: insight.confidence,
            createdAt: insight.createdAt ?? new Date(),
            insight: insight.insight,
            source: insight.source,
          },
        },
        $setOnInsert: {
          brand: new Types.ObjectId(brandId),
          date: this.startOfDay(new Date()),
          organization: new Types.ObjectId(organizationId),
        },
      },
      { new: true, upsert: true },
    );
  }

  updateMetrics(
    organizationId: string,
    brandId: string,
    metrics: BrandMemoryMetricsInput,
  ): Promise<BrandMemoryDocument | null> {
    return this.model.findOneAndUpdate(
      this.buildDailyFilter(organizationId, brandId, new Date()),
      {
        $set: {
          ...(metrics.avgEngagementRate !== undefined && {
            'metrics.avgEngagementRate': metrics.avgEngagementRate,
          }),
          ...(metrics.postsPublished !== undefined && {
            'metrics.postsPublished': metrics.postsPublished,
          }),
          ...(metrics.topPerformingFormat !== undefined && {
            'metrics.topPerformingFormat': metrics.topPerformingFormat,
          }),
          ...(metrics.topPerformingTime !== undefined && {
            'metrics.topPerformingTime': metrics.topPerformingTime,
          }),
          ...(metrics.totalEngagement !== undefined && {
            'metrics.totalEngagement': metrics.totalEngagement,
          }),
        },
        $setOnInsert: {
          brand: new Types.ObjectId(brandId),
          date: this.startOfDay(new Date()),
          organization: new Types.ObjectId(organizationId),
        },
      },
      { new: true, upsert: true },
    );
  }

  getMemory(
    organizationId: string,
    brandId: string,
    dateRange?: BrandMemoryDateRange,
  ): Promise<BrandMemoryDocument[]> {
    const filter: Record<string, unknown> = {
      brand: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (dateRange?.from || dateRange?.to) {
      filter.date = {
        ...(dateRange.from && { $gte: dateRange.from }),
        ...(dateRange.to && { $lte: dateRange.to }),
      };
    }

    return this.model.find(filter).sort({ date: -1 }).lean().exec();
  }

  async getInsights(
    organizationId: string,
    brandId: string,
    limit: number = 20,
  ): Promise<BrandMemoryInsight[]> {
    const rows = await this.model
      .find({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .sort({ date: -1 })
      .limit(Math.max(1, limit))
      .lean()
      .exec();

    const insights = rows.flatMap((row) => row.insights ?? []);

    return insights
      .sort((left, right) => {
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();
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

    const formatPipeline: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          date: { $gte: fromDate, $lte: now },
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        },
      },
      {
        $group: {
          _id: '$metrics.topPerformingFormat',
          avgEngagementRate: { $avg: '$metrics.avgEngagementRate' },
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          _id: { $nin: [null, ''] },
        },
      },
      { $sort: { avgEngagementRate: -1, count: -1 } },
      { $limit: 3 },
    ];

    const topFormats = await this.model.aggregate<{
      _id: string;
      avgEngagementRate: number;
      count: number;
    }>(formatPipeline);

    const distilledInsights: BrandMemoryInsight[] = topFormats.map(
      (format) => ({
        category: 'format',
        confidence: Math.min(1, 0.4 + format.count / 30),
        createdAt: now,
        insight: `${format._id} drives the strongest engagement (${format.avgEngagementRate.toFixed(2)}% avg over ${format.count} days).`,
        source: 'memory_distiller_30d',
      }),
    );

    for (const insight of distilledInsights) {
      await this.addInsight(organizationId, brandId, insight);
    }

    return distilledInsights;
  }

  private buildDailyFilter(
    organizationId: string,
    brandId: string,
    date: Date,
  ): Record<string, unknown> {
    return {
      brand: new Types.ObjectId(brandId),
      date: {
        $gte: this.startOfDay(date),
        $lt: this.endOfDay(date),
      },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
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
