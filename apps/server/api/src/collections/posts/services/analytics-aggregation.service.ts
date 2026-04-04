import {
  ViralHookPlatformMetricsEntity,
  ViralHookSummaryEntity,
} from '@api/collections/posts/entities/viral-hooks.entity';
import {
  PostAnalytics,
  type PostAnalyticsDocument,
} from '@api/collections/posts/schemas/post-analytics.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type {
  IAnalyticsMatchStage,
  IPlatformComparisonProjectedResult,
  ITimeSeriesGroupedByDateResult,
  ITimeSeriesProjectedResult,
  ITopContentProjectedResult,
  IViralHookAggResult,
  IViralHookPlatformAggResult,
} from '@genfeedai/interfaces';
import { AnalyticsMetric } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

type PostAnalyticsModel = AggregatePaginateModel<PostAnalyticsDocument>;

export interface Timeframe {
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
}

export interface OverviewMetrics {
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgEngagementRate: number;
  totalEngagement: number;
  viewsGrowth: number;
  engagementGrowth: number;
  activePlatforms: string[];
  bestPerformingPlatform: string;
}

export interface TimeSeriesDataPoint {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  totalEngagement: number;
}

export interface PlatformMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
}

export interface TimeSeriesDataPointWithPlatforms {
  date: string;
  instagram: PlatformMetrics;
  tiktok: PlatformMetrics;
  youtube: PlatformMetrics;
  facebook: PlatformMetrics;
  twitter: PlatformMetrics;
  linkedin: PlatformMetrics;
  reddit: PlatformMetrics;
  pinterest: PlatformMetrics;
  medium: PlatformMetrics;
}

export interface PlatformComparison {
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  postCount: number;
  avgViewsPerPost: number;
}

export interface TopContent {
  postId: string;
  ingredientId: string;
  title: string;
  description: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  publishDate: Date;
  url?: string;
}

export interface GrowthTrends {
  views: {
    current: number;
    previous: number;
    growth: number;
    growthPercentage: number;
  };
  engagement: {
    current: number;
    previous: number;
    growth: number;
    growthPercentage: number;
  };
  bestDay: {
    date: string;
    views: number;
  };
  trendingDirection: 'up' | 'down' | 'stable';
}

export interface EngagementBreakdown {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  total: number;
  likesPercentage: number;
  commentsPercentage: number;
  sharesPercentage: number;
  savesPercentage: number;
}

@Injectable()
export class AnalyticsAggregationService {
  constructor(
    @InjectModel(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS)
    private readonly postAnalyticsModel: PostAnalyticsModel,

    private readonly postsService: PostsService,
  ) {}

  /**
   * Parse date range with validation
   * Uses DateRangeUtil helper with default D-7 to D-1
   */
  private parseDateRange(
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Timeframe {
    return DateRangeUtil.parseDateRange(startDateInput, endDateInput);
  }

  /**
   * Get overview metrics aggregated across all posts
   */
  async getOverviewMetrics(
    organizationId: string,
    brandId?: string,
    startDate?: Date | string,
    endDate?: Date | string,
  ): Promise<OverviewMetrics> {
    const {
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      previousStartDate,
      previousEndDate,
    } = this.parseDateRange(startDate, endDate);

    const matchFilter: IAnalyticsMatchStage = {
      date: { $gte: parsedStartDate, $lte: parsedEndDate },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      matchFilter.brand = new Types.ObjectId(brandId);
    }

    const currentMetrics = await this.postAnalyticsModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          avgEngagementRate: { $avg: '$engagementRate' },
          platforms: { $addToSet: '$platform' },
          totalComments: { $sum: '$totalComments' },
          totalLikes: { $sum: '$totalLikes' },
          totalSaves: { $sum: '$totalSaves' },
          totalShares: { $sum: '$totalShares' },
          totalViews: { $sum: '$totalViews' },
        },
      },
    ]);

    const previousMatchFilter: IAnalyticsMatchStage = { ...matchFilter };
    previousMatchFilter.date = {
      $gte: previousStartDate,
      $lte: previousEndDate,
    };

    const previousMetrics = await this.postAnalyticsModel.aggregate([
      { $match: previousMatchFilter },
      {
        $group: {
          _id: null,
          totalEngagement: {
            $sum: { $add: ['$totalLikes', '$totalComments', '$totalShares'] },
          },
          totalViews: { $sum: '$totalViews' },
        },
      },
    ]);

    const postMatch: IAnalyticsMatchStage = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };
    if (brandId) {
      postMatch.brand = new Types.ObjectId(brandId);
    }

    const postCount = await this.postsService.count(
      postMatch as unknown as Record<string, unknown>,
    );

    const platformMetrics = await this.postAnalyticsModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$platform',
          totalViews: { $sum: '$totalViews' },
        },
      },
      { $sort: { totalViews: -1 } },
      { $limit: 1 },
    ]);

    const current = currentMetrics[0] || {
      avgEngagementRate: 0,
      platforms: [],
      totalComments: 0,
      totalLikes: 0,
      totalSaves: 0,
      totalShares: 0,
      totalViews: 0,
    };

    const previous = previousMetrics[0] || {
      totalEngagement: 0,
      totalViews: 0,
    };

    const totalEngagement =
      current.totalLikes + current.totalComments + current.totalShares;

    const viewsGrowth =
      previous.totalViews > 0
        ? ((current.totalViews - previous.totalViews) / previous.totalViews) *
          100
        : 0;

    const previousEngagement = previous.totalEngagement || 0;
    const engagementGrowth =
      previousEngagement > 0
        ? ((totalEngagement - previousEngagement) / previousEngagement) * 100
        : 0;

    return {
      activePlatforms: current.platforms || [],
      avgEngagementRate: current.avgEngagementRate || 0,
      bestPerformingPlatform: platformMetrics[0]?._id || 'N/A',
      engagementGrowth,
      totalComments: current.totalComments,
      totalEngagement,
      totalLikes: current.totalLikes,
      totalPosts: postCount,
      totalSaves: current.totalSaves,
      totalShares: current.totalShares,
      totalViews: current.totalViews,
      viewsGrowth,
    };
  }

  /**
   * Get time series data for charts
   */
  async getTimeSeriesData(
    organizationId: string,
    brandId: string | undefined,
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week' = 'day',
  ): Promise<TimeSeriesDataPoint[]> {
    const matchFilter: IAnalyticsMatchStage = {
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      matchFilter.brand = new Types.ObjectId(brandId);
    }

    const groupFormat = groupBy === 'week' ? '%Y-%W' : '%Y-%m-%d';

    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $group: {
          _id: {
            $dateToString: {
              date: '$date',
              format: groupFormat,
            },
          },
          comments: { $sum: '$totalComments' },
          engagementRate: { $avg: '$engagementRate' },
          likes: { $sum: '$totalLikes' },
          saves: { $sum: '$totalSaves' },
          shares: { $sum: '$totalShares' },
          views: { $sum: '$totalViews' },
        },
      },
      {
        $project: {
          comments: 1,
          date: '$_id',
          engagementRate: { $ifNull: ['$engagementRate', 0] },
          likes: 1,
          saves: 1,
          shares: 1,
          totalEngagement: { $add: ['$likes', '$comments', '$shares'] },
          views: 1,
        },
      },
      { $sort: { date: 1 } },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);

    return results.map((item: ITimeSeriesProjectedResult) => ({
      comments: item.comments,
      date: item.date,
      engagementRate: item.engagementRate,
      likes: item.likes,
      saves: item.saves,
      shares: item.shares,
      totalEngagement: item.totalEngagement,
      views: item.views,
    }));
  }

  /**
   * Generate date scaffolding for a date range
   */
  private generateDateScaffolding(
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week' = 'day',
  ): string[] {
    const dates: string[] = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    while (current <= endDate) {
      if (groupBy === 'day') {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      } else {
        // For week grouping, use ISO week format
        const year = current.getFullYear();
        const oneJan = new Date(year, 0, 1);
        const numberOfDays = Math.floor(
          (current.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000),
        );
        const week = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
        dates.push(`${year}-${String(week).padStart(2, '0')}`);
        current.setDate(current.getDate() + 7);
      }
    }

    return dates;
  }

  /**
   * Calculate growth percentage between current and previous values
   * Returns 100 if there's current value but no previous, 0 if both are 0
   */
  private calculateGrowthPercentage(current: number, previous: number): number {
    if (previous > 0) {
      return ((current - previous) / previous) * 100;
    }
    return current > 0 ? 100 : 0;
  }

  /**
   * Create empty platform metrics object
   */
  private createEmptyPlatformMetrics(): PlatformMetrics {
    return {
      comments: 0,
      engagementRate: 0,
      likes: 0,
      saves: 0,
      shares: 0,
      views: 0,
    };
  }

  /**
   * Get time series data with platform breakdown
   */
  async getTimeSeriesDataWithPlatforms(
    organizationId: string,
    brandId: string | undefined,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
    groupBy: 'day' | 'week' = 'day',
  ): Promise<TimeSeriesDataPointWithPlatforms[]> {
    const { startDate, endDate } = this.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const matchFilter: IAnalyticsMatchStage = {
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      matchFilter.brand = new Types.ObjectId(brandId);
    }

    const groupFormat = groupBy === 'week' ? '%Y-%W' : '%Y-%m-%d';

    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                date: '$date',
                format: groupFormat,
              },
            },
            platform: '$platform',
          },
          comments: { $sum: '$totalComments' },
          engagementRate: { $avg: '$engagementRate' },
          likes: { $sum: '$totalLikes' },
          saves: { $sum: '$totalSaves' },
          shares: { $sum: '$totalShares' },
          views: { $sum: '$totalViews' },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          platforms: {
            $push: {
              comments: '$comments',
              engagementRate: { $ifNull: ['$engagementRate', 0] },
              likes: '$likes',
              platform: '$_id.platform',
              saves: '$saves',
              shares: '$shares',
              views: '$views',
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);

    // Generate date scaffolding
    const allDates = this.generateDateScaffolding(startDate, endDate, groupBy);

    const dataMap = new Map<string, Map<string, PlatformMetrics>>();
    for (const item of results as ITimeSeriesGroupedByDateResult[]) {
      const platformsMap = new Map<string, PlatformMetrics>();
      for (const p of item.platforms) {
        platformsMap.set(p.platform, {
          comments: p.comments,
          engagementRate: p.engagementRate,
          likes: p.likes,
          saves: p.saves,
          shares: p.shares,
          views: p.views,
        });
      }
      dataMap.set(item._id, platformsMap);
    }

    // Build response with all dates and platforms
    return allDates.map((date) => {
      const platformData =
        dataMap.get(date) || new Map<string, PlatformMetrics>();

      return {
        date,
        facebook:
          platformData.get('facebook') || this.createEmptyPlatformMetrics(),
        instagram:
          platformData.get('instagram') || this.createEmptyPlatformMetrics(),
        linkedin:
          platformData.get('linkedin') || this.createEmptyPlatformMetrics(),
        medium: platformData.get('medium') || this.createEmptyPlatformMetrics(),
        pinterest:
          platformData.get('pinterest') || this.createEmptyPlatformMetrics(),
        reddit: platformData.get('reddit') || this.createEmptyPlatformMetrics(),
        tiktok: platformData.get('tiktok') || this.createEmptyPlatformMetrics(),
        twitter:
          platformData.get('twitter') || this.createEmptyPlatformMetrics(),
        youtube:
          platformData.get('youtube') || this.createEmptyPlatformMetrics(),
      };
    });
  }

  /**
   * Get platform comparison metrics
   */
  async getPlatformComparison(
    organizationId: string,
    brandId: string | undefined,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Promise<PlatformComparison[]> {
    const { startDate, endDate } = this.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const matchFilter: IAnalyticsMatchStage = {
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      matchFilter.brand = new Types.ObjectId(brandId);
    }

    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $group: {
          _id: '$platform',
          comments: { $sum: '$totalComments' },
          engagementRate: { $avg: '$engagementRate' },
          likes: { $sum: '$totalLikes' },
          posts: { $addToSet: '$post' },
          saves: { $sum: '$totalSaves' },
          shares: { $sum: '$totalShares' },
          views: { $sum: '$totalViews' },
        },
      },
      {
        $project: {
          comments: 1,
          engagementRate: { $ifNull: ['$engagementRate', 0] },
          likes: 1,
          platform: '$_id',
          postCount: { $size: '$posts' },
          saves: 1,
          shares: 1,
          views: 1,
        },
      },
      {
        $addFields: {
          avgViewsPerPost: {
            $cond: [
              { $gt: [{ $size: '$posts' }, 0] },
              { $divide: ['$views', { $size: '$posts' }] },
              0,
            ],
          },
        },
      },
      { $sort: { views: -1 } },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);

    return results.map((item: IPlatformComparisonProjectedResult) => ({
      avgViewsPerPost: item.avgViewsPerPost,
      comments: item.comments,
      engagementRate: item.engagementRate,
      likes: item.likes,
      platform: item.platform,
      postCount: item.postCount,
      saves: item.saves,
      shares: item.shares,
      views: item.views,
    }));
  }

  /**
   * Get top performing content
   */
  async getTopPerformingContent(
    organizationId: string,
    brandId: string | undefined,
    limit: number = 10,
    metric:
      | AnalyticsMetric.VIEWS
      | AnalyticsMetric.ENGAGEMENT = AnalyticsMetric.VIEWS,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Promise<TopContent[]> {
    const { startDate, endDate } = this.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const matchFilter: IAnalyticsMatchStage = {
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      matchFilter.brand = new Types.ObjectId(brandId);
    }

    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $group: {
          _id: '$post',
          comments: { $max: '$totalComments' },
          engagementRate: { $avg: '$engagementRate' },
          ingredientId: { $first: { $arrayElemAt: ['$ingredients', 0] } },
          likes: { $max: '$totalLikes' },
          platform: { $first: '$platform' },
          postId: { $first: '$post' },
          shares: { $max: '$totalShares' },
          views: { $max: '$totalViews' },
        },
      },
      {
        $addFields: {
          totalEngagement: { $add: ['$likes', '$comments', '$shares'] },
        },
      },
      {
        $sort:
          metric === AnalyticsMetric.ENGAGEMENT
            ? { totalEngagement: -1 }
            : { views: -1 },
      },
      { $limit: limit },
      {
        $lookup: {
          as: 'post',
          foreignField: '_id',
          from: 'posts',
          localField: 'postId',
        },
      },
      { $unwind: { path: '$post', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          comments: 1,
          description: '$post.description',
          engagementRate: { $ifNull: ['$engagementRate', 0] },
          ingredientId: { $toString: '$ingredientId' },
          likes: 1,
          platform: 1,
          postId: { $toString: '$_id' },
          publishDate: '$post.publicationDate',
          shares: 1,
          title: '$post.label',
          url: '$post.url',
          views: 1,
        },
      },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);

    return results.map((item: ITopContentProjectedResult) => ({
      comments: item.comments,
      description: item.description || '',
      engagementRate: item.engagementRate,
      ingredientId: item.ingredientId,
      likes: item.likes,
      platform: item.platform,
      postId: item.postId,
      publishDate: item.publishDate,
      shares: item.shares,
      title: item.title || 'Untitled',
      url: item.url,
      views: item.views,
    }));
  }

  /**
   * Get growth trends
   */
  async getGrowthTrends(
    organizationId: string,
    brandId: string | undefined,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Promise<GrowthTrends> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange(startDateInput, endDateInput);

    const matchFilter: IAnalyticsMatchStage = {
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      matchFilter.brand = new Types.ObjectId(brandId);
    }

    const previousMatchFilter: IAnalyticsMatchStage = { ...matchFilter };
    previousMatchFilter.date = {
      $gte: previousStartDate,
      $lte: previousEndDate,
    };

    // Current period
    const currentMetrics = await this.postAnalyticsModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalEngagement: {
            $sum: { $add: ['$totalLikes', '$totalComments', '$totalShares'] },
          },
          totalViews: { $sum: '$totalViews' },
        },
      },
    ]);

    // Previous period
    const previousMetrics = await this.postAnalyticsModel.aggregate([
      { $match: previousMatchFilter },
      {
        $group: {
          _id: null,
          totalEngagement: {
            $sum: { $add: ['$totalLikes', '$totalComments', '$totalShares'] },
          },
          totalViews: { $sum: '$totalViews' },
        },
      },
    ]);

    // Best day
    const bestDayResult = await this.postAnalyticsModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            $dateToString: { date: '$date', format: '%Y-%m-%d' },
          },
          views: { $sum: '$totalViews' },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 1 },
    ]);

    const current = currentMetrics[0] || { totalEngagement: 0, totalViews: 0 };
    const previous = previousMetrics[0] || {
      totalEngagement: 0,
      totalViews: 0,
    };

    const viewsGrowth = current.totalViews - previous.totalViews;
    const viewsGrowthPercentage =
      previous.totalViews > 0 ? (viewsGrowth / previous.totalViews) * 100 : 0;

    const engagementGrowth = current.totalEngagement - previous.totalEngagement;
    const engagementGrowthPercentage =
      previous.totalEngagement > 0
        ? (engagementGrowth / previous.totalEngagement) * 100
        : 0;

    const bestDay = bestDayResult[0] || { _id: 'N/A', views: 0 };

    // Determine trending direction
    let trendingDirection: 'up' | 'down' | 'stable' = 'stable';
    if (viewsGrowthPercentage > 5) {
      trendingDirection = 'up';
    } else if (viewsGrowthPercentage < -5) {
      trendingDirection = 'down';
    }

    return {
      bestDay: {
        date: bestDay._id,
        views: bestDay.views,
      },
      engagement: {
        current: current.totalEngagement,
        growth: engagementGrowth,
        growthPercentage: engagementGrowthPercentage,
        previous: previous.totalEngagement,
      },
      trendingDirection,
      views: {
        current: current.totalViews,
        growth: viewsGrowth,
        growthPercentage: viewsGrowthPercentage,
        previous: previous.totalViews,
      },
    };
  }

  /**
   * Get engagement breakdown
   */
  async getEngagementBreakdown(
    organizationId: string,
    brandId: string | undefined,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Promise<EngagementBreakdown> {
    const { startDate, endDate } = this.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const matchFilter: IAnalyticsMatchStage = {
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      matchFilter.brand = new Types.ObjectId(brandId);
    }

    const result = await this.postAnalyticsModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          comments: { $sum: '$totalComments' },
          likes: { $sum: '$totalLikes' },
          saves: { $sum: '$totalSaves' },
          shares: { $sum: '$totalShares' },
        },
      },
    ]);

    const data = result[0] || { comments: 0, likes: 0, saves: 0, shares: 0 };

    const total = data.likes + data.comments + data.shares + data.saves;

    return {
      comments: data.comments,
      commentsPercentage: total > 0 ? (data.comments / total) * 100 : 0,
      likes: data.likes,
      likesPercentage: total > 0 ? (data.likes / total) * 100 : 0,
      saves: data.saves,
      savesPercentage: total > 0 ? (data.saves / total) * 100 : 0,
      shares: data.shares,
      sharesPercentage: total > 0 ? (data.shares / total) * 100 : 0,
      total,
    };
  }

  async getViralHooksSummary(
    organizationId: string,
    brandId?: string,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Promise<ViralHookSummaryEntity> {
    const { startDate, endDate } = this.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const matchFilter: IAnalyticsMatchStage = {
      date: { $gte: startDate, $lte: endDate },
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      matchFilter.brand = new Types.ObjectId(brandId);
    }

    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $group: {
          _id: { platform: '$platform', post: '$post' },
          engagementRate: { $avg: '$engagementRate' },
          totalComments: { $max: '$totalComments' },
          totalLikes: { $max: '$totalLikes' },
          totalSaves: { $max: '$totalSaves' },
          totalShares: { $max: '$totalShares' },
          totalViews: { $max: '$totalViews' },
        },
      },
      {
        $group: {
          _id: '$_id.post',
          platforms: {
            $push: {
              comments: '$totalComments',
              engagementRate: '$engagementRate',
              likes: '$totalLikes',
              platform: '$_id.platform',
              saves: '$totalSaves',
              shares: '$totalShares',
              views: '$totalViews',
            },
          },
          totalViews: { $sum: '$totalViews' },
        },
      },
      { $sort: { totalViews: -1 } },
      { $limit: 25 },
      {
        $lookup: {
          as: 'post',
          foreignField: '_id',
          from: 'posts',
          localField: '_id',
        },
      },
      { $unwind: { path: '$post', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          platforms: 1,
          post: {
            createdAt: '$post.createdAt',
            description: '$post.description',
            label: '$post.label',
            publicationDate: '$post.publicationDate',
            url: '$post.url',
          },
          totalViews: 1,
        },
      },
    ];

    const aggregated = await this.postAnalyticsModel.aggregate(pipeline);

    const toIsoString = (value?: Date | string | null): string => {
      if (!value) {
        return new Date().toISOString();
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime())
        ? new Date().toISOString()
        : parsed.toISOString();
    };

    const videos = (aggregated as IViralHookAggResult[]).map((item) => {
      const platforms = (item.platforms ?? []).map(
        (platform: IViralHookPlatformAggResult) => {
          const views = platform.views ?? 0;
          const likes = platform.likes ?? 0;
          const comments = platform.comments ?? 0;
          const shares = platform.shares ?? 0;
          const saves = platform.saves ?? 0;
          const engagementRate = platform.engagementRate ?? 0;
          const viralScore = Math.min(
            100,
            Math.round(engagementRate * 5 + views / 1000),
          );

          return {
            avgWatchTime: 0,
            comments,
            completionRate: 0,
            engagementRate,
            likes,
            platform: (platform.platform ?? 'unknown').toLowerCase(),
            saves,
            shares,
            views,
            viralScore,
          };
        },
      );

      const publishDate =
        item.post?.publicationDate ?? item.post?.createdAt ?? new Date();

      return {
        analysisNotes: undefined,
        creator: 'Unknown Creator',
        duration: 0,
        hooks: [],
        id: item._id?.toString() ?? '',
        platforms,
        thumbnail: undefined,
        title: item.post?.label ?? item.post?.description ?? 'Untitled Video',
        totalTimeTracked: 0,
        uploadDate: toIsoString(publishDate),
      };
    });

    const totalVideos = videos.length;
    const totalTimeTracked = videos.reduce(
      (total, video) => total + (video.totalTimeTracked ?? 0),
      0,
    );

    const platformStats = new Map<
      string,
      { totalViews: number; totalViralScore: number; count: number }
    >();

    videos.forEach((video) => {
      video.platforms.forEach((platform: ViralHookPlatformMetricsEntity) => {
        const stats = platformStats.get(platform.platform) ?? {
          count: 0,
          totalViews: 0,
          totalViralScore: 0,
        };

        stats.totalViews += platform.views;
        stats.totalViralScore += platform.viralScore;
        stats.count += 1;

        platformStats.set(platform.platform, stats);
      });
    });

    const topPlatforms = Array.from(platformStats.entries())
      .map(([platform, stats]) => ({
        avgViralScore:
          stats.count > 0
            ? Number((stats.totalViralScore / stats.count).toFixed(1))
            : 0,
        platform,
        totalViews: stats.totalViews,
      }))
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 5);

    return new ViralHookSummaryEntity({
      analysis: {
        avgTimePerVideo:
          totalVideos > 0
            ? Math.round(totalTimeTracked / Math.max(totalVideos, 1))
            : 0,
        hookEffectiveness: [],
        topHooks: [],
        topPlatforms,
        totalTime: totalTimeTracked,
        totalVideos,
      },
      videos,
    });
  }

  /**
   * Get platform-level analytics (all posts for a specific platform)
   * Extends getOverviewMetrics with platform filtering
   */
  async getPlatformAnalytics(
    organizationId: string,
    platform: string,
    brandId?: string,
    startDate?: Date | string,
    endDate?: Date | string,
  ): Promise<OverviewMetrics> {
    const {
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      previousStartDate,
      previousEndDate,
    } = this.parseDateRange(startDate, endDate);

    const matchFilter: IAnalyticsMatchStage = {
      date: { $gte: parsedStartDate, $lte: parsedEndDate },
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      platform: platform,
    };

    if (brandId) {
      matchFilter.brand = new Types.ObjectId(brandId);
    }

    const currentMetrics = await this.postAnalyticsModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          avgEngagementRate: { $avg: '$engagementRate' },
          totalComments: { $sum: '$totalComments' },
          totalLikes: { $sum: '$totalLikes' },
          totalSaves: { $sum: '$totalSaves' },
          totalShares: { $sum: '$totalShares' },
          totalViews: { $sum: '$totalViews' },
        },
      },
    ]);

    const previousMatchFilter: IAnalyticsMatchStage = { ...matchFilter };
    previousMatchFilter.date = {
      $gte: previousStartDate,
      $lte: previousEndDate,
    };

    const previousMetrics = await this.postAnalyticsModel.aggregate([
      { $match: previousMatchFilter },
      {
        $group: {
          _id: null,
          totalEngagement: {
            $sum: { $add: ['$totalLikes', '$totalComments', '$totalShares'] },
          },
          totalViews: { $sum: '$totalViews' },
        },
      },
    ]);

    // Get publication count
    const postMatch: IAnalyticsMatchStage = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };
    if (brandId) {
      postMatch.brand = new Types.ObjectId(brandId);
    }

    // Count distinct posts for this platform
    const totalPosts = await this.postAnalyticsModel
      .distinct('post', {
        ...matchFilter,
      })
      .then((posts) => posts.length);

    const current = currentMetrics[0] || {
      avgEngagementRate: 0,
      totalComments: 0,
      totalLikes: 0,
      totalSaves: 0,
      totalShares: 0,
      totalViews: 0,
    };

    const previous = previousMetrics[0] || {
      totalEngagement: 0,
      totalViews: 0,
    };

    const currentEngagement =
      current.totalLikes + current.totalComments + current.totalShares;
    const previousEngagement = previous.totalEngagement || 0;

    return {
      activePlatforms: [platform],
      avgEngagementRate: current.avgEngagementRate || 0,
      bestPerformingPlatform: platform,
      engagementGrowth: this.calculateGrowthPercentage(
        currentEngagement,
        previousEngagement,
      ),
      totalComments: current.totalComments,
      totalEngagement: currentEngagement,
      totalLikes: current.totalLikes,
      totalPosts,
      totalSaves: current.totalSaves,
      totalShares: current.totalShares,
      totalViews: current.totalViews,
      viewsGrowth: this.calculateGrowthPercentage(
        current.totalViews,
        previous.totalViews,
      ),
    };
  }
}
