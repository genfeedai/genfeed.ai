/**
 * Entity Leaderboard Service
 * Organization/brand leaderboards and paginated stats tables.
 * Extracted from AnalyticsService (issue #753) so the shared load + sort
 * scaffolding lives in one place and the dashboard service stays focused.
 */
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
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
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { IEntityAnalyticsStats } from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PrismaSql = ReturnType<typeof Prisma.sql>;
type EntityType = 'organization' | 'brand';
type EntityField = 'organizationId' | 'brandId';

interface DateRange {
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
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

/** One entity paired with its current + previous period stats */
interface EntityStatsRow<TEntity> {
  entity: TEntity;
  stats: IEntityAnalyticsStats;
  prevEngagement: number;
}

interface PaginationSlice<TItem> {
  data: TItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
  };
}

/** Default analytics stats for entities with no data */
const DEFAULT_ANALYTICS: IEntityAnalyticsStats = {
  avgEngagementRate: 0,
  totalEngagement: 0,
  totalPosts: 0,
  totalViews: 0,
};

/** Default brand analytics stats including platforms */
const DEFAULT_BRAND_ANALYTICS: IEntityAnalyticsStats = {
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
export class EntityLeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
    private readonly brandsService: BrandsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Parse date range from optional startDate/endDate strings
   * Uses DateRangeUtil helper with default D-7 to D-1
   */
  private parseDateRange(
    startDateStr?: string,
    endDateStr?: string,
  ): DateRange {
    return DateRangeUtil.parseDateRange(startDateStr, endDateStr);
  }

  private entityColumn(field: EntityField): PrismaSql {
    return Prisma.raw(`"${field}"`);
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
   * Uses Prisma raw SQL aggregation on PostAnalytics.
   */
  private async getCurrentAnalytics(
    entityIds: string[],
    startDate: Date,
    endDate: Date,
    entityField: EntityField,
    includePlatforms = false,
  ): Promise<Map<string, IEntityAnalyticsStats>> {
    if (entityIds.length === 0) {
      return new Map();
    }

    const column = this.entityColumn(entityField);

    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
      SELECT
        ${column} AS entity_id,
        AVG("engagementRate") AS avg_engagement_rate,
        SUM("totalViews") AS total_views,
        SUM("totalLikes") AS total_likes,
        SUM("totalComments") AS total_comments,
        SUM("totalShares") AS total_shares,
        SUM("totalSaves") AS total_saves,
        COUNT(DISTINCT "postId") AS unique_posts
        ${includePlatforms ? Prisma.sql`, ARRAY_AGG(DISTINCT "platform"::text) AS platforms` : Prisma.empty}
      FROM "post_analytics"
      WHERE ${column} = ANY(${entityIds}::text[])
        AND "date" >= ${startDate}
        AND "date" <= ${endDate}
      GROUP BY ${column}
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
    entityField: EntityField,
  ): Promise<Map<string, number>> {
    if (entityIds.length === 0) {
      return new Map();
    }

    const column = this.entityColumn(entityField);

    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
      SELECT
        ${column} AS entity_id,
        SUM("totalLikes" + "totalComments" + "totalShares" + "totalSaves") AS total_engagement
      FROM "post_analytics"
      WHERE ${column} = ANY(${entityIds}::text[])
        AND "date" >= ${startDate}
        AND "date" <= ${endDate}
      GROUP BY ${column}
    `;

    const engagementMap = new Map<string, number>();
    for (const row of results as EngagementAggRow[]) {
      engagementMap.set(row.entity_id, Number(row.total_engagement));
    }

    return engagementMap;
  }

  /**
   * Load all entities of a type (no pagination) paired with their current and
   * previous-period stats. Shared scaffolding for every leaderboard/stats path.
   */
  private async loadEntitiesWithStats<
    TEntity extends OrganizationDoc | BrandDoc,
  >(
    entityType: EntityType,
    range: DateRange,
    options: { organizationId?: string; includePlatforms?: boolean } = {},
  ): Promise<EntityStatsRow<TEntity>[]> {
    const includePlatforms = options.includePlatforms ?? false;
    const entityField: EntityField =
      entityType === 'organization' ? 'organizationId' : 'brandId';

    const docs = await this.findEntities<TEntity>(
      entityType,
      options.organizationId,
    );
    if (docs.length === 0) {
      return [];
    }

    const ids = docs.map((doc) => doc.id);
    const [analyticsMap, previousEngagementMap] = await Promise.all([
      this.getCurrentAnalytics(
        ids,
        range.startDate,
        range.endDate,
        entityField,
        includePlatforms,
      ),
      this.getPreviousEngagement(
        ids,
        range.previousStartDate,
        range.previousEndDate,
        entityField,
      ),
    ]);

    const defaults = includePlatforms
      ? DEFAULT_BRAND_ANALYTICS
      : DEFAULT_ANALYTICS;

    return docs.map((entity) => ({
      entity,
      prevEngagement: previousEngagementMap.get(entity.id) ?? 0,
      stats: analyticsMap.get(entity.id) ?? defaults,
    }));
  }

  private async findEntities<TEntity extends OrganizationDoc | BrandDoc>(
    entityType: EntityType,
    organizationId?: string,
  ): Promise<TEntity[]> {
    if (entityType === 'organization') {
      const result = await this.organizationsService.findAll(
        { where: { isDeleted: false } },
        { pagination: false },
      );
      return ((result as AggregatePaginateResult<OrganizationDoc>).docs ||
        []) as TEntity[];
    }

    const result = await this.brandsService.findAll(
      {
        where: {
          isDeleted: false,
          ...(organizationId && { organizationId }),
        },
      },
      { pagination: false },
    );
    return ((result as AggregatePaginateResult<BrandDoc>).docs ||
      []) as TEntity[];
  }

  /** Count non-deleted brands grouped by organization */
  private async countBrandsByOrganization(): Promise<Map<string, number>> {
    const brandCountRows = await this.prisma.brand.groupBy({
      by: ['organizationId'],
      where: { isDeleted: false },
      _count: { id: true },
    });
    return new Map<string, number>(
      brandCountRows.map((row) => [row.organizationId, row._count.id]),
    );
  }

  /** Sort entities/stats descending by the metric mapped from the sort enum */
  private sortByMetric<T>(items: T[], sort: LeaderboardSort): T[] {
    const field = SORT_FIELD_MAP[sort];
    return items.sort((a, b) => {
      const aVal = (a as Record<string, number>)[field];
      const bVal = (b as Record<string, number>)[field];
      return bVal - aVal;
    });
  }

  /** Slice an already-sorted list into a paginated payload */
  private buildPaginationSlice<TItem>(
    items: TItem[],
    page: number,
    limit: number,
  ): PaginationSlice<TItem> {
    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    return {
      data: items.slice(startIndex, startIndex + limit),
      pagination: { limit, page, total, totalPages },
    };
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
    const range = this.parseDateRange(startDateStr, endDateStr);
    const rows = await this.loadEntitiesWithStats<OrganizationDoc>(
      'organization',
      range,
    );

    const orgsWithStats: LeaderboardStats[] = rows.map(
      ({ entity, prevEngagement, stats }) => ({
        avgEngagementRate: stats.avgEngagementRate,
        growth: this.calculateGrowth(stats.totalEngagement, prevEngagement),
        id: entity.id,
        logo: entity.logo?.cdnUrl,
        name: entity.label || entity.name || 'Unknown',
        totalEngagement: stats.totalEngagement,
        totalPosts: stats.totalPosts,
        totalViews: stats.totalViews,
      }),
    );

    const ranked = this.sortByMetric(orgsWithStats, sort).slice(0, limit);

    return ranked.map(
      (item, index) =>
        new OrgLeaderboardItemEntity({
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
        }),
    );
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
    const range = this.parseDateRange(startDateStr, endDateStr);
    const rows = await this.loadEntitiesWithStats<BrandDoc>('brand', range, {
      includePlatforms: true,
      organizationId,
    });

    const brandsWithStats = rows.map(({ entity, prevEngagement, stats }) =>
      this.toBrandEntity(entity, stats, prevEngagement),
    );

    return this.sortByMetric(brandsWithStats, sort).slice(0, limit);
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
    const range = this.parseDateRange(startDateStr, endDateStr);
    const rows = await this.loadEntitiesWithStats<OrganizationDoc>(
      'organization',
      range,
    );

    const brandCountMap = await this.countBrandsByOrganization();

    const orgsWithStats = rows.map(
      ({ entity, prevEngagement, stats }) =>
        new OrgWithStatsEntity({
          avgEngagementRate: stats.avgEngagementRate,
          growth: this.calculateGrowth(stats.totalEngagement, prevEngagement),
          id: entity.id,
          logo: entity.logo?.cdnUrl,
          name: entity.label || entity.name || 'Unknown',
          totalBrands: brandCountMap.get(entity.id) || 0,
          totalEngagement: stats.totalEngagement,
          totalMembers: 0,
          totalPosts: stats.totalPosts,
          totalViews: stats.totalViews,
        }),
    );

    const sorted = this.sortByMetric(orgsWithStats, sort);
    return new PaginatedOrgsResponse(
      this.buildPaginationSlice(sorted, page, limit),
    );
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
    const range = this.parseDateRange(startDateStr, endDateStr);
    const rows = await this.loadEntitiesWithStats<BrandDoc>('brand', range, {
      includePlatforms: true,
      organizationId,
    });

    const brandsWithStats = rows.map(({ entity, prevEngagement, stats }) =>
      this.toBrandEntity(entity, stats, prevEngagement),
    );

    const sorted = this.sortByMetric(brandsWithStats, sort);
    return new PaginatedBrandsResponse(
      this.buildPaginationSlice(sorted, page, limit),
    );
  }

  /** Shared brand projection used by both brand leaderboard + stats paths */
  private toBrandEntity(
    brand: BrandDoc,
    stats: IEntityAnalyticsStats,
    prevEngagement: number,
  ): BrandWithStatsEntity {
    return new BrandWithStatsEntity({
      activePlatforms: stats.activePlatforms,
      avgEngagementRate: stats.avgEngagementRate,
      growth: this.calculateGrowth(stats.totalEngagement, prevEngagement),
      id: brand.id,
      logo: brand.logo?.cdnUrl,
      name: brand.label || brand.name || 'Unknown',
      organizationId: brand.organizationId || brand.org?.id,
      organizationName: brand.org?.label || brand.org?.name || 'Unknown',
      totalEngagement: stats.totalEngagement,
      totalPosts: stats.totalPosts,
      totalViews: stats.totalViews,
    });
  }
}
