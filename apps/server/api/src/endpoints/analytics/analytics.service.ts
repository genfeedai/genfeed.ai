import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import {
  PostAnalytics,
  type PostAnalyticsDocument,
} from '@api/collections/posts/schemas/post-analytics.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LeaderboardSort } from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import {
  BrandWithStatsEntity,
  OrgLeaderboardItemEntity,
  OrgWithStatsEntity,
  PaginatedBrandsResponse,
  PaginatedOrgsResponse,
} from '@api/endpoints/analytics/entities/organization-leaderboard.entity';
import {
  Analytic,
  type AnalyticDocument,
} from '@api/endpoints/analytics/schemas/analytic.schema';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import type {
  AggregatePaginateModel,
  AggregatePaginateResult,
} from '@api/types/mongoose-aggregate-paginate-v2';
import type {
  IAggregatedAnalyticsResult,
  IAggregatedEngagementResult,
  IEntityAnalyticsStats,
} from '@genfeedai/interfaces';
import {
  AnalyticsMetric,
  CredentialPlatform,
  PublishStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as ExcelJS from 'exceljs';
import { Model, type PipelineStage, Types } from 'mongoose';

interface ExportPostData {
  _id: Types.ObjectId;
  label: string;
  description?: string;
  status: string;
  scheduledDate?: Date;
  publicationDate?: Date;
  tags?: string[];
  views?: number;
  isRepeat?: boolean;
  repeatFrequency?: string;
  repeatInterval?: number;
  repeatCount?: number;
  maxRepeats?: number;
  createdAt: Date;
  updatedAt: Date;
  externalId?: string;
  credential: {
    platform: CredentialPlatform;
  };
  ingredient: {
    metadata: Types.ObjectId;
  };
  metadata?: {
    label?: string;
    description?: string;
    extension?: string;
    model?: string;
    style?: string;
  };
  organization: Types.ObjectId;
  brand: Types.ObjectId;
}

interface ProcessedExportData {
  id: string;
  title: string;
  description?: string;
  status: string;
  platform: CredentialPlatform;
  scheduledDate?: Date;
  publicationDate?: Date;
  views: number;
  likes: number;
  comments: number;
  tags: string;
  videoLabel: string;
  videoDescription: string;
  extension: string;
  model: string;
  style: string;
  isRepeat?: boolean;
  repeatFrequency: string;
  repeatInterval: number;
  repeatCount: number;
  maxRepeats: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ExportRowData {
  [key: string]: string | number | Date | boolean | undefined;
}

/** Organization document with aggregated fields from MongoDB */
interface OrganizationDoc {
  _id: Types.ObjectId;
  name?: string;
  label?: string;
  logo?: { cdnUrl?: string };
  isDeleted?: boolean;
}

/** Brand document with aggregated fields from MongoDB */
interface BrandDoc {
  _id: Types.ObjectId;
  name?: string;
  label?: string;
  logo?: { cdnUrl?: string };
  organization?: Types.ObjectId;
  org?: OrganizationDoc;
  isDeleted?: boolean;
  createdAt?: Date;
}

/** Stats for leaderboard sorting */
interface LeaderboardStats {
  id: string;
  name: string;
  logo?: string;
  avgEngagementRate: number;
  growth: number;
  totalEngagement: number;
  totalPosts: number;
  totalViews: number;
  activePlatforms?: string[];
  organizationId?: string;
  organizationName?: string;
}

/** Post count aggregation result */
interface PostCountResult {
  _id: Types.ObjectId;
  count: number;
}

/** Platform metrics for time series */
interface PlatformMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
}

export type AnalyticsBestPostingTime = {
  avgEngagementRate: number;
  hour: number;
  platform: string;
  postCount: number;
};

/** Default analytics stats for entities with no data */
const DEFAULT_ANALYTICS = {
  avgEngagementRate: 0,
  totalEngagement: 0,
  totalPosts: 0,
  totalViews: 0,
};

/** Default brand analytics stats including platforms */
const DEFAULT_BRAND_ANALYTICS = {
  ...DEFAULT_ANALYTICS,
  activePlatforms: [] as string[],
};

/** Map sort enum to field name */
const SORT_FIELD_MAP: Record<LeaderboardSort, string> = {
  [LeaderboardSort.VIEWS]: 'totalViews',
  [LeaderboardSort.POSTS]: 'totalPosts',
  [LeaderboardSort.ENGAGEMENT]: 'totalEngagement',
};

@Injectable()
export class AnalyticsService extends BaseService<AnalyticDocument> {
  constructor(
    @InjectModel(Analytic.name, DB_CONNECTIONS.ANALYTICS)
    protected readonly model: AggregatePaginateModel<AnalyticDocument>,
    @InjectModel(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS)
    private readonly postAnalyticsModel: Model<PostAnalyticsDocument>,
    private readonly postsService: PostsService,
    private readonly organizationsService: OrganizationsService,
    private readonly brandsService: BrandsService,
    private readonly youtubeService: YoutubeService,
    private readonly tiktokService: TiktokService,
    private readonly instagramService: InstagramService,
    private readonly pinterestService: PinterestService,
    private readonly twitterService: TwitterService,
    configService: ConfigService,
    logger: LoggerService,
  ) {
    super(model, logger, configService);
  }

  /**
   * Parse date range from optional startDate/endDate strings
   * Uses DateRangeUtil helper with default D-7 to D-1
   */
  private parseDateRange(
    startDateStr?: string,
    endDateStr?: string,
  ): {
    startDate: Date;
    endDate: Date;
    previousStartDate: Date;
    previousEndDate: Date;
  } {
    return DateRangeUtil.parseDateRange(startDateStr, endDateStr);
  }

  /**
   * Calculate growth percentage between current and previous values
   */
  private calculateGrowth(current: number, previous: number): number {
    if (previous > 0) {
      return Math.round(((current - previous) / previous) * 100 * 100) / 100;
    }
    return current > 0 ? 100 : 0;
  }

  /**
   * Get current period analytics grouped by entity ID
   */
  private async getCurrentAnalytics(
    entityIds: Types.ObjectId[],
    startDate: Date,
    endDate: Date,
    entityField: 'organization' | 'brand',
    includePlatforms = false,
  ): Promise<Map<string, IEntityAnalyticsStats>> {
    const groupFields: Record<string, unknown> = {
      _id: `$${entityField}`,
      avgEngagementRate: { $avg: '$engagementRate' },
      posts: { $addToSet: '$post' },
      totalComments: { $sum: '$totalComments' },
      totalLikes: { $sum: '$totalLikes' },
      totalSaves: { $sum: '$totalSaves' },
      totalShares: { $sum: '$totalShares' },
      totalViews: { $sum: '$totalViews' },
    };

    if (includePlatforms) {
      groupFields.platforms = { $addToSet: '$platform' };
    }

    const results =
      await this.postAnalyticsModel.aggregate<IAggregatedAnalyticsResult>([
        {
          $match: {
            [entityField]: { $in: entityIds },
            date: { $gte: startDate, $lte: endDate },
          },
        },
        // @ts-expect-error TS2769
        { $group: groupFields },
      ]);

    const analyticsMap = new Map<string, IEntityAnalyticsStats>();
    results.forEach((a: IAggregatedAnalyticsResult) => {
      const stats: IEntityAnalyticsStats = {
        avgEngagementRate: a.avgEngagementRate || 0,
        totalEngagement:
          a.totalLikes + a.totalComments + a.totalShares + a.totalSaves,
        totalPosts: a.posts.length,
        totalViews: a.totalViews,
      };
      if (includePlatforms) {
        stats.activePlatforms = a.platforms || [];
      }
      analyticsMap.set(a._id.toString(), stats);
    });

    return analyticsMap;
  }

  /**
   * Get previous period engagement totals grouped by entity ID
   */
  private async getPreviousEngagement(
    entityIds: Types.ObjectId[],
    startDate: Date,
    endDate: Date,
    entityField: 'organization' | 'brand',
  ): Promise<Map<string, number>> {
    const results = await this.postAnalyticsModel.aggregate([
      {
        $match: {
          [entityField]: { $in: entityIds },
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: `$${entityField}`,
          totalEngagement: {
            $sum: {
              $add: [
                '$totalLikes',
                '$totalComments',
                '$totalShares',
                '$totalSaves',
              ],
            },
          },
        },
      },
    ]);

    const engagementMap = new Map<string, number>();
    results.forEach((a: IAggregatedEngagementResult) => {
      engagementMap.set(a._id.toString(), a.totalEngagement);
    });

    return engagementMap;
  }

  /**
   * Get organization leaderboard - top performing orgs by engagement
   * Returns ALL orgs, sorted by metrics (includes orgs with 0 analytics)
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  async getOrganizationsLeaderboard(
    startDateStr?: string,
    endDateStr?: string,
    sort: LeaderboardSort = LeaderboardSort.ENGAGEMENT,
    limit: number = 10,
  ): Promise<OrgLeaderboardItemEntity[]> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange(startDateStr, endDateStr);

    const orgsResult = await this.organizationsService.findAll(
      [{ $match: { isDeleted: false } }],
      { pagination: false },
    );
    const allOrgs =
      (orgsResult as AggregatePaginateResult<OrganizationDoc>).docs || [];

    if (allOrgs.length === 0) {
      return [];
    }

    const orgIds = allOrgs.map((o: OrganizationDoc) => o._id);

    const [analyticsMap, previousEngagementMap] = await Promise.all([
      this.getCurrentAnalytics(orgIds, startDate, endDate, 'organization'),
      this.getPreviousEngagement(
        orgIds,
        previousStartDate,
        previousEndDate,
        'organization',
      ),
    ]);

    const sortField = SORT_FIELD_MAP[sort];

    let orgsWithStats: LeaderboardStats[] = allOrgs.map(
      (org: OrganizationDoc) => {
        const orgId = org._id.toString();
        const analytics = analyticsMap.get(orgId) || DEFAULT_ANALYTICS;
        const prevEngagement = previousEngagementMap.get(orgId) || 0;

        return {
          avgEngagementRate: analytics.avgEngagementRate,
          growth: this.calculateGrowth(
            analytics.totalEngagement,
            prevEngagement,
          ),
          id: orgId,
          logo: org.logo?.cdnUrl,
          name: org.label || org.name || 'Unknown',
          totalEngagement: analytics.totalEngagement,
          totalPosts: analytics.totalPosts,
          totalViews: analytics.totalViews,
        };
      },
    );

    orgsWithStats.sort(
      (a: LeaderboardStats, b: LeaderboardStats) =>
        (b[sortField as keyof LeaderboardStats] as number) -
        (a[sortField as keyof LeaderboardStats] as number),
    );
    orgsWithStats = orgsWithStats.slice(0, limit);

    return orgsWithStats.map((item: LeaderboardStats, index: number) => {
      return new OrgLeaderboardItemEntity({
        avgEngagementRate: item.avgEngagementRate,
        growth: item.growth,
        organization: {
          id: item.id,
          logo: item.logo,
          name: item.name,
        },
        rank: index + 1,
        totalEngagement: item.totalEngagement,
        totalPosts: item.totalPosts,
        totalViews: item.totalViews,
      });
    });
  }

  /**
   * Get brands leaderboard - top performing brands by engagement
   * Returns ALL brands, sorted by metrics (includes brands with 0 analytics)
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  async getBrandsLeaderboard(
    startDateStr?: string,
    endDateStr?: string,
    sort: LeaderboardSort = LeaderboardSort.ENGAGEMENT,
    limit: number = 10,
    organizationId?: string,
  ): Promise<BrandWithStatsEntity[]> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange(startDateStr, endDateStr);

    const brandsResult = await this.brandsService.findAll(
      [
        {
          $match: {
            isDeleted: false,
            ...(organizationId && {
              organization: new Types.ObjectId(organizationId),
            }),
          },
        },
        {
          $lookup: {
            as: 'org',
            foreignField: '_id',
            from: 'organizations',
            localField: 'organization',
          },
        },
        { $unwind: { path: '$org', preserveNullAndEmptyArrays: true } },
      ],
      { pagination: false },
    );
    const allBrands =
      (brandsResult as AggregatePaginateResult<BrandDoc>).docs || [];

    if (allBrands.length === 0) {
      return [];
    }

    const brandIds = allBrands.map((b: BrandDoc) => b._id);

    const [analyticsMap, previousEngagementMap] = await Promise.all([
      this.getCurrentAnalytics(brandIds, startDate, endDate, 'brand', true),
      this.getPreviousEngagement(
        brandIds,
        previousStartDate,
        previousEndDate,
        'brand',
      ),
    ]);

    const sortField = SORT_FIELD_MAP[sort];

    let brandsWithStats = allBrands.map((brand: BrandDoc) => {
      const brandId = brand._id.toString();
      const analytics = analyticsMap.get(brandId) || DEFAULT_BRAND_ANALYTICS;
      const prevEngagement = previousEngagementMap.get(brandId) || 0;

      return new BrandWithStatsEntity({
        activePlatforms: analytics.activePlatforms,
        avgEngagementRate: analytics.avgEngagementRate,
        // @ts-expect-error createdAt from document
        createdAt: brand.createdAt,
        growth: this.calculateGrowth(analytics.totalEngagement, prevEngagement),
        id: brandId,
        logo: brand.logo?.cdnUrl,
        name: brand.label || brand.name || 'Unknown',
        organizationId:
          brand.organization?.toString() || brand.org?._id?.toString(),
        organizationName: brand.org?.label || brand.org?.name || 'Unknown',
        totalEngagement: analytics.totalEngagement,
        totalPosts: analytics.totalPosts,
        totalViews: analytics.totalViews,
      });
    });

    brandsWithStats.sort((a, b) => {
      const aVal = a[sortField as keyof typeof a] as number;
      const bVal = b[sortField as keyof typeof b] as number;
      return bVal - aVal;
    });
    brandsWithStats = brandsWithStats.slice(0, limit);

    return brandsWithStats;
  }

  /**
   * Get all organizations with analytics stats (paginated)
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  async getOrganizationsWithStats(
    startDateStr?: string,
    endDateStr?: string,
    page: number = 1,
    limit: number = 20,
    sort: LeaderboardSort = LeaderboardSort.ENGAGEMENT,
  ): Promise<PaginatedOrgsResponse> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange(startDateStr, endDateStr);

    const orgsResult = await this.organizationsService.findAll(
      [{ $match: { isDeleted: false } }],
      { pagination: false },
    );
    const allOrgs =
      (orgsResult as AggregatePaginateResult<OrganizationDoc>).docs || [];

    let analyticsMap = new Map<string, IEntityAnalyticsStats>();
    let previousEngagementMap = new Map<string, number>();

    if (allOrgs.length > 0) {
      const orgIds = allOrgs.map((o: OrganizationDoc) => o._id);

      [analyticsMap, previousEngagementMap] = await Promise.all([
        this.getCurrentAnalytics(orgIds, startDate, endDate, 'organization'),
        this.getPreviousEngagement(
          orgIds,
          previousStartDate,
          previousEndDate,
          'organization',
        ),
      ]);
    }

    const brandCounts = await this.brandsService.findAll(
      [
        { $match: { isDeleted: false } },
        { $group: { _id: '$organization', count: { $sum: 1 } } },
      ],
      { pagination: false },
    );
    const brandCountMap = new Map<string, number>(
      (
        (brandCounts as unknown as AggregatePaginateResult<PostCountResult>)
          .docs || []
      ).map((b: PostCountResult) => [b._id.toString(), b.count]),
    );

    const orgsWithStats = allOrgs.map((org: OrganizationDoc) => {
      const orgId = org._id.toString();
      const analytics = analyticsMap.get(orgId) || DEFAULT_ANALYTICS;
      const prevEngagement = previousEngagementMap.get(orgId) || 0;

      return new OrgWithStatsEntity({
        avgEngagementRate: analytics.avgEngagementRate,
        // @ts-expect-error createdAt from document
        createdAt: org.createdAt,
        growth: this.calculateGrowth(analytics.totalEngagement, prevEngagement),
        id: orgId,
        logo: org.logo?.cdnUrl,
        name: org.label || org.name || 'Unknown',
        totalBrands: brandCountMap.get(orgId) || 0,
        totalEngagement: analytics.totalEngagement,
        totalMembers: 0,
        totalPosts: analytics.totalPosts,
        totalViews: analytics.totalViews,
      });
    });

    const sortField = SORT_FIELD_MAP[sort];
    orgsWithStats.sort((a, b) => {
      const aVal = a[sortField as keyof typeof a] as number;
      const bVal = b[sortField as keyof typeof b] as number;
      return bVal - aVal;
    });

    const total = orgsWithStats.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedOrgs = orgsWithStats.slice(startIndex, startIndex + limit);

    return new PaginatedOrgsResponse({
      data: paginatedOrgs,
      pagination: {
        limit,
        page,
        total,
        totalPages,
      },
    });
  }

  /**
   * Get all brands with analytics stats (paginated)
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  async getBrandsWithStats(
    startDateStr?: string,
    endDateStr?: string,
    page: number = 1,
    limit: number = 20,
    sort: LeaderboardSort = LeaderboardSort.ENGAGEMENT,
    organizationId?: string,
  ): Promise<PaginatedBrandsResponse> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange(startDateStr, endDateStr);

    const brandsResult = await this.brandsService.findAll(
      [
        {
          $match: {
            isDeleted: false,
            ...(organizationId && {
              organization: new Types.ObjectId(organizationId),
            }),
          },
        },
        {
          $lookup: {
            as: 'org',
            foreignField: '_id',
            from: 'organizations',
            localField: 'organization',
          },
        },
        { $unwind: { path: '$org', preserveNullAndEmptyArrays: true } },
      ],
      { pagination: false },
    );
    const allBrands =
      (brandsResult as AggregatePaginateResult<BrandDoc>).docs || [];

    let analyticsMap = new Map<string, IEntityAnalyticsStats>();
    let previousEngagementMap = new Map<string, number>();

    if (allBrands.length > 0) {
      const brandIds = allBrands.map((b: BrandDoc) => b._id);

      [analyticsMap, previousEngagementMap] = await Promise.all([
        this.getCurrentAnalytics(brandIds, startDate, endDate, 'brand', true),
        this.getPreviousEngagement(
          brandIds,
          previousStartDate,
          previousEndDate,
          'brand',
        ),
      ]);
    }

    const brandsWithStats = allBrands.map((brand: BrandDoc) => {
      const brandId = brand._id.toString();
      const analytics = analyticsMap.get(brandId) || DEFAULT_BRAND_ANALYTICS;
      const prevEngagement = previousEngagementMap.get(brandId) || 0;

      return new BrandWithStatsEntity({
        activePlatforms: analytics.activePlatforms,
        avgEngagementRate: analytics.avgEngagementRate,
        // @ts-expect-error createdAt from document
        createdAt: brand.createdAt,
        growth: this.calculateGrowth(analytics.totalEngagement, prevEngagement),
        id: brandId,
        logo: brand.logo?.cdnUrl,
        name: brand.label || brand.name || 'Unknown',
        organizationId:
          brand.organization?.toString() || brand.org?._id?.toString(),
        organizationName: brand.org?.label || brand.org?.name || 'Unknown',
        totalEngagement: analytics.totalEngagement,
        totalPosts: analytics.totalPosts,
        totalViews: analytics.totalViews,
      });
    });

    const sortField = SORT_FIELD_MAP[sort];
    brandsWithStats.sort((a, b) => {
      const aVal = a[sortField as keyof typeof a] as number;
      const bVal = b[sortField as keyof typeof b] as number;
      return bVal - aVal;
    });

    const total = brandsWithStats.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedBrands = brandsWithStats.slice(
      startIndex,
      startIndex + limit,
    );

    return new PaginatedBrandsResponse({
      data: paginatedBrands,
      pagination: {
        limit,
        page,
        total,
        totalPages,
      },
    });
  }

  // Inherit findAll from BaseService - no need to override

  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async exportData(
    format: 'csv' | 'xlsx',
    fields: string[],
    organizationId?: string,
  ): Promise<Buffer | string> {
    const data = await this.getExportData(organizationId);

    if (format === 'csv') {
      return this.generateCsv(data, fields);
    } else {
      return this.generateXlsx(data, fields);
    }
  }

  private async getExportData(
    organizationId?: string,
  ): Promise<ProcessedExportData[]> {
    // Build match stage with optional organization filter
    const matchStage: Record<string, unknown> = {
      status: PublishStatus.PUBLISHED,
    };
    if (organizationId) {
      matchStage.organization = new Types.ObjectId(organizationId);
    }

    const aggregate: PipelineStage[] = [
      { $match: matchStage },
      {
        $lookup: {
          as: 'ingredient',
          foreignField: '_id',
          from: 'ingredients',
          localField: 'ingredient',
        },
      },
      { $unwind: '$ingredient' },
      {
        $lookup: {
          as: 'metadata',
          foreignField: '_id',
          from: 'metadata',
          localField: 'ingredient.metadata',
        },
      },
      { $unwind: '$metadata' },
      {
        $lookup: {
          as: 'credential',
          foreignField: '_id',
          from: 'credentials',
          localField: 'credential',
        },
      },
      { $unwind: '$credential' },
    ];

    const result = await this.postsService.findAll(aggregate, {
      pagination: false,
    });
    // Use 'unknown' as intermediate type for complex type conversion
    const docs = (result as unknown as { docs?: ExportPostData[] }).docs || [];

    // Batch fetch analytics by platform to avoid N+1 queries
    const statsMap = await this.batchFetchAnalytics(docs);

    const processedData: ProcessedExportData[] = docs.map((pub) => {
      const platform = pub.credential.platform;
      const stats = statsMap.get(pub._id.toString()) || {
        comments: 0,
        likes: 0,
        views: pub.views || 0,
      };

      return {
        comments: stats.comments,
        createdAt: pub.createdAt,
        description: pub.description,
        extension: pub.metadata?.extension || '',
        id: pub._id.toString(),
        isRepeat: pub.isRepeat,
        likes: stats.likes,
        maxRepeats: pub.maxRepeats || 0,
        model: pub.metadata?.model || '',
        platform: platform,
        publicationDate: pub.publicationDate,
        repeatCount: pub.repeatCount || 0,
        repeatFrequency: pub.repeatFrequency || '',
        repeatInterval: pub.repeatInterval || 0,
        scheduledDate: pub.scheduledDate,
        status: pub.status,
        style: pub.metadata?.style || '',
        tags: pub.tags?.join(',') || '',
        title: pub.label,
        updatedAt: pub.updatedAt,
        videoDescription: pub.metadata?.description || '',
        videoLabel: pub.metadata?.label || '',
        views: stats.views,
      };
    });

    return processedData;
  }

  /**
   * Batch fetch analytics by platform to avoid N+1 queries
   * Groups posts by platform and fetches in parallel with concurrency limit
   */
  private async batchFetchAnalytics(
    docs: ExportPostData[],
  ): Promise<Map<string, { comments: number; likes: number; views: number }>> {
    const statsMap = new Map<
      string,
      { comments: number; likes: number; views: number }
    >();

    // Group posts by platform
    const postsByPlatform = new Map<CredentialPlatform, ExportPostData[]>();
    for (const doc of docs) {
      if (!doc.externalId) {
        continue;
      }
      const platform = doc.credential.platform;
      if (!postsByPlatform.has(platform)) {
        postsByPlatform.set(platform, []);
      }
      postsByPlatform.get(platform)?.push(doc);
    }

    // Fetch analytics for each platform in parallel
    const platformPromises = Array.from(postsByPlatform.entries()).map(
      async ([platform, posts]) => {
        // Process posts for this platform with concurrency limit
        const BATCH_SIZE = 10;
        for (let i = 0; i < posts.length; i += BATCH_SIZE) {
          const batch = posts.slice(i, i + BATCH_SIZE);
          const batchPromises = batch.map(async (post) => {
            try {
              const stats = await this.fetchPlatformStats(
                platform,
                post.organization.toString(),
                post.brand.toString(),
                post.externalId!,
              );
              statsMap.set(post._id.toString(), stats);
            } catch (error) {
              this.logger?.error('fetch stats failed', {
                error,
                externalId: post.externalId,
                platform,
              });
              statsMap.set(post._id.toString(), {
                comments: 0,
                likes: 0,
                views: post.views || 0,
              });
            }
          });
          await Promise.all(batchPromises);
        }
      },
    );

    await Promise.all(platformPromises);
    return statsMap;
  }

  /**
   * Fetch stats for a single post from the appropriate platform service
   */
  private fetchPlatformStats(
    platform: CredentialPlatform,
    organizationId: string,
    brandId: string,
    externalId: string,
  ): Promise<{ comments: number; likes: number; views: number }> {
    switch (platform) {
      case CredentialPlatform.YOUTUBE:
        return this.youtubeService.getMediaAnalytics(
          organizationId,
          brandId,
          externalId,
        );
      case CredentialPlatform.TIKTOK:
        return this.tiktokService.getMediaAnalytics(
          organizationId,
          brandId,
          externalId,
        );
      case CredentialPlatform.INSTAGRAM:
        return this.instagramService.getMediaAnalytics(
          organizationId,
          brandId,
          externalId,
        );
      case CredentialPlatform.TWITTER:
        return this.twitterService.getMediaAnalytics(externalId);
      case CredentialPlatform.PINTEREST:
        return this.pinterestService.getMediaAnalytics(
          organizationId,
          brandId,
          externalId,
        );
      default:
        // @ts-expect-error return shape
        return { comments: 0, likes: 0, views: 0 };
    }
  }

  private generateCsv(data: ProcessedExportData[], fields: string[]): string {
    if (data.length === 0) {
      return fields.join(',');
    }

    const headers = fields.join(',');
    const rows = data.map((item: ProcessedExportData) => {
      return fields
        .map((field) => {
          const value = item[field as keyof ProcessedExportData];
          if (value == null) {
            return '';
          }
          return this.escapeCsv(String(value));
        })
        .join(',');
    });

    return [headers, ...rows].join('\n');
  }

  private async generateXlsx(
    data: ProcessedExportData[],
    fields: string[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Export Data');

    // Add headers
    worksheet.columns = fields.map((field) => ({
      header: this.formatFieldName(field),
      key: field,
      width: 20,
    }));

    // Add data
    data.forEach((item) => {
      const row: ExportRowData = {};
      fields.forEach((field) => {
        row[field] = item[field as keyof ProcessedExportData];
      });
      worksheet.addRow(row);
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      fgColor: { argb: 'FFE0E0E0' },
      pattern: 'solid',
      type: 'pattern',
    };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private formatFieldName(field: string): string {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async exportVideoStatsCsv(): Promise<string> {
    const fields = ['videoLabel', 'views', 'comments', 'likes', 'platform'];
    return (await this.exportData('csv', fields)) as string;
  }

  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getTimeSeriesData(
    startDate: string,
    endDate: string,
    organizationId?: string,
  ): Promise<unknown[]> {
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999); // Include the entire end date (UTC)

    // Aggregate timeseries data across all organizations and platforms
    const pipeline: PipelineStage[] = [
      {
        $match: {
          date: { $gte: start, $lte: end },
          isDeleted: false,
          ...(organizationId && {
            organization: new Types.ObjectId(organizationId),
          }),
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                date: '$date',
                format: '%Y-%m-%d',
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
    const allDates = this.generateDateScaffolding(start, end);

    // Create a map of existing data
    interface TimeSeriesItem {
      _id: string;
      platforms: Array<{
        platform: string;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
        engagementRate: number;
      }>;
    }
    const dataMap = new Map<string, Map<string, PlatformMetrics>>();
    results.forEach((item: TimeSeriesItem) => {
      const platformsMap = new Map<string, PlatformMetrics>();
      item.platforms.forEach((p) => {
        platformsMap.set(p.platform, {
          comments: p.comments,
          engagementRate: p.engagementRate,
          likes: p.likes,
          saves: p.saves,
          shares: p.shares,
          views: p.views,
        });
      });
      dataMap.set(item._id, platformsMap);
    });

    // Build response with all dates and platforms
    return allDates.map((date) => {
      const platformData =
        dataMap.get(date) || new Map<string, PlatformMetrics>();

      return {
        date,
        facebook:
          platformData.get(CredentialPlatform.FACEBOOK) ||
          this.createEmptyPlatformMetrics(),
        instagram:
          platformData.get(CredentialPlatform.INSTAGRAM) ||
          this.createEmptyPlatformMetrics(),
        linkedin:
          platformData.get(CredentialPlatform.LINKEDIN) ||
          this.createEmptyPlatformMetrics(),
        medium:
          platformData.get(CredentialPlatform.MEDIUM) ||
          this.createEmptyPlatformMetrics(),
        pinterest:
          platformData.get(CredentialPlatform.PINTEREST) ||
          this.createEmptyPlatformMetrics(),
        reddit:
          platformData.get(CredentialPlatform.REDDIT) ||
          this.createEmptyPlatformMetrics(),
        tiktok:
          platformData.get(CredentialPlatform.TIKTOK) ||
          this.createEmptyPlatformMetrics(),
        twitter:
          platformData.get(CredentialPlatform.TWITTER) ||
          this.createEmptyPlatformMetrics(),
        youtube:
          platformData.get(CredentialPlatform.YOUTUBE) ||
          this.createEmptyPlatformMetrics(),
      };
    });
  }

  private generateDateScaffolding(startDate: Date, endDate: Date): string[] {
    const dates: string[] = [];
    const current = new Date(startDate);
    current.setUTCHours(0, 0, 0, 0);

    while (current <= endDate) {
      dates.push(current.toISOString().split('T')[0]);
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

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

  private escapeCsv(value: string): string {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Get high-level overview analytics
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getOverview(
    startDateStr?: string,
    endDateStr?: string,
    brandId?: string,
    organizationId?: string,
  ): Promise<unknown> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange(startDateStr, endDateStr);

    // Build match stage with optional brand filter
    const matchStage = {
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
      ...(brandId && { brand: new Types.ObjectId(brandId) }),
      ...(organizationId && {
        organization: new Types.ObjectId(organizationId),
      }),
    };

    const previousMatchStage = {
      date: { $gte: previousStartDate, $lte: previousEndDate },
      isDeleted: false,
      ...(brandId && { brand: new Types.ObjectId(brandId) }),
      ...(organizationId && {
        organization: new Types.ObjectId(organizationId),
      }),
    };

    // Current period metrics
    const currentMetrics = await this.postAnalyticsModel.aggregate([
      PipelineBuilder.buildMatch(matchStage),
      {
        $group: {
          _id: null,
          avgEngagementRate: { $avg: '$engagementRate' },
          totalComments: { $sum: '$totalComments' },
          totalLikes: { $sum: '$totalLikes' },
          totalPosts: { $sum: 1 },
          totalSaves: { $sum: '$totalSaves' },
          totalShares: { $sum: '$totalShares' },
          totalViews: { $sum: '$totalViews' },
        },
      },
    ]);

    // Previous period metrics for growth calculation
    const previousMetrics = await this.postAnalyticsModel.aggregate([
      PipelineBuilder.buildMatch(previousMatchStage),
      {
        $group: {
          _id: null,
          totalEngagement: {
            $sum: {
              $add: [
                '$totalLikes',
                '$totalComments',
                '$totalShares',
                '$totalSaves',
              ],
            },
          },
          totalPosts: { $sum: 1 },
          totalViews: { $sum: '$totalViews' },
        },
      },
    ]);

    const current = currentMetrics[0] || {
      avgEngagementRate: 0,
      totalComments: 0,
      totalLikes: 0,
      totalPosts: 0,
      totalSaves: 0,
      totalShares: 0,
      totalViews: 0,
    };

    const previous = previousMetrics[0] || {
      totalEngagement: 0,
      totalPosts: 0,
      totalViews: 0,
    };

    const totalEngagement =
      current.totalLikes +
      current.totalComments +
      current.totalShares +
      current.totalSaves;

    // Calculate growth percentages
    const postsGrowth =
      previous.totalPosts > 0
        ? ((current.totalPosts - previous.totalPosts) / previous.totalPosts) *
          100
        : 0;

    const viewsGrowth =
      previous.totalViews > 0
        ? ((current.totalViews - previous.totalViews) / previous.totalViews) *
          100
        : 0;

    const engagementGrowth =
      previous.totalEngagement > 0
        ? ((totalEngagement - previous.totalEngagement) /
            previous.totalEngagement) *
          100
        : 0;

    // Count organizations and brands
    const orgCount = await this.organizationsService.count({
      isDeleted: false,
      ...(organizationId && { _id: new Types.ObjectId(organizationId) }),
    });
    const brandCount = await this.brandsService.count({
      isDeleted: false,
      ...(organizationId && {
        organization: new Types.ObjectId(organizationId),
      }),
    });

    return {
      avgEngagementRate: current.avgEngagementRate || 0,
      brandCount,
      growth: {
        engagement: engagementGrowth,
        posts: postsGrowth,
        views: viewsGrowth,
      },
      organizationCount: orgCount,
      totalEngagement,
      totalPosts: current.totalPosts,
      totalViews: current.totalViews,
    };
  }

  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getBestPostingTimes(
    startDateStr?: string,
    endDateStr?: string,
    brandId?: string,
    organizationId?: string,
  ): Promise<AnalyticsBestPostingTime[]> {
    const { startDate, endDate } = this.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const matchStage = {
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
      ...(brandId && { brand: new Types.ObjectId(brandId) }),
      ...(organizationId && {
        organization: new Types.ObjectId(organizationId),
      }),
    };

    const results =
      await this.postAnalyticsModel.aggregate<AnalyticsBestPostingTime>([
        PipelineBuilder.buildMatch(matchStage),
        {
          $group: {
            _id: {
              hour: { $hour: '$date' },
              platform: '$platform',
            },
            avgEngagementRate: { $avg: '$engagementRate' },
            postCount: { $sum: 1 },
          },
        },
        {
          $sort: {
            avgEngagementRate: -1,
            postCount: -1,
          },
        },
        {
          $group: {
            _id: '$_id.platform',
            avgEngagementRate: { $first: '$avgEngagementRate' },
            hour: { $first: '$_id.hour' },
            postCount: { $first: '$postCount' },
          },
        },
        {
          $project: {
            _id: 0,
            avgEngagementRate: 1,
            hour: 1,
            platform: '$_id',
            postCount: 1,
          },
        },
        { $sort: { platform: 1 } },
      ]);

    return results.map((result) => ({
      avgEngagementRate: Number((result.avgEngagementRate || 0).toFixed(2)),
      hour: result.hour,
      platform: result.platform,
      postCount: result.postCount,
    }));
  }

  /**
   * Get top performing content
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getTopContent(
    startDateStr?: string,
    endDateStr?: string,
    limit = 10,
    metric:
      | AnalyticsMetric.VIEWS
      | AnalyticsMetric.ENGAGEMENT
      | AnalyticsMetric.LIKES = AnalyticsMetric.VIEWS,
    brandId?: string,
    platform?: CredentialPlatform,
    organizationId?: string,
  ): Promise<unknown[]> {
    // Enforce maximum limit to prevent excessive data fetching
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const { startDate, endDate } = this.parseDateRange(
      startDateStr,
      endDateStr,
    );

    // Determine sort field based on metric
    let sortField: Record<string, 1 | -1>;
    switch (metric) {
      case AnalyticsMetric.ENGAGEMENT:
        sortField = {
          totalEngagement: -1,
        };
        break;
      case AnalyticsMetric.LIKES:
        sortField = { totalLikes: -1 };
        break;
      default:
        sortField = { totalViews: -1 };
    }

    const pipeline: PipelineStage[] = [
      PipelineBuilder.buildMatch({
        date: { $gte: startDate, $lte: endDate },
        isDeleted: false,
        ...(brandId && { brand: new Types.ObjectId(brandId) }),
        ...(platform && { platform }),
        ...(organizationId && {
          organization: new Types.ObjectId(organizationId),
        }),
      }),
      {
        $addFields: {
          totalEngagement: {
            $add: [
              '$totalLikes',
              '$totalComments',
              '$totalShares',
              '$totalSaves',
            ],
          },
        },
      },
      { $sort: sortField },
      { $limit: safeLimit },
      {
        $lookup: {
          as: 'postData',
          foreignField: '_id',
          from: 'posts',
          localField: 'post',
        },
      },
      { $unwind: { path: '$postData', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'brandData',
          foreignField: '_id',
          from: 'brands',
          localField: 'brand',
        },
      },
      { $unwind: { path: '$brandData', preserveNullAndEmptyArrays: true } },
      // Lookup ingredients for thumbnail/media display
      {
        $lookup: {
          as: 'ingredientData',
          foreignField: '_id',
          from: 'ingredients',
          localField: 'postData.ingredients',
        },
      },
      {
        $project: {
          _id: 1,
          brandLogo: '$brandData.logo',
          brandName: '$brandData.name',
          date: 1,
          description: '$postData.description',
          engagementRate: 1,
          ingredientUrl: { $arrayElemAt: ['$ingredientData.ingredientUrl', 0] },
          isVideo: {
            $eq: [{ $arrayElemAt: ['$ingredientData.category', 0] }, 'VIDEO'],
          },
          label: '$postData.label',
          platform: 1,
          postId: '$post',
          // First ingredient's thumbnail and URL for display
          thumbnailUrl: { $arrayElemAt: ['$ingredientData.thumbnailUrl', 0] },
          totalComments: 1,
          totalEngagement: 1,
          totalLikes: 1,
          totalSaves: 1,
          totalShares: 1,
          totalViews: 1,
        },
      },
    ];

    return await this.postAnalyticsModel.aggregate(pipeline);
  }

  /**
   * Get platform comparison data
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getPlatformComparison(
    startDateStr?: string,
    endDateStr?: string,
    brandId?: string,
  ): Promise<unknown> {
    const { startDate, endDate } = this.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const pipeline: PipelineStage[] = [
      PipelineBuilder.buildMatch({
        date: { $gte: startDate, $lte: endDate },
        isDeleted: false,
        ...(brandId && { brand: new Types.ObjectId(brandId) }),
      }),
      {
        $group: {
          _id: '$platform',
          avgEngagementRate: { $avg: '$engagementRate' },
          totalComments: { $sum: '$totalComments' },
          totalLikes: { $sum: '$totalLikes' },
          totalPosts: { $sum: 1 },
          totalSaves: { $sum: '$totalSaves' },
          totalShares: { $sum: '$totalShares' },
          totalViews: { $sum: '$totalViews' },
        },
      },
      {
        $addFields: {
          totalEngagement: {
            $add: [
              '$totalLikes',
              '$totalComments',
              '$totalShares',
              '$totalSaves',
            ],
          },
        },
      },
      { $sort: { totalViews: -1 } },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);

    // Calculate totals for percentage calculation
    const totals = results.reduce(
      (acc, platform) => {
        acc.views += platform.totalViews;
        acc.engagement += platform.totalEngagement;
        acc.posts += platform.totalPosts;
        return acc;
      },
      { engagement: 0, posts: 0, views: 0 },
    );

    // Add percentages to each platform
    return results.map((platform) => ({
      avgEngagementRate: platform.avgEngagementRate || 0,
      engagementPercentage:
        totals.engagement > 0
          ? (platform.totalEngagement / totals.engagement) * 100
          : 0,
      platform: platform._id,
      postsPercentage:
        totals.posts > 0 ? (platform.totalPosts / totals.posts) * 100 : 0,
      totalEngagement: platform.totalEngagement,
      totalPosts: platform.totalPosts,
      totalViews: platform.totalViews,
      viewsPercentage:
        totals.views > 0 ? (platform.totalViews / totals.views) * 100 : 0,
    }));
  }

  /**
   * Get growth trends over time
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getGrowthTrends(
    startDateStr?: string,
    endDateStr?: string,
    metric:
      | AnalyticsMetric.VIEWS
      | AnalyticsMetric.ENGAGEMENT
      | AnalyticsMetric.POSTS = AnalyticsMetric.VIEWS,
    brandId?: string,
  ): Promise<unknown> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange(startDateStr, endDateStr);

    // Build match stages with optional brand filter
    interface MatchStage {
      date: { $gte: Date; $lte: Date };
      isDeleted: boolean;
      brand?: Types.ObjectId;
    }
    const currentMatchStage: MatchStage = {
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
    };

    const previousMatchStage: MatchStage = {
      date: { $gte: previousStartDate, $lte: previousEndDate },
      isDeleted: false,
    };

    if (brandId) {
      currentMatchStage.brand = new Types.ObjectId(brandId);
      previousMatchStage.brand = new Types.ObjectId(brandId);
    }

    // Current period aggregation
    const currentPipeline: PipelineStage[] = [
      {
        $match: currentMatchStage,
      },
      {
        $group: {
          _id: {
            $dateToString: { date: '$date', format: '%Y-%m-%d' },
          },
          comments: { $sum: '$totalComments' },
          likes: { $sum: '$totalLikes' },
          posts: { $sum: 1 },
          saves: { $sum: '$totalSaves' },
          shares: { $sum: '$totalShares' },
          views: { $sum: '$totalViews' },
        },
      },
      {
        $addFields: {
          engagement: {
            $add: ['$likes', '$comments', '$shares', '$saves'],
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    // Previous period aggregation
    const previousPipeline: PipelineStage[] = [
      {
        $match: previousMatchStage,
      },
      {
        $group: {
          _id: null,
          totalComments: { $sum: '$totalComments' },
          totalLikes: { $sum: '$totalLikes' },
          totalPosts: { $sum: 1 },
          totalSaves: { $sum: '$totalSaves' },
          totalShares: { $sum: '$totalShares' },
          totalViews: { $sum: '$totalViews' },
        },
      },
    ];

    const [currentResults, previousResults] = await Promise.all([
      this.postAnalyticsModel.aggregate(currentPipeline),
      this.postAnalyticsModel.aggregate(previousPipeline),
    ]);

    const previous = previousResults[0] || {
      totalComments: 0,
      totalLikes: 0,
      totalPosts: 0,
      totalSaves: 0,
      totalShares: 0,
      totalViews: 0,
    };

    const previousEngagement =
      previous.totalLikes +
      previous.totalComments +
      previous.totalShares +
      previous.totalSaves;

    // Calculate growth for each day
    const trends = currentResults.map((day) => {
      let growth = 0;
      let previousValue = 0;
      let currentValue = 0;

      switch (metric) {
        case AnalyticsMetric.ENGAGEMENT:
          previousValue = previousEngagement;
          currentValue = day.engagement;
          break;
        case AnalyticsMetric.POSTS:
          previousValue = previous.totalPosts;
          currentValue = day.posts;
          break;
        default:
          previousValue = previous.totalViews;
          currentValue = day.views;
      }

      if (previousValue > 0) {
        growth = ((currentValue - previousValue) / previousValue) * 100;
      }

      return {
        date: day._id,
        growth,
        trend: growth > 0 ? 'up' : growth < 0 ? 'down' : 'stable',
        value: currentValue,
      };
    });

    return {
      data: trends,
      endDate: endDate.toISOString().split('T')[0],
      metric,
      startDate: startDate.toISOString().split('T')[0],
    };
  }

  /**
   * Get engagement breakdown by type
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getEngagementBreakdown(
    startDateStr?: string,
    endDateStr?: string,
    brandId?: string,
    platform?: CredentialPlatform,
  ): Promise<unknown> {
    const { startDate, endDate } = this.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const pipeline: PipelineStage[] = [
      PipelineBuilder.buildMatch({
        date: { $gte: startDate, $lte: endDate },
        isDeleted: false,
        ...(brandId && { brand: new Types.ObjectId(brandId) }),
        ...(platform && { platform }),
      }),
      {
        $group: {
          _id: null,
          totalComments: { $sum: '$totalComments' },
          totalLikes: { $sum: '$totalLikes' },
          totalSaves: { $sum: '$totalSaves' },
          totalShares: { $sum: '$totalShares' },
        },
      },
    ];

    const results = await this.postAnalyticsModel.aggregate(pipeline);
    const data = results[0] || {
      totalComments: 0,
      totalLikes: 0,
      totalSaves: 0,
      totalShares: 0,
    };

    const total =
      data.totalLikes + data.totalComments + data.totalShares + data.totalSaves;

    return {
      comments: data.totalComments,
      likes: data.totalLikes,
      percentages: {
        comments: total > 0 ? (data.totalComments / total) * 100 : 0,
        likes: total > 0 ? (data.totalLikes / total) * 100 : 0,
        saves: total > 0 ? (data.totalSaves / total) * 100 : 0,
        shares: total > 0 ? (data.totalShares / total) * 100 : 0,
      },
      saves: data.totalSaves,
      shares: data.totalShares,
      total,
    };
  }

  /**
   * Get viral hooks analysis.
   * Extracts hook text (first sentence of description) from top-performing posts,
   * groups by hook pattern, and ranks by average engagement.
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getViralHooks(
    startDateStr?: string,
    endDateStr?: string,
    brandId?: string,
    organizationId?: string,
  ): Promise<{
    analysis: {
      hookEffectiveness: Array<{
        hook: string;
        avgEngagement: number;
        avgViews: number;
        postCount: number;
      }>;
      topHooks: Array<{
        hook: string;
        avgEngagement: number;
        postCount: number;
      }>;
      topPlatforms: Array<{
        platform: string;
        postCount: number;
        totalEngagement: number;
        totalViews: number;
      }>;
      totalVideos: number;
    };
    videos: Array<{
      description: string;
      hook: string;
      id: string;
      platforms: string[];
      title: string;
      totalEngagement: number;
      totalViews: number;
    }>;
  }> {
    const { startDate, endDate } = this.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const matchStage = {
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false,
      ...(brandId && { brand: new Types.ObjectId(brandId) }),
      ...(organizationId && {
        organization: new Types.ObjectId(organizationId),
      }),
    };

    // Get top performing videos with post description data
    const videoPipeline: PipelineStage[] = [
      PipelineBuilder.buildMatch(matchStage),
      {
        $group: {
          _id: '$post',
          platforms: { $addToSet: '$platform' },
          totalEngagement: {
            $sum: {
              $add: [
                '$totalLikes',
                '$totalComments',
                '$totalShares',
                '$totalSaves',
              ],
            },
          },
          totalViews: { $sum: '$totalViews' },
        },
      },
      { $sort: { totalEngagement: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          as: 'postData',
          foreignField: '_id',
          from: 'posts',
          localField: '_id',
        },
      },
      { $unwind: { path: '$postData', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          description: '$postData.description',
          platforms: 1,
          title: '$postData.label',
          totalEngagement: 1,
          totalViews: 1,
        },
      },
    ];

    const videos = await this.postAnalyticsModel.aggregate(videoPipeline);

    // Platform aggregation
    const platformPipeline: PipelineStage[] = [
      PipelineBuilder.buildMatch(matchStage),
      {
        $group: {
          _id: '$platform',
          postCount: { $sum: 1 },
          totalEngagement: {
            $sum: {
              $add: [
                '$totalLikes',
                '$totalComments',
                '$totalShares',
                '$totalSaves',
              ],
            },
          },
          totalViews: { $sum: '$totalViews' },
        },
      },
      { $sort: { totalEngagement: -1 } },
      { $limit: 5 },
    ];

    const topPlatforms =
      await this.postAnalyticsModel.aggregate(platformPipeline);

    // Extract hook text from each video's description (first sentence/line)
    const videosWithHooks = videos.map((v) => ({
      ...v,
      hook: this.extractHookFromDescription(v.description),
    }));

    // Group by normalized hook text and compute aggregate engagement
    const hookMap = new Map<
      string,
      { totalEngagement: number; totalViews: number; count: number }
    >();

    for (const v of videosWithHooks) {
      if (!v.hook) {
        continue;
      }
      const normalized = v.hook.toLowerCase().trim();
      const existing = hookMap.get(normalized) || {
        count: 0,
        totalEngagement: 0,
        totalViews: 0,
      };
      existing.totalEngagement += v.totalEngagement;
      existing.totalViews += v.totalViews;
      existing.count += 1;
      hookMap.set(normalized, existing);
    }

    const hookEffectiveness = Array.from(hookMap.entries())
      .map(([hook, stats]) => ({
        avgEngagement: Math.round(stats.totalEngagement / stats.count),
        avgViews: Math.round(stats.totalViews / stats.count),
        hook,
        postCount: stats.count,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    const topHooks = hookEffectiveness.slice(0, 10).map((h) => ({
      avgEngagement: h.avgEngagement,
      hook: h.hook,
      postCount: h.postCount,
    }));

    return {
      analysis: {
        hookEffectiveness,
        topHooks,
        topPlatforms: topPlatforms.map((p) => ({
          platform: p._id,
          postCount: p.postCount,
          totalEngagement: p.totalEngagement,
          totalViews: p.totalViews,
        })),
        totalVideos: videosWithHooks.length,
      },
      videos: videosWithHooks.map((v) => ({
        description: v.description || '',
        hook: v.hook || '',
        id: v._id.toString(),
        platforms: v.platforms,
        title: v.title || 'Untitled',
        totalEngagement: v.totalEngagement,
        totalViews: v.totalViews,
      })),
    };
  }

  /**
   * Extract the hook (opening line/sentence) from a post description.
   * The hook is the first sentence that grabs attention.
   */
  private extractHookFromDescription(description?: string): string {
    if (!description || description.trim().length === 0) {
      return '';
    }

    const trimmed = description.trim();

    // Split by newlines first (hooks are often on the first line)
    const firstLine = trimmed.split('\n')[0].trim();

    // If the first line is short enough, use it as the hook
    if (firstLine.length <= 150) {
      return firstLine;
    }

    // Otherwise, extract the first sentence
    const sentenceMatch = firstLine.match(/^[^.!?]+[.!?]/);
    if (sentenceMatch) {
      return sentenceMatch[0].trim();
    }

    // Fallback: truncate to 150 chars
    return firstLine.substring(0, 150);
  }
}
