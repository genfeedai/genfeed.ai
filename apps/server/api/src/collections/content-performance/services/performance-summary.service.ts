import {
  PostAnalytics,
  type PostAnalyticsDocument,
} from '@api/collections/posts/schemas/post-analytics.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

type PostAnalyticsModel = AggregatePaginateModel<PostAnalyticsDocument>;

export interface WeeklySummaryOptions {
  topN?: number;
  worstN?: number;
  startDate?: Date | string;
  endDate?: Date | string;
}

export interface PerformanceContentItem {
  postId: string;
  title: string;
  description: string;
  platform: string;
  engagementRate: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  publishDate?: Date;
}

export interface PlatformEngagement {
  platform: string;
  avgEngagementRate: number;
  totalPosts: number;
}

export interface ContentTypeEngagement {
  category: string;
  avgEngagementRate: number;
  totalPosts: number;
}

export interface PostingTimeAnalysis {
  hour: number;
  avgEngagementRate: number;
  postCount: number;
}

export interface PromptPerformanceItem {
  promptSnippet: string;
  avgEngagementRate: number;
  totalPosts: number;
  totalViews: number;
}

export interface WeeklySummary {
  topPerformers: PerformanceContentItem[];
  worstPerformers: PerformanceContentItem[];
  avgEngagementByPlatform: PlatformEngagement[];
  avgEngagementByContentType: ContentTypeEngagement[];
  bestPostingTimes: PostingTimeAnalysis[];
  topHooks: string[];
  weekOverWeekTrend: {
    direction: 'up' | 'down' | 'stable';
    percentageChange: number;
    currentEngagement: number;
    previousEngagement: number;
  };
}

@Injectable()
export class PerformanceSummaryService {
  constructor(
    @InjectModel(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS)
    private readonly postAnalyticsModel: PostAnalyticsModel,
  ) {}

  private parseDateRange(startDate?: Date | string, endDate?: Date | string) {
    return DateRangeUtil.parseDateRange(startDate, endDate);
  }

  private buildMatchFilter(
    organizationId: string,
    brandId: string,
    startDate: Date,
    endDate: Date,
  ): Record<string, unknown> {
    return {
      brand: new Types.ObjectId(brandId),
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };
  }

  /**
   * Get weekly performance summary with top/worst content, platform breakdown,
   * posting time analysis, and week-over-week trends.
   */
  async getWeeklySummary(
    organizationId: string,
    brandId: string,
    options: WeeklySummaryOptions = {},
  ): Promise<WeeklySummary> {
    const { topN = 5, worstN = 5 } = options;

    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange(options.startDate, options.endDate);

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      startDate,
      endDate,
    );

    const [
      topPerformers,
      worstPerformers,
      avgEngagementByPlatform,
      avgEngagementByContentType,
      bestPostingTimes,
      topHooks,
      weekOverWeekTrend,
    ] = await Promise.all([
      this.getContentByEngagement(matchFilter, topN, -1),
      this.getContentByEngagement(matchFilter, worstN, 1),
      this.getAvgEngagementByPlatform(matchFilter),
      this.getAvgEngagementByContentType(matchFilter),
      this.getBestPostingTimes(matchFilter),
      this.getTopHooks(matchFilter),
      this.getWeekOverWeekTrend(matchFilter, {
        ...matchFilter,
        date: { $gte: previousStartDate, $lte: previousEndDate },
      }),
    ]);

    return {
      avgEngagementByContentType,
      avgEngagementByPlatform,
      bestPostingTimes,
      topHooks,
      topPerformers,
      weekOverWeekTrend,
      worstPerformers,
    };
  }

  /**
   * Get top performing content ranked by engagement rate.
   */
  async getTopPerformers(
    organizationId: string,
    brandId: string,
    limit: number = 10,
    dateRange?: { startDate?: Date | string; endDate?: Date | string },
  ): Promise<PerformanceContentItem[]> {
    const { startDate, endDate } = this.parseDateRange(
      dateRange?.startDate,
      dateRange?.endDate,
    );

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      startDate,
      endDate,
    );

    return this.getContentByEngagement(matchFilter, limit, -1);
  }

  /**
   * Get prompt/description performance — which content descriptions produce the best results.
   */
  async getPromptPerformance(
    organizationId: string,
    brandId: string,
    startDate?: Date | string,
    endDate?: Date | string,
  ): Promise<PromptPerformanceItem[]> {
    const { startDate: parsedStart, endDate: parsedEnd } = this.parseDateRange(
      startDate,
      endDate,
    );

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      parsedStart,
      parsedEnd,
    );

    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $group: {
          _id: '$post',
          avgEngagementRate: { $avg: '$engagementRate' },
          totalViews: { $max: '$totalViews' },
        },
      },
      { $sort: { avgEngagementRate: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          as: 'postDoc',
          foreignField: '_id',
          from: 'posts',
          localField: '_id',
        },
      },
      { $unwind: { path: '$postDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          avgEngagementRate: 1,
          description: '$postDoc.description',
          label: '$postDoc.label',
          totalViews: 1,
        },
      },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);

    // Group by first 100 chars of description to find patterns
    const promptMap = new Map<
      string,
      { totalEngagement: number; totalViews: number; count: number }
    >();

    for (const item of results) {
      const desc = String(item.description || item.label || '').trim();
      if (!desc) {
        continue;
      }

      const snippet = desc.substring(0, 100);
      const existing = promptMap.get(snippet) || {
        count: 0,
        totalEngagement: 0,
        totalViews: 0,
      };

      existing.totalEngagement += Number(item.avgEngagementRate || 0);
      existing.totalViews += Number(item.totalViews || 0);
      existing.count += 1;
      promptMap.set(snippet, existing);
    }

    return Array.from(promptMap.entries())
      .map(([snippet, data]) => ({
        avgEngagementRate:
          data.count > 0 ? data.totalEngagement / data.count : 0,
        promptSnippet: snippet,
        totalPosts: data.count,
        totalViews: data.totalViews,
      }))
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
  }

  /**
   * Generate a text block of performance context for injection into AI generation prompts.
   */
  async generatePerformanceContext(
    organizationId: string,
    brandId: string,
  ): Promise<string> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange();

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      startDate,
      endDate,
    );

    const [topPerformers, platformEngagement, bestTimes, trend] =
      await Promise.all([
        this.getContentByEngagement(matchFilter, 3, -1),
        this.getAvgEngagementByPlatform(matchFilter),
        this.getBestPostingTimes(matchFilter),
        this.getWeekOverWeekTrend(matchFilter, {
          ...matchFilter,
          date: { $gte: previousStartDate, $lte: previousEndDate },
        }),
      ]);

    const lines: string[] = [];

    // Top hooks
    if (topPerformers.length > 0) {
      const hooks = topPerformers
        .map((p) => {
          const text = p.title || p.description || '';
          return text.substring(0, 80);
        })
        .filter(Boolean);

      if (hooks.length > 0) {
        lines.push(`Your top hooks last week: [${hooks.join(', ')}].`);
      }
    }

    // Best posting time
    if (bestTimes.length > 0) {
      const bestHour = bestTimes[0].hour;
      const period = bestHour >= 12 ? 'PM' : 'AM';
      const displayHour = bestHour > 12 ? bestHour - 12 : bestHour || 12;
      lines.push(`Best posting time: ${displayHour}${period}.`);
    }

    // Best platform
    if (platformEngagement.length > 0) {
      const best = platformEngagement.sort(
        (a, b) => b.avgEngagementRate - a.avgEngagementRate,
      )[0];
      lines.push(`Best platform: ${best.platform}.`);
    }

    // Trend
    const direction = trend.direction.toUpperCase();
    const pct = Math.abs(trend.percentageChange).toFixed(0);
    lines.push(`Engagement trending ${direction} ${pct}%.`);

    return lines.join(' ') || 'No performance data available yet.';
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private async getContentByEngagement(
    matchFilter: Record<string, unknown>,
    limit: number,
    sortDirection: 1 | -1,
  ): Promise<PerformanceContentItem[]> {
    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $group: {
          _id: '$post',
          avgEngagementRate: { $avg: '$engagementRate' },
          comments: { $max: '$totalComments' },
          likes: { $max: '$totalLikes' },
          platform: { $first: '$platform' },
          saves: { $max: '$totalSaves' },
          shares: { $max: '$totalShares' },
          views: { $max: '$totalViews' },
        },
      },
      { $sort: { avgEngagementRate: sortDirection } },
      { $limit: limit },
      {
        $lookup: {
          as: 'postDoc',
          foreignField: '_id',
          from: 'posts',
          localField: '_id',
        },
      },
      { $unwind: { path: '$postDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          avgEngagementRate: 1,
          comments: 1,
          description: '$postDoc.description',
          likes: 1,
          platform: 1,
          publishDate: '$postDoc.publicationDate',
          saves: 1,
          shares: 1,
          title: '$postDoc.label',
          views: 1,
        },
      },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);

    return results.map((item: Record<string, unknown>) => ({
      comments: Number(item.comments || 0),
      description: String(item.description || ''),
      engagementRate: Number(item.avgEngagementRate || 0),
      likes: Number(item.likes || 0),
      platform: String(item.platform || ''),
      postId: String(item._id),
      publishDate: item.publishDate as Date | undefined,
      saves: Number(item.saves || 0),
      shares: Number(item.shares || 0),
      title: String(item.title || ''),
      views: Number(item.views || 0),
    }));
  }

  private async getAvgEngagementByPlatform(
    matchFilter: Record<string, unknown>,
  ): Promise<PlatformEngagement[]> {
    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $group: {
          _id: '$platform',
          avgEngagementRate: { $avg: '$engagementRate' },
          posts: { $addToSet: '$post' },
        },
      },
      {
        $project: {
          avgEngagementRate: 1,
          platform: '$_id',
          totalPosts: { $size: '$posts' },
        },
      },
      { $sort: { avgEngagementRate: -1 } },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);

    return results.map((item: Record<string, unknown>) => ({
      avgEngagementRate: Number(item.avgEngagementRate || 0),
      platform: String(item.platform),
      totalPosts: Number(item.totalPosts || 0),
    }));
  }

  private async getAvgEngagementByContentType(
    matchFilter: Record<string, unknown>,
  ): Promise<ContentTypeEngagement[]> {
    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $lookup: {
          as: 'postDoc',
          foreignField: '_id',
          from: 'posts',
          localField: 'post',
        },
      },
      { $unwind: { path: '$postDoc', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$postDoc.category',
          avgEngagementRate: { $avg: '$engagementRate' },
          posts: { $addToSet: '$post' },
        },
      },
      {
        $project: {
          avgEngagementRate: 1,
          category: '$_id',
          totalPosts: { $size: '$posts' },
        },
      },
      { $sort: { avgEngagementRate: -1 } },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);

    return results.map((item: Record<string, unknown>) => ({
      avgEngagementRate: Number(item.avgEngagementRate || 0),
      category: String(item.category || 'unknown'),
      totalPosts: Number(item.totalPosts || 0),
    }));
  }

  private async getBestPostingTimes(
    matchFilter: Record<string, unknown>,
  ): Promise<PostingTimeAnalysis[]> {
    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $lookup: {
          as: 'postDoc',
          foreignField: '_id',
          from: 'posts',
          localField: 'post',
        },
      },
      { $unwind: { path: '$postDoc', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $hour: '$postDoc.publicationDate' },
          avgEngagementRate: { $avg: '$engagementRate' },
          postCount: { $sum: 1 },
        },
      },
      { $sort: { avgEngagementRate: -1 } },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);

    return results.map((item: Record<string, unknown>) => ({
      avgEngagementRate: Number(item.avgEngagementRate || 0),
      hour: Number(item._id ?? 0),
      postCount: Number(item.postCount || 0),
    }));
  }

  private async getTopHooks(
    matchFilter: Record<string, unknown>,
  ): Promise<string[]> {
    // Get top 5 performing posts and extract their first line as "hooks"
    const topContent = await this.getContentByEngagement(matchFilter, 5, -1);

    return topContent
      .map((item) => {
        const text = item.description || item.title || '';
        // Extract first line/sentence as the hook
        const firstLine = text.split(/[.\n]/)[0]?.trim();
        return firstLine || '';
      })
      .filter(Boolean);
  }

  private async getWeekOverWeekTrend(
    currentFilter: Record<string, unknown>,
    previousFilter: Record<string, unknown>,
  ): Promise<{
    direction: 'up' | 'down' | 'stable';
    percentageChange: number;
    currentEngagement: number;
    previousEngagement: number;
  }> {
    const aggregateEngagement = async (
      filter: Record<string, unknown>,
    ): Promise<number> => {
      const result = await this.postAnalyticsModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalEngagement: {
              $sum: {
                $add: ['$totalLikes', '$totalComments', '$totalShares'],
              },
            },
          },
        },
      ]);
      return result[0]?.totalEngagement || 0;
    };

    const [currentEngagement, previousEngagement] = await Promise.all([
      aggregateEngagement(currentFilter),
      aggregateEngagement(previousFilter),
    ]);

    let percentageChange = 0;
    if (previousEngagement > 0) {
      percentageChange =
        ((currentEngagement - previousEngagement) / previousEngagement) * 100;
    } else if (currentEngagement > 0) {
      percentageChange = 100;
    }

    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (percentageChange > 5) {
      direction = 'up';
    } else if (percentageChange < -5) {
      direction = 'down';
    }

    return {
      currentEngagement,
      direction,
      percentageChange,
      previousEngagement,
    };
  }
}
