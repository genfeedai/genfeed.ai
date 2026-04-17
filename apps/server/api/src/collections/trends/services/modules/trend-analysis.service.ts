import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type {
  HistoricalTrendsOptions,
  TrendPatternAnalysis,
} from '@api/collections/trends/interfaces/trend.interfaces';
import type { TrendDocument } from '@api/collections/trends/schemas/trend.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TrendAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Mark expired trends as historical instead of deleting them
   * This preserves data for AI analysis
   */
  async markExpiredTrendsAsHistorical(): Promise<number> {
    const result = await this.prisma.trend.updateMany({
      data: { isCurrent: false } as never,
      where: {
        expiresAt: { lte: new Date() },
        isCurrent: true,
        isDeleted: false,
      } as never,
    });

    this.loggerService.log(`Marked ${result.count} trends as historical`, {
      operation: 'markExpiredTrendsAsHistorical',
      service: 'TrendAnalysisService',
    });

    return result.count;
  }

  /**
   * Refresh trends manually (mark old as historical)
   */
  async markCurrentTrendsAsHistorical(
    organizationId?: string,
    brandId?: string,
  ): Promise<void> {
    const where: Record<string, unknown> = {
      isCurrent: true,
      isDeleted: false,
      organizationId: organizationId ?? null,
      brandId: brandId ?? null,
    };

    await this.prisma.trend.updateMany({
      data: { isCurrent: false } as never,
      where: where as never,
    });
  }

  /**
   * Get historical trends for AI analysis
   */
  async getHistoricalTrends(
    options: HistoricalTrendsOptions = {},
  ): Promise<TrendEntity[]> {
    const where: Record<string, unknown> = {
      isCurrent: false, // Historical trends only
      isDeleted: false,
    };

    if (options.platform) {
      where.platform = options.platform;
    }

    if (options.topic) {
      where.topic = { contains: options.topic, mode: 'insensitive' };
    }

    where.organizationId = options.organizationId ?? null;
    where.brandId = options.brandId ?? null;

    if (options.startDate || options.endDate) {
      const createdAtFilter: Record<string, Date> = {};
      if (options.startDate) {
        createdAtFilter.gte = options.startDate;
      }
      if (options.endDate) {
        createdAtFilter.lte = options.endDate;
      }
      where.createdAt = createdAtFilter;
    }

    const docs = await this.prisma.trend.findMany({
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 1000,
      where: where as never,
    });
    return docs.map(
      (doc) =>
        new TrendEntity({
          ...doc,
          ...(doc.data as Record<string, unknown>),
        } as unknown as TrendDocument),
    );
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
