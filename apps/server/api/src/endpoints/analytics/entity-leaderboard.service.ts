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
import type { IEntityAnalyticsStats } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type {
  AnalyticsAggRow,
  BrandDoc,
  DateRange,
  EngagementAggRow,
  EntityRankRow,
  EntityStatsRow,
  OrganizationDoc,
  PaginationSlice,
  ResolvedBrandDisplay,
} from './analytics.types';

type PrismaSql = ReturnType<typeof Prisma.sql>;
type EntityType = 'organization' | 'brand';
type EntityField = 'organizationId' | 'brandId';

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

/** The numeric stat keys a leaderboard can be ranked by */
type SortableMetric = 'totalEngagement' | 'totalPosts' | 'totalViews';

/** Map sort enum to field name */
const SORT_FIELD_MAP: Record<LeaderboardSort, SortableMetric> = {
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
    _loggerService: LoggerService,
  ) {}

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

    const results = await this.prisma.$queryRaw<AnalyticsAggRow[]>`
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
    for (const row of results) {
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

    const results = await this.prisma.$queryRaw<EngagementAggRow[]>`
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
    for (const row of results) {
      engagementMap.set(row.entity_id, Number(row.total_engagement));
    }

    return engagementMap;
  }

  /**
   * Metric expression a leaderboard is ranked by, evaluated per entity over
   * the requested window. Closed switch over the sort enum: nothing from the
   * request is ever spliced into the SQL text.
   */
  private rankMetricSql(sort: LeaderboardSort): PrismaSql {
    switch (SORT_FIELD_MAP[sort]) {
      case 'totalViews':
        return Prisma.sql`SUM("totalViews")`;
      case 'totalPosts':
        return Prisma.sql`COUNT(DISTINCT "postId")`;
      default:
        return Prisma.sql`SUM("totalLikes" + "totalComments" + "totalShares" + "totalSaves")`;
    }
  }

  /** Case-insensitive "contains" pattern with LIKE wildcards escaped. */
  private toContainsPattern(search: string): string {
    return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  }

  /**
   * Rank one window of entity ids in the database.
   *
   * Entities LEFT JOIN a per-entity metric aggregate so entities with no
   * analytics still rank (as zero). The ORDER BY is totalled with
   * `createdAt`/`id` so paging is stable across requests, and LIMIT/OFFSET keep
   * the result at one page — per-entity analytics lookups then run for those
   * ids only instead of for the whole table.
   */
  private async rankEntityIds(
    entityType: EntityType,
    range: DateRange,
    sort: LeaderboardSort,
    window: { limit: number; offset: number },
    filters: { brandId?: string; organizationId?: string; search?: string },
  ): Promise<string[]> {
    const isOrganization = entityType === 'organization';
    const entityTable = Prisma.raw(
      isOrganization ? '"organizations"' : '"brands"',
    );
    const analyticsColumn = this.entityColumn(
      isOrganization ? 'organizationId' : 'brandId',
    );
    const analyticsOrganizationFilter =
      !isOrganization && filters.organizationId
        ? Prisma.sql`AND "organizationId" = ${filters.organizationId}`
        : Prisma.empty;
    const entityOrganizationFilter =
      !isOrganization && filters.organizationId
        ? Prisma.sql`AND e."organizationId" = ${filters.organizationId}`
        : Prisma.empty;
    const searchFilter = filters.search
      ? Prisma.sql`AND e."label" ILIKE ${this.toContainsPattern(filters.search)}`
      : Prisma.empty;
    // A selected brand narrows the ranking to that one brand. The organization
    // filter above still applies, so a foreign brand id matches nothing.
    const brandFilter =
      !isOrganization && filters.brandId
        ? Prisma.sql`AND e."id" = ${filters.brandId}`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<EntityRankRow[]>`
      SELECT e."id" AS entity_id
      FROM ${entityTable} e
      LEFT JOIN (
        SELECT ${analyticsColumn} AS entity_id, ${this.rankMetricSql(sort)} AS metric
        FROM "post_analytics"
        WHERE "date" >= ${range.startDate}
          AND "date" <= ${range.endDate}
          ${analyticsOrganizationFilter}
        GROUP BY ${analyticsColumn}
      ) m ON m.entity_id = e."id"
      WHERE e."isDeleted" = false
        ${entityOrganizationFilter}
        ${brandFilter}
        ${searchFilter}
      ORDER BY COALESCE(m.metric, 0) DESC, e."createdAt" DESC, e."id" DESC
      LIMIT ${window.limit} OFFSET ${window.offset}
    `;

    return rows.map((row) => row.entity_id);
  }

  /** Count live entities matching the same filters as `rankEntityIds`. */
  private async countEntities(
    entityType: EntityType,
    filters: { brandId?: string; organizationId?: string; search?: string },
  ): Promise<number> {
    const label = filters.search
      ? { contains: filters.search, mode: 'insensitive' as const }
      : undefined;

    if (entityType === 'organization') {
      return this.prisma.organization.count({
        where: { isDeleted: false, label },
      });
    }

    return this.prisma.brand.count({
      where: {
        id: filters.brandId,
        isDeleted: false,
        label,
        organizationId: filters.organizationId,
      },
    });
  }

  /**
   * Rank one window of entities in the database, hydrate just those rows and
   * pair them with their current and previous-period stats, in rank order.
   * Shared scaffolding for every leaderboard/stats path.
   */
  private async loadRankedEntitiesWithStats<
    TEntity extends OrganizationDoc | BrandDoc,
  >(
    entityType: EntityType,
    range: DateRange,
    sort: LeaderboardSort,
    window: { limit: number; offset: number },
    options: {
      brandId?: string;
      organizationId?: string;
      includePlatforms?: boolean;
      search?: string;
    } = {},
  ): Promise<EntityStatsRow<TEntity>[]> {
    const includePlatforms = options.includePlatforms ?? false;
    const entityField: EntityField =
      entityType === 'organization' ? 'organizationId' : 'brandId';

    const ids = await this.rankEntityIds(entityType, range, sort, window, {
      brandId: options.brandId,
      organizationId: options.organizationId,
      search: options.search,
    });
    if (ids.length === 0) {
      return [];
    }

    const [docs, analyticsMap, previousEngagementMap] = await Promise.all([
      this.findEntitiesByIds<TEntity>(entityType, ids, options.organizationId),
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
    const docsById = new Map(docs.map((doc) => [doc.id, doc]));

    return ids.flatMap((id) => {
      const entity = docsById.get(id);
      return entity
        ? [
            {
              entity,
              prevEngagement: previousEngagementMap.get(id) ?? 0,
              stats: analyticsMap.get(id) ?? defaults,
            },
          ]
        : [];
    });
  }

  private async findEntitiesByIds<TEntity extends OrganizationDoc | BrandDoc>(
    entityType: EntityType,
    ids: string[],
    organizationId?: string,
  ): Promise<TEntity[]> {
    if (entityType === 'organization') {
      const result = await this.organizationsService.findAll(
        { where: { id: { in: ids }, isDeleted: false } },
        { pagination: false },
      );
      return ((result as AggregatePaginateResult<OrganizationDoc>).docs ||
        []) as TEntity[];
    }

    const result = await this.brandsService.findAll(
      {
        where: {
          id: { in: ids },
          isDeleted: false,
          ...(organizationId && { organizationId }),
        },
      },
      { pagination: false },
    );
    return ((result as AggregatePaginateResult<BrandDoc>).docs ||
      []) as TEntity[];
  }

  /**
   * Batched brand logo URLs for one page of leaderboard rows.
   *
   * There is no `brand.logo` column — logos are `Asset` rows — so the URL has
   * to be resolved. Ids are grouped by `organizationId` (the scalar FK; the
   * `org` relation alias is undefined at runtime) so the underlying read stays
   * tenant-scoped even when the leaderboard runs unscoped for platform admins.
   */
  private async resolveBrandLogos(
    brands: BrandDoc[],
  ): Promise<Map<string, string>> {
    const brandIdsByOrganization = new Map<string, string[]>();

    for (const brand of brands) {
      const organizationId = brand.organizationId;
      if (!organizationId) {
        continue;
      }

      const brandIds = brandIdsByOrganization.get(organizationId);
      if (brandIds) {
        brandIds.push(brand.id);
        continue;
      }

      brandIdsByOrganization.set(organizationId, [brand.id]);
    }

    if (brandIdsByOrganization.size === 0) {
      return new Map();
    }

    return this.brandsService.resolveBrandLogoUrls(brandIdsByOrganization);
  }

  /**
   * Batched organization names for one page of brand rows.
   *
   * Keyed by the `organizationId` scalar FK. The `brand.org` populated
   * relation it replaces was never populated — `BrandsService` passes
   * `undefined` for `BaseService`'s populate argument — so it was permanently
   * `undefined` at runtime and every row rendered the literal "Unknown".
   *
   * `Organization` is the tenant root, so `id IN (...)` combined with
   * `isDeleted: false` is the scope: the ids come from brands the caller was
   * already authorized to read.
   */
  private async resolveOrganizationNames(
    brands: BrandDoc[],
  ): Promise<Map<string, string>> {
    const organizationIds = [
      ...new Set(
        brands
          .map((brand) => brand.organizationId)
          .filter((organizationId): organizationId is string =>
            Boolean(organizationId),
          ),
      ),
    ];

    if (organizationIds.length === 0) {
      return new Map();
    }

    const organizations = await this.prisma.organization.findMany({
      select: { id: true, label: true },
      take: organizationIds.length,
      where: { id: { in: organizationIds }, isDeleted: false },
    });

    return new Map(
      organizations.map((organization) => [
        organization.id,
        organization.label,
      ]),
    );
  }

  /**
   * Resolve every display value a page of brand rows needs, in one batched
   * read each, and pair them by brand id for the projection.
   */
  private async resolveBrandDisplay(
    brands: BrandDoc[],
  ): Promise<Map<string, ResolvedBrandDisplay>> {
    const [logoUrlsByBrandId, organizationNamesById] = await Promise.all([
      this.resolveBrandLogos(brands),
      this.resolveOrganizationNames(brands),
    ]);

    return new Map(
      brands.map((brand) => [
        brand.id,
        {
          logoUrl: logoUrlsByBrandId.get(brand.id),
          organizationName: brand.organizationId
            ? organizationNamesById.get(brand.organizationId)
            : undefined,
        },
      ]),
    );
  }

  /** Count non-deleted brands grouped by organization, for the given orgs */
  private async countBrandsByOrganization(
    organizationIds: string[],
  ): Promise<Map<string, number>> {
    if (organizationIds.length === 0) {
      return new Map();
    }

    const brandCountRows = await this.prisma.brand.groupBy({
      by: ['organizationId'],
      where: { isDeleted: false, organizationId: { in: organizationIds } },
      _count: { id: true },
    });
    return new Map<string, number>(
      brandCountRows.map((row) => [row.organizationId, row._count.id]),
    );
  }

  /** Count active, non-deleted members grouped by organization, for the given orgs */
  private async countMembersByOrganization(
    organizationIds: string[],
  ): Promise<Map<string, number>> {
    if (organizationIds.length === 0) {
      return new Map();
    }

    const memberCountRows = await this.prisma.member.groupBy({
      by: ['organizationId'],
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: { in: organizationIds },
      },
      _count: { id: true },
    });
    return new Map<string, number>(
      memberCountRows.map((row) => [row.organizationId, row._count.id]),
    );
  }

  /** Shape a database-paged result into the paginated payload */
  private buildPaginationSlice<TItem>(
    data: TItem[],
    total: number,
    page: number,
    limit: number,
  ): PaginationSlice<TItem> {
    return {
      data,
      pagination: { limit, page, total, totalPages: Math.ceil(total / limit) },
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
    const range = DateRangeUtil.parseDateRange(startDateStr, endDateStr);
    const rows = await this.loadRankedEntitiesWithStats<OrganizationDoc>(
      'organization',
      range,
      sort,
      { limit, offset: 0 },
    );

    return rows.map(
      ({ entity, prevEngagement, stats }, index) =>
        new OrgLeaderboardItemEntity({
          avgEngagementRate: stats.avgEngagementRate,
          growth: this.calculateGrowth(stats.totalEngagement, prevEngagement),
          organization: {
            id: entity.id,
            logo: entity.authProviderLogoUrl ?? undefined,
            name: entity.label || entity.name || 'Unknown',
          },
          rank: index + 1,
          totalEngagement: stats.totalEngagement,
          totalPosts: stats.totalPosts,
          totalViews: stats.totalViews,
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
    const range = DateRangeUtil.parseDateRange(startDateStr, endDateStr);
    // Ranked and cut to the page in the database, so the asset and
    // organization reads below cover only the rows that will be rendered.
    const rows = await this.loadRankedEntitiesWithStats<BrandDoc>(
      'brand',
      range,
      sort,
      { limit, offset: 0 },
      { includePlatforms: true, organizationId },
    );
    const displayByBrandId = await this.resolveBrandDisplay(
      rows.map(({ entity }) => entity),
    );

    return rows.map(({ entity, prevEngagement, stats }) =>
      this.toBrandEntity(
        entity,
        stats,
        prevEngagement,
        displayByBrandId.get(entity.id),
      ),
    );
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
    const range = DateRangeUtil.parseDateRange(startDateStr, endDateStr);
    const [rows, total] = await Promise.all([
      this.loadRankedEntitiesWithStats<OrganizationDoc>(
        'organization',
        range,
        sort,
        { limit, offset: (page - 1) * limit },
      ),
      this.countEntities('organization', {}),
    ]);

    const organizationIds = rows.map(({ entity }) => entity.id);
    const [brandCountMap, memberCountMap] = await Promise.all([
      this.countBrandsByOrganization(organizationIds),
      this.countMembersByOrganization(organizationIds),
    ]);

    const data = rows.map(
      ({ entity, prevEngagement, stats }) =>
        new OrgWithStatsEntity({
          avgEngagementRate: stats.avgEngagementRate,
          growth: this.calculateGrowth(stats.totalEngagement, prevEngagement),
          id: entity.id,
          logo: entity.authProviderLogoUrl ?? undefined,
          name: entity.label || entity.name || 'Unknown',
          totalBrands: brandCountMap.get(entity.id) || 0,
          totalEngagement: stats.totalEngagement,
          totalMembers: memberCountMap.get(entity.id) || 0,
          totalPosts: stats.totalPosts,
          totalViews: stats.totalViews,
        }),
    );

    return new PaginatedOrgsResponse(
      this.buildPaginationSlice(data, total, page, limit),
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
    search?: string,
    brandId?: string,
  ): Promise<PaginatedBrandsResponse> {
    const range = DateRangeUtil.parseDateRange(startDateStr, endDateStr);
    // The name search runs in the same query that ranks and pages, and in the
    // count, so every page and the total reflect the same filtered set.
    const needle = search?.trim() || undefined;
    const [rows, total] = await Promise.all([
      this.loadRankedEntitiesWithStats<BrandDoc>(
        'brand',
        range,
        sort,
        { limit, offset: (page - 1) * limit },
        { brandId, includePlatforms: true, organizationId, search: needle },
      ),
      this.countEntities('brand', { brandId, organizationId, search: needle }),
    ]);

    const displayByBrandId = await this.resolveBrandDisplay(
      rows.map(({ entity }) => entity),
    );

    const slice = this.buildPaginationSlice(
      rows.map(({ entity, prevEngagement, stats }) =>
        this.toBrandEntity(
          entity,
          stats,
          prevEngagement,
          displayByBrandId.get(entity.id),
        ),
      ),
      total,
      page,
      limit,
    );

    return new PaginatedBrandsResponse(slice);
  }

  /**
   * Shared brand projection used by both brand leaderboard + stats paths.
   *
   * `logoUrl` and `organizationName` are resolved upstream, one batched read
   * each — see `resolveBrandDisplay`. They are passed in rather than looked up
   * here so a page of brands costs two queries instead of two per row.
   */
  private toBrandEntity(
    brand: BrandDoc,
    stats: IEntityAnalyticsStats,
    prevEngagement: number,
    display: ResolvedBrandDisplay = {},
  ): BrandWithStatsEntity {
    return new BrandWithStatsEntity({
      activePlatforms: stats.activePlatforms,
      avgEngagementRate: stats.avgEngagementRate,
      growth: this.calculateGrowth(stats.totalEngagement, prevEngagement),
      id: brand.id,
      logo: display.logoUrl,
      name: brand.label || brand.name || 'Unknown',
      organizationId: brand.organizationId,
      organizationName: display.organizationName || 'Unknown',
      totalEngagement: stats.totalEngagement,
      totalPosts: stats.totalPosts,
      totalViews: stats.totalViews,
    });
  }
}
