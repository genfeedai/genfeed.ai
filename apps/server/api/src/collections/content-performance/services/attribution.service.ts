import {
  ContentPerformance,
  type ContentPerformanceDocument,
} from '@api/collections/content-performance/schemas/content-performance.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

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
    @InjectModel(ContentPerformance.name, DB_CONNECTIONS.CLOUD)
    private readonly model: AggregatePaginateModel<ContentPerformanceDocument>,
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
    const results = await this.model
      .aggregate([
        {
          $match: {
            generationId,
            isDeleted: false,
            organization: new Types.ObjectId(organizationId),
          },
        },
        {
          $group: {
            _id: '$generationId',
            avgEngagementRate: { $avg: '$engagementRate' },
            avgPerformanceScore: { $avg: '$performanceScore' },
            hookUsed: { $first: '$hookUsed' },
            promptUsed: { $first: '$promptUsed' },
            totalEngagements: {
              $sum: {
                $add: ['$likes', '$comments', '$shares', '$saves'],
              },
            },
            totalRecords: { $sum: 1 },
            totalViews: { $sum: '$views' },
            workflowExecutionId: { $first: '$workflowExecutionId' },
          },
        },
      ])
      .exec();

    if (!results.length) {
      return null;
    }

    const r = results[0];
    return {
      avgEngagementRate: r.avgEngagementRate,
      avgPerformanceScore: r.avgPerformanceScore,
      generationId: r._id,
      hookUsed: r.hookUsed,
      promptUsed: r.promptUsed,
      totalEngagements: r.totalEngagements,
      totalRecords: r.totalRecords,
      totalViews: r.totalViews,
      workflowExecutionId: r.workflowExecutionId?.toString(),
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
    const matchStage: Record<string, unknown> = {
      generationId: { $exists: true, $ne: null },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      matchStage.brand = new Types.ObjectId(brandId);
    }

    const results = await this.model
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$generationId',
            avgEngagementRate: { $avg: '$engagementRate' },
            avgPerformanceScore: { $avg: '$performanceScore' },
            hookUsed: { $first: '$hookUsed' },
            promptUsed: { $first: '$promptUsed' },
            totalEngagements: {
              $sum: { $add: ['$likes', '$comments', '$shares', '$saves'] },
            },
            totalRecords: { $sum: 1 },
            totalViews: { $sum: '$views' },
            workflowExecutionId: { $first: '$workflowExecutionId' },
          },
        },
        { $sort: { avgPerformanceScore: -1 } },
        { $limit: limit },
      ])
      .exec();

    return results.map((r) => ({
      avgEngagementRate: r.avgEngagementRate,
      avgPerformanceScore: r.avgPerformanceScore,
      generationId: r._id,
      hookUsed: r.hookUsed,
      promptUsed: r.promptUsed,
      totalEngagements: r.totalEngagements,
      totalRecords: r.totalRecords,
      totalViews: r.totalViews,
      workflowExecutionId: r.workflowExecutionId?.toString(),
    }));
  }
}
