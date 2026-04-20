import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { LeaderboardSort } from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import {
  BrandWithStatsEntity,
  OrgLeaderboardItemEntity,
  OrgWithStatsEntity,
  PaginatedBrandsResponse,
  PaginatedOrgsResponse,
} from '@api/endpoints/analytics/entities/organization-leaderboard.entity';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import {
  AnalyticsMetric,
  CredentialPlatform,
  PublishStatus,
} from '@genfeedai/enums';
import type {
  IAggregatedAnalyticsResult,
  IAggregatedEngagementResult,
  IEntityAnalyticsStats,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

interface ExportPostData {
  id: string;
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
    metadata: string;
  };
  metadata?: {
    label?: string;
    description?: string;
    extension?: string;
    model?: string;
    style?: string;
  };
  organizationId: string;
  brandId: string;
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

/** Organization document with aggregated fields */
interface OrganizationDoc {
  id: string;
  name?: string;
  label?: string;
  logo?: { cdnUrl?: string };
  isDeleted?: boolean;
  createdAt?: Date;
}

/** Brand document with aggregated fields */
interface BrandDoc {
  id: string;
  name?: string;
  label?: string;
  logo?: { cdnUrl?: string };
  organizationId?: string;
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

/** Platform metrics for time series */
interface PlatformMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
}

/** Raw row from $queryRaw analytics aggregation */
interface AnalyticsAggRow {
  entity_id: string;
  avg_engagement_rate: number;
  total_views: bigint;
  total_likes: bigint;
  total_comments: bigint;
  total_shares: bigint;
  total_saves: bigint;
  unique_posts: bigint;
  platforms?: string[];
}

/** Raw row from $queryRaw previous-engagement aggregation */
interface EngagementAggRow {
  entity_id: string;
  total_engagement: bigint;
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
export class AnalyticsService extends BaseService<Record<string, unknown>> {
  constructor(
    protected readonly prisma: PrismaService,
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
    super(prisma, 'analytic', logger, configService);
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
   * Get current period analytics grouped by entity ID.
   * Uses $queryRaw to replicate MongoDB $group aggregation on PostAnalytics.
   */
  private async getCurrentAnalytics(
    entityIds: string[],
    startDate: Date,
    endDate: Date,
    entityField: 'organizationId' | 'brandId',
    includePlatforms = false,
  ): Promise<Map<string, IEntityAnalyticsStats>> {
    if (entityIds.length === 0) {
      return new Map();
    }

    const column =
      entityField === 'organizationId' ? 'organization_id' : 'brand_id';

    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
      SELECT
        ${Prisma.raw(column)} AS entity_id,
        AVG("engagement_rate") AS avg_engagement_rate,
        SUM("total_views") AS total_views,
        SUM("total_likes") AS total_likes,
        SUM("total_comments") AS total_comments,
        SUM("total_shares") AS total_shares,
        SUM("total_saves") AS total_saves,
        COUNT(DISTINCT "post_id") AS unique_posts
        ${includePlatforms ? Prisma.raw(`, ARRAY_AGG(DISTINCT "platform"::text) AS platforms`) : Prisma.raw('')}
      FROM "post_analytics"
      WHERE ${Prisma.raw(column)} = ANY(${entityIds}::text[])
        AND "date" >= ${startDate}
        AND "date" <= ${endDate}
      GROUP BY ${Prisma.raw(column)}
    `;

    const analyticsMap = new Map<string, IEntityAnalyticsStats>();
    for (const row of results as AnalyticsAggRow[]) {
      const totalLikes = Number(row.total_likes);
      const totalComments = Number(row.total_comments);
      const totalShares = Number(row.total_shares);
      const totalSaves = Number(row.total_saves);
      const stats: IEntityAnalyticsStats = {
        avgEngagementRate: row.avg_engagement_rate || 0,
        totalEngagement: totalLikes + totalComments + totalShares + totalSaves,
        totalPosts: Number(row.unique_posts),
        totalViews: Number(row.total_views),
      };
      if (includePlatforms) {
        stats.activePlatforms = (row.platforms as string[] | null) || [];
      }
      analyticsMap.set(row.entity_id, stats);
    }

    return analyticsMap;
  }

  /**
   * Get previous period engagement totals grouped by entity ID.
   */
  private async getPreviousEngagement(
    entityIds: string[],
    startDate: Date,
    endDate: Date,
    entityField: 'organizationId' | 'brandId',
  ): Promise<Map<string, number>> {
    if (entityIds.length === 0) {
      return new Map();
    }

    const column =
      entityField === 'organizationId' ? 'organization_id' : 'brand_id';

    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
      SELECT
        ${Prisma.raw(column)} AS entity_id,
        SUM("total_likes" + "total_comments" + "total_shares" + "total_saves") AS total_engagement
      FROM "post_analytics"
      WHERE ${Prisma.raw(column)} = ANY(${entityIds}::text[])
        AND "date" >= ${startDate}
        AND "date" <= ${endDate}
      GROUP BY ${Prisma.raw(column)}
    `;

    const engagementMap = new Map<string, number>();
    for (const row of results as EngagementAggRow[]) {
      engagementMap.set(row.entity_id, Number(row.total_engagement));
    }

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

    const orgIds = allOrgs.map((o: OrganizationDoc) => o.id);

    const [analyticsMap, previousEngagementMap] = await Promise.all([
      this.getCurrentAnalytics(orgIds, startDate, endDate, 'organizationId'),
      this.getPreviousEngagement(
        orgIds,
        previousStartDate,
        previousEndDate,
        'organizationId',
      ),
    ]);

    const sortField = SORT_FIELD_MAP[sort];

    let orgsWithStats: LeaderboardStats[] = allOrgs.map(
      (org: OrganizationDoc) => {
        const orgId = org.id;
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
            ...(organizationId && { organization: organizationId }),
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

    const brandIds = allBrands.map((b: BrandDoc) => b.id);

    const [analyticsMap, previousEngagementMap] = await Promise.all([
      this.getCurrentAnalytics(brandIds, startDate, endDate, 'brandId', true),
      this.getPreviousEngagement(
        brandIds,
        previousStartDate,
        previousEndDate,
        'brandId',
      ),
    ]);

    const sortField = SORT_FIELD_MAP[sort];

    let brandsWithStats = allBrands.map((brand: BrandDoc) => {
      const brandId = brand.id;
      const analytics = analyticsMap.get(brandId) || DEFAULT_BRAND_ANALYTICS;
      const prevEngagement = previousEngagementMap.get(brandId) || 0;

      return new BrandWithStatsEntity({
        activePlatforms: analytics.activePlatforms,
        avgEngagementRate: analytics.avgEngagementRate,
        createdAt: brand.createdAt,
        growth: this.calculateGrowth(analytics.totalEngagement, prevEngagement),
        id: brandId,
        logo: brand.logo?.cdnUrl,
        name: brand.label || brand.name || 'Unknown',
        organizationId: brand.organizationId || brand.org?.id,
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
      const orgIds = allOrgs.map((o: OrganizationDoc) => o.id);

      [analyticsMap, previousEngagementMap] = await Promise.all([
        this.getCurrentAnalytics(orgIds, startDate, endDate, 'organizationId'),
        this.getPreviousEngagement(
          orgIds,
          previousStartDate,
          previousEndDate,
          'organizationId',
        ),
      ]);
    }

    // Count brands per org directly from Prisma
    const brandCountRows = await this.prisma.brand.groupBy({
      by: ['organizationId'],
      where: { isDeleted: false },
      _count: { id: true },
    });
    const brandCountMap = new Map<string, number>(
      brandCountRows.map((row) => [row.organizationId, row._count.id]),
    );

    const orgsWithStats = allOrgs.map((org: OrganizationDoc) => {
      const orgId = org.id;
      const analytics = analyticsMap.get(orgId) || DEFAULT_ANALYTICS;
      const prevEngagement = previousEngagementMap.get(orgId) || 0;

      return new OrgWithStatsEntity({
        avgEngagementRate: analytics.avgEngagementRate,
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
            ...(organizationId && { organization: organizationId }),
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
      const brandIds = allBrands.map((b: BrandDoc) => b.id);

      [analyticsMap, previousEngagementMap] = await Promise.all([
        this.getCurrentAnalytics(brandIds, startDate, endDate, 'brandId', true),
        this.getPreviousEngagement(
          brandIds,
          previousStartDate,
          previousEndDate,
          'brandId',
        ),
      ]);
    }

    const brandsWithStats = allBrands.map((brand: BrandDoc) => {
      const brandId = brand.id;
      const analytics = analyticsMap.get(brandId) || DEFAULT_BRAND_ANALYTICS;
      const prevEngagement = previousEngagementMap.get(brandId) || 0;

      return new BrandWithStatsEntity({
        activePlatforms: analytics.activePlatforms,
        avgEngagementRate: analytics.avgEngagementRate,
        createdAt: brand.createdAt,
        growth: this.calculateGrowth(analytics.totalEngagement, prevEngagement),
        id: brandId,
        logo: brand.logo?.cdnUrl,
        name: brand.label || brand.name || 'Unknown',
        organizationId: brand.organizationId || brand.org?.id,
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
      matchStage.organization = organizationId;
    }

    const aggregate = [
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
    const docs = (result as unknown as { docs?: ExportPostData[] }).docs || [];

    // Batch fetch analytics by platform to avoid N+1 queries
    const statsMap = await this.batchFetchAnalytics(docs);

    const processedData: ProcessedExportData[] = docs.map((pub) => {
      const platform = pub.credential.platform;
      const stats = statsMap.get(pub.id) || {
        comments: 0,
        likes: 0,
        views: pub.views || 0,
      };

      return {
        comments: stats.comments,
        createdAt: pub.createdAt,
        description: pub.description,
        extension: pub.metadata?.extension || '',
        id: pub.id,
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
                post.organizationId,
                post.brandId,
                post.externalId!,
              );
              statsMap.set(post.id, stats);
            } catch (error) {
              this.logger?.error('fetch stats failed', {
                error,
                externalId: post.externalId,
                platform,
              });
              statsMap.set(post.id, {
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

    // Aggregate timeseries data across all organizations and platforms using raw SQL
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const rawResults: any[] = await this.prisma.$queryRaw`
      SELECT
        TO_CHAR("date", 'YYYY-MM-DD') AS day,
        "platform"::text AS platform,
        SUM("total_comments") AS comments,
        AVG("engagement_rate") AS engagement_rate,
        SUM("total_likes") AS likes,
        SUM("total_saves") AS saves,
        SUM("total_shares") AS shares,
        SUM("total_views") AS views
      FROM "post_analytics"
      WHERE "date" >= ${start}
        AND "date" <= ${end}
        ${organizationId ? Prisma.raw(`AND "organization_id" = '${organizationId.replace(/'/g, "''")}'`) : Prisma.raw('')}
      GROUP BY TO_CHAR("date", 'YYYY-MM-DD'), "platform"
      ORDER BY day ASC
    `;

    // Generate date scaffolding
    const allDates = this.generateDateScaffolding(start, end);

    // Build a nested map: date -> platform -> metrics
    const dataMap = new Map<string, Map<string, PlatformMetrics>>();
    for (const row of rawResults) {
      const day = row.day as string;
      const platform = row.platform as string;
      if (!dataMap.has(day)) {
        dataMap.set(day, new Map<string, PlatformMetrics>());
      }
      dataMap.get(day)!.set(platform, {
        comments: Number(row.comments),
        engagementRate: Number(row.engagement_rate) || 0,
        likes: Number(row.likes),
        saves: Number(row.saves),
        shares: Number(row.shares),
        views: Number(row.views),
      });
    }

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

    // Build conditional WHERE fragments
    const brandFilter = brandId
      ? Prisma.raw(`AND "brand_id" = '${brandId.replace(/'/g, "''")}'`)
      : Prisma.raw('');
    const orgFilter = organizationId
      ? Prisma.raw(
          `AND "organization_id" = '${organizationId.replace(/'/g, "''")}'`,
        )
      : Prisma.raw('');

    // Current period metrics
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const currentMetrics: any[] = await this.prisma.$queryRaw`
      SELECT
        AVG("engagement_rate") AS avg_engagement_rate,
        SUM("total_comments") AS total_comments,
        SUM("total_likes") AS total_likes,
        COUNT(*) AS total_posts,
        SUM("total_saves") AS total_saves,
        SUM("total_shares") AS total_shares,
        SUM("total_views") AS total_views
      FROM "post_analytics"
      WHERE "date" >= ${startDate} AND "date" <= ${endDate}
        ${brandFilter}
        ${orgFilter}
    `;

    // Previous period metrics for growth calculation
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const previousMetrics: any[] = await this.prisma.$queryRaw`
      SELECT
        SUM("total_likes" + "total_comments" + "total_shares" + "total_saves") AS total_engagement,
        COUNT(*) AS total_posts,
        SUM("total_views") AS total_views
      FROM "post_analytics"
      WHERE "date" >= ${previousStartDate} AND "date" <= ${previousEndDate}
        ${brandFilter}
        ${orgFilter}
    `;

    const current = currentMetrics[0] || {
      avg_engagement_rate: 0,
      total_comments: 0,
      total_likes: 0,
      total_posts: 0,
      total_saves: 0,
      total_shares: 0,
      total_views: 0,
    };

    const previous = previousMetrics[0] || {
      total_engagement: 0,
      total_posts: 0,
      total_views: 0,
    };

    const totalLikes = Number(current.total_likes);
    const totalComments = Number(current.total_comments);
    const totalShares = Number(current.total_shares);
    const totalSaves = Number(current.total_saves);
    const totalEngagement =
      totalLikes + totalComments + totalShares + totalSaves;
    const totalPosts = Number(current.total_posts);
    const totalViews = Number(current.total_views);
    const prevEngagement = Number(previous.total_engagement);
    const prevPosts = Number(previous.total_posts);
    const prevViews = Number(previous.total_views);

    const postsGrowth =
      prevPosts > 0 ? ((totalPosts - prevPosts) / prevPosts) * 100 : 0;
    const viewsGrowth =
      prevViews > 0 ? ((totalViews - prevViews) / prevViews) * 100 : 0;
    const engagementGrowth =
      prevEngagement > 0
        ? ((totalEngagement - prevEngagement) / prevEngagement) * 100
        : 0;

    // Count organizations and brands via Prisma
    const orgWhere = organizationId
      ? { isDeleted: false, id: organizationId }
      : { isDeleted: false };
    const brandWhere = organizationId
      ? { isDeleted: false, organizationId }
      : { isDeleted: false };

    const [orgCount, brandCount] = await Promise.all([
      this.prisma.organization.count({ where: orgWhere }),
      this.prisma.brand.count({ where: brandWhere }),
    ]);

    return {
      avgEngagementRate: Number(current.avg_engagement_rate) || 0,
      brandCount,
      growth: {
        engagement: engagementGrowth,
        posts: postsGrowth,
        views: viewsGrowth,
      },
      organizationCount: orgCount,
      totalEngagement,
      totalPosts,
      totalViews,
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

    const brandFilter = brandId
      ? Prisma.raw(`AND "brand_id" = '${brandId.replace(/'/g, "''")}'`)
      : Prisma.raw('');
    const orgFilter = organizationId
      ? Prisma.raw(
          `AND "organization_id" = '${organizationId.replace(/'/g, "''")}'`,
        )
      : Prisma.raw('');

    // Group by platform and hour, pick the best hour per platform
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
      WITH hour_stats AS (
        SELECT
          "platform"::text AS platform,
          EXTRACT(HOUR FROM "date") AS hour,
          AVG("engagement_rate") AS avg_engagement_rate,
          COUNT(*) AS post_count
        FROM "post_analytics"
        WHERE "date" >= ${startDate} AND "date" <= ${endDate}
          ${brandFilter}
          ${orgFilter}
        GROUP BY "platform", EXTRACT(HOUR FROM "date")
      ),
      ranked AS (
        SELECT
          platform,
          hour,
          avg_engagement_rate,
          post_count,
          ROW_NUMBER() OVER (PARTITION BY platform ORDER BY avg_engagement_rate DESC, post_count DESC) AS rn
        FROM hour_stats
      )
      SELECT platform, hour, avg_engagement_rate, post_count
      FROM ranked
      WHERE rn = 1
      ORDER BY platform ASC
    `;

    return results.map((row) => ({
      avgEngagementRate: Number(
        (Number(row.avg_engagement_rate) || 0).toFixed(2),
      ),
      hour: Number(row.hour),
      platform: row.platform as string,
      postCount: Number(row.post_count),
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
    let sortExpr: string;
    switch (metric) {
      case AnalyticsMetric.ENGAGEMENT:
        sortExpr =
          '(pa.total_likes + pa.total_comments + pa.total_shares + pa.total_saves) DESC';
        break;
      case AnalyticsMetric.LIKES:
        sortExpr = 'pa.total_likes DESC';
        break;
      default:
        sortExpr = 'pa.total_views DESC';
    }

    const brandFilter = brandId
      ? Prisma.raw(`AND pa."brand_id" = '${brandId.replace(/'/g, "''")}'`)
      : Prisma.raw('');
    const platformFilter = platform
      ? Prisma.raw(
          `AND pa."platform"::text = '${String(platform).replace(/'/g, "''")}'`,
        )
      : Prisma.raw('');
    const orgFilter = organizationId
      ? Prisma.raw(
          `AND pa."organization_id" = '${organizationId.replace(/'/g, "''")}'`,
        )
      : Prisma.raw('');

    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
      SELECT
        pa.id,
        pa."post_id" AS post_id,
        pa."platform"::text AS platform,
        pa."date",
        pa."total_views",
        pa."total_likes",
        pa."total_comments",
        pa."total_saves",
        pa."total_shares",
        pa."engagement_rate",
        (pa.total_likes + pa.total_comments + pa.total_shares + pa.total_saves) AS total_engagement,
        p.label AS label,
        p.description AS description,
        b.name AS brand_name,
        b.logo AS brand_logo
      FROM "post_analytics" pa
      LEFT JOIN "posts" p ON p.id = pa."post_id"
      LEFT JOIN "brands" b ON b.id = pa."brand_id"
      WHERE pa."date" >= ${startDate}
        AND pa."date" <= ${endDate}
        ${brandFilter}
        ${platformFilter}
        ${orgFilter}
      ORDER BY ${Prisma.raw(sortExpr)}
      LIMIT ${safeLimit}
    `;

    return results.map((row) => ({
      _id: row.id as string,
      brandName: row.brand_name as string,
      brandLogo: row.brand_logo as unknown,
      date: row.date as Date,
      description: row.description as string,
      engagementRate: Number(row.engagement_rate),
      label: row.label as string,
      platform: row.platform as string,
      postId: row.post_id as string,
      thumbnailUrl: undefined,
      ingredientUrl: undefined,
      isVideo: false,
      totalComments: Number(row.total_comments),
      totalEngagement: Number(row.total_engagement),
      totalLikes: Number(row.total_likes),
      totalSaves: Number(row.total_saves),
      totalShares: Number(row.total_shares),
      totalViews: Number(row.total_views),
    }));
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

    const brandFilter = brandId
      ? Prisma.raw(`AND "brand_id" = '${brandId.replace(/'/g, "''")}'`)
      : Prisma.raw('');

    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
      SELECT
        "platform"::text AS platform,
        AVG("engagement_rate") AS avg_engagement_rate,
        SUM("total_comments") AS total_comments,
        SUM("total_likes") AS total_likes,
        COUNT(*) AS total_posts,
        SUM("total_saves") AS total_saves,
        SUM("total_shares") AS total_shares,
        SUM("total_views") AS total_views,
        SUM("total_likes" + "total_comments" + "total_shares" + "total_saves") AS total_engagement
      FROM "post_analytics"
      WHERE "date" >= ${startDate} AND "date" <= ${endDate}
        ${brandFilter}
      GROUP BY "platform"
      ORDER BY SUM("total_views") DESC
    `;

    // Calculate totals for percentage calculation
    const totals = results.reduce(
      (acc, platform) => {
        acc.views += Number(platform.total_views);
        acc.engagement += Number(platform.total_engagement);
        acc.posts += Number(platform.total_posts);
        return acc;
      },
      { engagement: 0, posts: 0, views: 0 },
    );

    // Add percentages to each platform
    return results.map((platform) => {
      const totalViews = Number(platform.total_views);
      const totalEngagement = Number(platform.total_engagement);
      const totalPosts = Number(platform.total_posts);
      return {
        avgEngagementRate: Number(platform.avg_engagement_rate) || 0,
        engagementPercentage:
          totals.engagement > 0
            ? (totalEngagement / totals.engagement) * 100
            : 0,
        platform: platform.platform as string,
        postsPercentage:
          totals.posts > 0 ? (totalPosts / totals.posts) * 100 : 0,
        totalEngagement,
        totalPosts,
        totalViews,
        viewsPercentage:
          totals.views > 0 ? (totalViews / totals.views) * 100 : 0,
      };
    });
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

    const brandFilter = brandId
      ? Prisma.raw(`AND "brand_id" = '${brandId.replace(/'/g, "''")}'`)
      : Prisma.raw('');

    // Current period: group by day
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const currentResults: any[] = await this.prisma.$queryRaw`
      SELECT
        TO_CHAR("date", 'YYYY-MM-DD') AS day,
        SUM("total_comments") AS comments,
        SUM("total_likes") AS likes,
        COUNT(*) AS posts,
        SUM("total_saves") AS saves,
        SUM("total_shares") AS shares,
        SUM("total_views") AS views,
        SUM("total_likes" + "total_comments" + "total_shares" + "total_saves") AS engagement
      FROM "post_analytics"
      WHERE "date" >= ${startDate} AND "date" <= ${endDate}
        ${brandFilter}
      GROUP BY TO_CHAR("date", 'YYYY-MM-DD')
      ORDER BY day ASC
    `;

    // Previous period: aggregate totals
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const previousResults: any[] = await this.prisma.$queryRaw`
      SELECT
        SUM("total_comments") AS total_comments,
        SUM("total_likes") AS total_likes,
        COUNT(*) AS total_posts,
        SUM("total_saves") AS total_saves,
        SUM("total_shares") AS total_shares,
        SUM("total_views") AS total_views
      FROM "post_analytics"
      WHERE "date" >= ${previousStartDate} AND "date" <= ${previousEndDate}
        ${brandFilter}
    `;

    const previous = previousResults[0] || {
      total_comments: 0,
      total_likes: 0,
      total_posts: 0,
      total_saves: 0,
      total_shares: 0,
      total_views: 0,
    };

    const prevEngagement =
      Number(previous.total_likes) +
      Number(previous.total_comments) +
      Number(previous.total_shares) +
      Number(previous.total_saves);

    // Calculate growth for each day
    const trends = currentResults.map((day) => {
      let growth = 0;
      let previousValue = 0;
      let currentValue = 0;

      switch (metric) {
        case AnalyticsMetric.ENGAGEMENT:
          previousValue = prevEngagement;
          currentValue = Number(day.engagement);
          break;
        case AnalyticsMetric.POSTS:
          previousValue = Number(previous.total_posts);
          currentValue = Number(day.posts);
          break;
        default:
          previousValue = Number(previous.total_views);
          currentValue = Number(day.views);
      }

      if (previousValue > 0) {
        growth = ((currentValue - previousValue) / previousValue) * 100;
      }

      return {
        date: day.day as string,
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

    const brandFilter = brandId
      ? Prisma.raw(`AND "brand_id" = '${brandId.replace(/'/g, "''")}'`)
      : Prisma.raw('');
    const platformFilter = platform
      ? Prisma.raw(
          `AND "platform"::text = '${String(platform).replace(/'/g, "''")}'`,
        )
      : Prisma.raw('');

    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
      SELECT
        SUM("total_comments") AS total_comments,
        SUM("total_likes") AS total_likes,
        SUM("total_saves") AS total_saves,
        SUM("total_shares") AS total_shares
      FROM "post_analytics"
      WHERE "date" >= ${startDate} AND "date" <= ${endDate}
        ${brandFilter}
        ${platformFilter}
    `;

    const data = results[0] || {
      total_comments: 0,
      total_likes: 0,
      total_saves: 0,
      total_shares: 0,
    };

    const totalComments = Number(data.total_comments);
    const totalLikes = Number(data.total_likes);
    const totalSaves = Number(data.total_saves);
    const totalShares = Number(data.total_shares);
    const total = totalLikes + totalComments + totalShares + totalSaves;

    return {
      comments: totalComments,
      likes: totalLikes,
      percentages: {
        comments: total > 0 ? (totalComments / total) * 100 : 0,
        likes: total > 0 ? (totalLikes / total) * 100 : 0,
        saves: total > 0 ? (totalSaves / total) * 100 : 0,
        shares: total > 0 ? (totalShares / total) * 100 : 0,
      },
      saves: totalSaves,
      shares: totalShares,
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

    const brandFilter = brandId
      ? Prisma.raw(`AND pa."brand_id" = '${brandId.replace(/'/g, "''")}'`)
      : Prisma.raw('');
    const orgFilter = organizationId
      ? Prisma.raw(
          `AND pa."organization_id" = '${organizationId.replace(/'/g, "''")}'`,
        )
      : Prisma.raw('');

    // Get top performing posts with description data
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const videos: any[] = await this.prisma.$queryRaw`
      SELECT
        pa."post_id" AS id,
        ARRAY_AGG(DISTINCT pa."platform"::text) AS platforms,
        SUM(pa."total_likes" + pa."total_comments" + pa."total_shares" + pa."total_saves") AS total_engagement,
        SUM(pa."total_views") AS total_views,
        p.description AS description,
        p.label AS title
      FROM "post_analytics" pa
      LEFT JOIN "posts" p ON p.id = pa."post_id"
      WHERE pa."date" >= ${startDate} AND pa."date" <= ${endDate}
        ${brandFilter}
        ${orgFilter}
      GROUP BY pa."post_id", p.description, p.label
      ORDER BY total_engagement DESC
      LIMIT 50
    `;

    // Platform aggregation
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const topPlatformsRaw: any[] = await this.prisma.$queryRaw`
      SELECT
        "platform"::text AS platform,
        COUNT(*) AS post_count,
        SUM("total_likes" + "total_comments" + "total_shares" + "total_saves") AS total_engagement,
        SUM("total_views") AS total_views
      FROM "post_analytics"
      WHERE "date" >= ${startDate} AND "date" <= ${endDate}
        ${brandFilter}
        ${orgFilter}
      GROUP BY "platform"
      ORDER BY total_engagement DESC
      LIMIT 5
    `;

    // Extract hook text from each video's description (first sentence/line)
    const videosWithHooks = videos.map((v) => ({
      ...v,
      hook: this.extractHookFromDescription(v.description as string),
      id: v.id as string,
      platforms: (v.platforms as string[]) || [],
      title: (v.title as string) || 'Untitled',
      totalEngagement: Number(v.total_engagement),
      totalViews: Number(v.total_views),
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
        topPlatforms: topPlatformsRaw.map((p) => ({
          platform: p.platform as string,
          postCount: Number(p.post_count),
          totalEngagement: Number(p.total_engagement),
          totalViews: Number(p.total_views),
        })),
        totalVideos: videosWithHooks.length,
      },
      videos: videosWithHooks.map((v) => ({
        description: (v.description as string) || '',
        hook: v.hook || '',
        id: v.id,
        platforms: v.platforms,
        title: v.title,
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
