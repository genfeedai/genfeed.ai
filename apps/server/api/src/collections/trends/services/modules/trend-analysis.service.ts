import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type {
  HistoricalTrendsOptions,
  TrendPatternAnalysis,
} from '@api/collections/trends/interfaces/trend.interfaces';
import {
  Trend,
  type TrendDocument,
} from '@api/collections/trends/schemas/trend.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class TrendAnalysisService {
  constructor(
    @InjectModel(Trend.name, DB_CONNECTIONS.CLOUD)
    private trendModel: Model<TrendDocument>,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Mark expired trends as historical instead of deleting them
   * This preserves data for AI analysis
   */
  async markExpiredTrendsAsHistorical(): Promise<number> {
    const result = await this.trendModel.updateMany(
      {
        expiresAt: { $lte: new Date() },
        isCurrent: true,
        isDeleted: false,
      },
      {
        $set: { isCurrent: false },
      },
    );

    this.loggerService.log(
      `Marked ${result.modifiedCount} trends as historical`,
      {
        operation: 'markExpiredTrendsAsHistorical',
        service: 'TrendAnalysisService',
      },
    );

    return result.modifiedCount;
  }

  /**
   * Refresh trends manually (mark old as historical)
   */
  async markCurrentTrendsAsHistorical(
    organizationId?: string,
    brandId?: string,
  ): Promise<void> {
    const query: Record<string, unknown> = {
      isCurrent: true,
      isDeleted: false,
    };

    if (organizationId) {
      query.organization = organizationId;
    } else {
      query.organization = null;
    }

    if (brandId) {
      query.brand = brandId;
    } else {
      query.brand = null;
    }

    // Mark existing current trends as historical (preserve for analysis)
    await this.trendModel.updateMany(query, { isCurrent: false });
  }

  /**
   * Get historical trends for AI analysis
   */
  async getHistoricalTrends(
    options: HistoricalTrendsOptions = {},
  ): Promise<TrendEntity[]> {
    const query: Record<string, unknown> = {
      isCurrent: false, // Historical trends only
      isDeleted: false,
    };

    if (options.platform) {
      query.platform = options.platform;
    }

    if (options.topic) {
      query.topic = { $options: 'i', $regex: options.topic };
    }

    if (options.organizationId) {
      query.organization = new Types.ObjectId(options.organizationId);
    } else {
      query.organization = null;
    }

    if (options.brandId) {
      query.brand = new Types.ObjectId(options.brandId);
    } else {
      query.brand = null;
    }

    if (options.startDate || options.endDate) {
      const createdAtFilter: Record<string, Date> = {};
      if (options.startDate) {
        createdAtFilter.$gte = options.startDate;
      }
      if (options.endDate) {
        createdAtFilter.$lte = options.endDate;
      }
      query.createdAt = createdAtFilter;
    }

    const docs = await this.trendModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit || 1000)
      .lean();
    return docs.map((doc) => new TrendEntity(doc));
  }

  /**
   * Analyze trend patterns using historical data
   * This enables AI-powered insights like growth prediction, correlations, etc.
   */
  async analyzeTrendPatterns(
    topic: string,
    platform: string,
    daysBack: number = 7,
  ): Promise<TrendPatternAnalysis> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const historicalTrends = await this.getHistoricalTrends({
      limit: 1000,
      platform,
      startDate,
      topic,
    });

    if (historicalTrends.length === 0) {
      return {
        averageMentions: 0,
        averageViralityScore: 0,
        growthRate: 0,
        platform,
        topic,
        trendDirection: 'stable',
      };
    }

    // Calculate averages
    const averageMentions =
      historicalTrends.reduce((sum, t) => sum + t.mentions, 0) /
      historicalTrends.length;
    const averageViralityScore =
      historicalTrends.reduce((sum, t) => sum + t.viralityScore, 0) /
      historicalTrends.length;

    // Find peak
    const peakTrend = historicalTrends.reduce((max, t) =>
      t.mentions > max.mentions ? t : max,
    );

    // Determine trend direction (compare recent vs older)
    const midpoint = Math.floor(historicalTrends.length / 2);
    const olderMentions =
      historicalTrends.slice(midpoint).reduce((sum, t) => sum + t.mentions, 0) /
      (historicalTrends.length - midpoint);
    const recentMentions =
      historicalTrends
        .slice(0, midpoint)
        .reduce((sum, t) => sum + t.mentions, 0) / midpoint;

    const growthRate =
      olderMentions > 0
        ? ((recentMentions - olderMentions) / olderMentions) * 100
        : 0;

    let trendDirection: 'rising' | 'falling' | 'stable';
    if (growthRate > 10) {
      trendDirection = 'rising';
    } else if (growthRate < -10) {
      trendDirection = 'falling';
    } else {
      trendDirection = 'stable';
    }

    return {
      averageMentions: Math.round(averageMentions),
      averageViralityScore: Math.round(averageViralityScore),
      growthRate: Math.round(growthRate * 100) / 100,
      peakDate: peakTrend?.createdAt as Date,
      peakMentions: peakTrend.mentions,
      platform,
      topic,
      trendDirection,
    };
  }
}
