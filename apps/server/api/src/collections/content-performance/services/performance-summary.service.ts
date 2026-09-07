import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { SERVER_TOKENS, type ServerPrisma } from '@api/server.dependencies';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { SocialSourceType } from '@genfeedai/contracts';
import type { SourcePostMetrics } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Where a performance row comes from: content Genfeed published (daily
 * `PostAnalytics` snapshots) or posts the brand published elsewhere and
 * imported through its own-account social source.
 */
export type PerformanceContentOrigin = 'genfeed' | 'imported';

export type PerformanceDatasetConfidence = 'none' | 'low' | 'medium' | 'high';

/** Fewer distinct posts than this in the window reads as low confidence. */
export const PERFORMANCE_DATASET_LOW_MAX_POSTS = 5;
/** Fewer distinct posts than this in the window reads as medium confidence. */
export const PERFORMANCE_DATASET_MEDIUM_MAX_POSTS = 20;
/** Upper bound on imported posts folded into one summary window. */
const IMPORTED_PERFORMANCE_LIMIT = 500;

export interface PerformanceDataset {
  genfeedPosts: number;
  importedPosts: number;
  totalPosts: number;
  confidence: PerformanceDatasetConfidence;
}

export interface WeeklySummaryOptions {
  topN?: number;
  worstN?: number;
  startDate?: Date | string;
  endDate?: Date | string;
}

export interface WorstPerformersOptions {
  startDate?: Date | string;
  endDate?: Date | string;
  /**
   * Minimum `totalViews` before a post can rank as a worst performer.
   * Defaults to {@link DEFAULT_WORST_PERFORMER_MIN_VIEWS}.
   */
  minViews?: number;
}

/**
 * Floor for worst-performer ranking. Posts below this view count are treated
 * as unreached rather than underperforming, so zero-reach rows cannot dominate
 * anti-pattern lists. 10 is enough to drop unpublished / never-distributed
 * posts without requiring a large audience first.
 */
export const DEFAULT_WORST_PERFORMER_MIN_VIEWS = 10;

export interface PerformanceContentItem {
  /** Genfeed post id, or the source post id for imported content. */
  postId: string;
  origin: PerformanceContentOrigin;
  /** Set for imported content so consumers can reach the `SourcePost` row. */
  sourcePostId?: string;
  title: string;
  description: string;
  platform: string;
  engagementRate: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  publishDate?: string;
}

interface ImportedPerformanceItem extends PerformanceContentItem {
  origin: 'imported';
  sourcePostId: string;
  category: string;
  hour: number | null;
}

interface ImportedPerformanceWindow {
  current: ImportedPerformanceItem[];
  previous: ImportedPerformanceItem[];
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
  /** How much content backs this window, split by origin. */
  dataset: PerformanceDataset;
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

type DateRangeFilter = {
  gte?: Date;
  lte?: Date;
};

type ContentTypeEngagementRow = {
  avg_engagement_rate: number | string | null;
  category: string | null;
  total_posts: bigint | number | string;
};

type PlatformEngagementRow = {
  avg_engagement_rate: number | string | null;
  platform: string | null;
  total_posts: bigint | number | string;
};

type PostingTimeAnalysisRow = {
  avg_engagement_rate: number | string | null;
  hour: number | string;
  post_count: bigint | number | string;
};

@Injectable()
export class PerformanceSummaryService {
  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: ServerPrisma,
  ) {}

  private buildMatchFilter(
    organizationId: string,
    brandId: string,
    startDate: Date,
    endDate: Date,
  ): Prisma.PostAnalyticsWhereInput {
    return {
      brandId,
      date: { gte: startDate, lte: endDate },
      organizationId,
    };
  }

  private buildAnalyticsSqlWhere(
    matchFilter: Prisma.PostAnalyticsWhereInput,
  ): Prisma.Sql {
    const dateRange = (matchFilter.date ?? {}) as DateRangeFilter;

    return Prisma.sql`
      pa."organizationId" = ${String(matchFilter.organizationId ?? '')}
      AND pa."brandId" = ${String(matchFilter.brandId ?? '')}
      AND pa."date" >= ${dateRange.gte ?? new Date(0)}
      AND pa."date" <= ${dateRange.lte ?? new Date()}
    `;
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
      DateRangeUtil.parseDateRange(options.startDate, options.endDate);

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      startDate,
      endDate,
    );
    const previousFilter: Prisma.PostAnalyticsWhereInput = {
      ...matchFilter,
      date: { gte: previousStartDate, lte: previousEndDate },
    };

    // Own-account imports are loaded once per window and folded into every
    // section below, so a brand that connected with a year of history is
    // ranked on what it actually published — not only on Genfeed output.
    const [importedCurrent, importedPrevious, genfeedPosts] = await Promise.all(
      [
        this.loadImportedPerformance(matchFilter),
        this.loadImportedPerformance(previousFilter),
        this.countGenfeedPosts(matchFilter),
      ],
    );
    const imported: ImportedPerformanceWindow = {
      current: importedCurrent,
      previous: importedPrevious,
    };

    const [
      topPerformers,
      worstPerformers,
      avgEngagementByPlatform,
      avgEngagementByContentType,
      bestPostingTimes,
      topHooks,
      weekOverWeekTrend,
    ] = await Promise.all([
      this.getContentByEngagement(
        matchFilter,
        topN,
        'desc',
        undefined,
        imported.current,
      ),
      this.getContentByEngagement(
        matchFilter,
        worstN,
        'asc',
        undefined,
        imported.current,
      ),
      this.getAvgEngagementByPlatform(matchFilter, imported.current),
      this.getAvgEngagementByContentType(matchFilter, imported.current),
      this.getBestPostingTimes(matchFilter, imported.current),
      this.getTopHooks(matchFilter, imported.current),
      this.getWeekOverWeekTrend(matchFilter, previousFilter, imported),
    ]);

    return {
      avgEngagementByContentType,
      avgEngagementByPlatform,
      bestPostingTimes,
      dataset: buildDataset(genfeedPosts, imported.current.length),
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
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      dateRange?.startDate,
      dateRange?.endDate,
    );

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      startDate,
      endDate,
    );

    return this.getContentByEngagement(
      matchFilter,
      limit,
      'desc',
      undefined,
      await this.loadImportedPerformance(matchFilter),
    );
  }

  /**
   * Get worst performing content ranked by lowest engagement rate.
   * Applies a minimum-views floor so zero-reach posts do not dominate.
   */
  async getWorstPerformers(
    organizationId: string,
    brandId: string,
    limit: number = 10,
    options: WorstPerformersOptions = {},
  ): Promise<PerformanceContentItem[]> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      options.startDate,
      options.endDate,
    );

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      startDate,
      endDate,
    );

    return this.getContentByEngagement(
      matchFilter,
      limit,
      'asc',
      options.minViews ?? DEFAULT_WORST_PERFORMER_MIN_VIEWS,
      await this.loadImportedPerformance(matchFilter),
    );
  }

  /**
   * Get prompt/description performance.
   */
  async getPromptPerformance(
    organizationId: string,
    brandId: string,
    startDate?: Date | string,
    endDate?: Date | string,
  ): Promise<PromptPerformanceItem[]> {
    const { startDate: parsedStart, endDate: parsedEnd } =
      DateRangeUtil.parseDateRange(startDate, endDate);

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      parsedStart,
      parsedEnd,
    );

    // Fetch post analytics grouped by post, then join with posts
    const analytics = await this.prisma.postAnalytics.findMany({
      where: {
        ...matchFilter,
        post: { is: scopedWhere(organizationId) },
      },
      orderBy: { engagementRate: 'desc' },
      take: 50,
    });

    // Group by first 100 chars of description/label
    const postIds = [...new Set(analytics.map((a) => String(a.postId)))];
    const posts =
      postIds.length > 0
        ? await this.prisma.post.findMany({
            select: {
              description: true,
              id: true,
              label: true,
              publicationDate: true,
            },
            take: postIds.length,
            where: scopedWhere(organizationId, {
              id: { in: postIds },
              isDeleted: false,
            }),
          })
        : [];
    const postMap = new Map(posts.map((p) => [p.id, p]));

    const promptMap = new Map<
      string,
      { totalEngagement: number; totalViews: number; count: number }
    >();

    for (const item of analytics) {
      const post = postMap.get(String(item.postId));
      const desc = String(post?.description || post?.label || '').trim();
      if (!desc) continue;

      const snippet = desc.substring(0, 100);
      const existing = promptMap.get(snippet) || {
        count: 0,
        totalEngagement: 0,
        totalViews: 0,
      };

      existing.totalEngagement += Number(item.engagementRate || 0);
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
      DateRangeUtil.parseDateRange();

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      startDate,
      endDate,
    );
    const previousFilter: Prisma.PostAnalyticsWhereInput = {
      ...matchFilter,
      date: { gte: previousStartDate, lte: previousEndDate },
    };
    const [importedCurrent, importedPrevious, genfeedPosts] = await Promise.all(
      [
        this.loadImportedPerformance(matchFilter),
        this.loadImportedPerformance(previousFilter),
        this.countGenfeedPosts(matchFilter),
      ],
    );
    const imported: ImportedPerformanceWindow = {
      current: importedCurrent,
      previous: importedPrevious,
    };

    const [topPerformers, platformEngagement, bestTimes, trend] =
      await Promise.all([
        this.getContentByEngagement(
          matchFilter,
          3,
          'desc',
          undefined,
          imported.current,
        ),
        this.getAvgEngagementByPlatform(matchFilter, imported.current),
        this.getBestPostingTimes(matchFilter, imported.current),
        this.getWeekOverWeekTrend(matchFilter, previousFilter, imported),
      ]);

    const lines: string[] = [];
    const dataset = buildDataset(genfeedPosts, imported.current.length);
    if (dataset.importedPosts > 0) {
      lines.push(
        `Based on ${dataset.genfeedPosts} Genfeed ${dataset.genfeedPosts === 1 ? 'post' : 'posts'} and ${dataset.importedPosts} imported ${dataset.importedPosts === 1 ? 'post' : 'posts'} from your connected accounts (${dataset.confidence} confidence).`,
      );
    }

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

    if (bestTimes.length > 0) {
      const bestHour = bestTimes[0].hour;
      const period = bestHour >= 12 ? 'PM' : 'AM';
      const displayHour = bestHour > 12 ? bestHour - 12 : bestHour || 12;
      lines.push(`Best posting time: ${displayHour}${period}.`);
    }

    if (platformEngagement.length > 0) {
      const best = platformEngagement.sort(
        (a, b) => b.avgEngagementRate - a.avgEngagementRate,
      )[0];
      lines.push(`Best platform: ${best.platform}.`);
    }

    const direction = trend.direction.toUpperCase();
    const pct = Math.abs(trend.percentageChange).toFixed(0);
    lines.push(`Engagement trending ${direction} ${pct}%.`);

    return lines.join(' ') || 'No performance data available yet.';
  }

  // ─── Private helpers ───────────────────────────────────────────────

  /**
   * Distinct Genfeed posts with analytics in the window — the Genfeed half of
   * the dataset size reported alongside every summary.
   */
  private async countGenfeedPosts(
    matchFilter: Prisma.PostAnalyticsWhereInput,
  ): Promise<number> {
    const organizationId = String(matchFilter.organizationId ?? '');
    const rows = await this.prisma.postAnalytics.findMany({
      distinct: ['postId'],
      select: { postId: true },
      where: { ...matchFilter, post: { is: scopedWhere(organizationId) } },
    });
    return rows.length;
  }

  /**
   * Posts the brand published outside Genfeed, imported through its
   * own-account social sources, mapped onto the same performance shape as
   * `PostAnalytics` rows so every section can rank them together.
   */
  private async loadImportedPerformance(
    matchFilter: Prisma.PostAnalyticsWhereInput,
  ): Promise<ImportedPerformanceItem[]> {
    const organizationId = String(matchFilter.organizationId ?? '');
    const brandId = String(matchFilter.brandId ?? '');
    if (!organizationId || !brandId) {
      return [];
    }
    const dateRange = (matchFilter.date ?? {}) as DateRangeFilter;
    const rows = await this.prisma.sourcePost.findMany({
      orderBy: { publishedAt: 'desc' },
      select: {
        contentType: true,
        id: true,
        metrics: true,
        platform: true,
        publishedAt: true,
        text: true,
      },
      take: IMPORTED_PERFORMANCE_LIMIT,
      where: scopedWhere(organizationId, {
        brandId,
        publishedAt: {
          gte: dateRange.gte ?? new Date(0),
          lte: dateRange.lte ?? new Date(),
        },
        source: {
          is: { isDeleted: false, sourceType: SocialSourceType.OWN_ACCOUNT },
        },
      }),
    });

    return rows.map((row) => toImportedPerformanceItem(row));
  }

  private async getContentByEngagement(
    matchFilter: Prisma.PostAnalyticsWhereInput,
    limit: number,
    sortDirection: 'asc' | 'desc',
    minViews?: number,
    imported: ImportedPerformanceItem[] = [],
  ): Promise<PerformanceContentItem[]> {
    const organizationId = String(matchFilter.organizationId ?? '');
    const where: Prisma.PostAnalyticsWhereInput = {
      ...matchFilter,
      ...(minViews === undefined ? {} : { totalViews: { gte: minViews } }),
      post: { is: scopedWhere(organizationId) },
    };

    const analytics = await this.prisma.postAnalytics.findMany({
      where,
      orderBy: { engagementRate: sortDirection },
      take: limit,
    });

    const postIds = [...new Set(analytics.map((a) => String(a.postId)))];
    const posts =
      postIds.length > 0
        ? await this.prisma.post.findMany({
            select: {
              description: true,
              id: true,
              label: true,
              publicationDate: true,
            },
            take: postIds.length,
            where: scopedWhere(organizationId, { id: { in: postIds } }),
          })
        : [];
    const postMap = new Map(posts.map((p) => [p.id, p]));

    const genfeedItems: PerformanceContentItem[] = analytics.map((item) => {
      const post = postMap.get(String(item.postId));
      const publishDate = post?.publicationDate
        ? new Date(post.publicationDate).toISOString()
        : undefined;
      return {
        comments: Number(item.totalComments || 0),
        description: String(post?.description || ''),
        engagementRate: Number(item.engagementRate || 0),
        likes: Number(item.totalLikes || 0),
        origin: 'genfeed',
        platform: String(item.platform || ''),
        postId: String(item.postId),
        ...(publishDate ? { publishDate } : {}),
        saves: Number(item.totalSaves || 0),
        shares: Number(item.totalShares || 0),
        title: String(post?.label || ''),
        views: Number(item.totalViews || 0),
      };
    });
    if (imported.length === 0) {
      return genfeedItems;
    }

    const importedItems = imported
      .filter((item) => minViews === undefined || item.views >= minViews)
      .map((item) => toPerformanceContentItem(item));
    const sign = sortDirection === 'desc' ? -1 : 1;
    return [...genfeedItems, ...importedItems]
      .sort((a, b) => sign * (a.engagementRate - b.engagementRate))
      .slice(0, limit);
  }

  private async getAvgEngagementByPlatform(
    matchFilter: Prisma.PostAnalyticsWhereInput,
    imported: ImportedPerformanceItem[] = [],
  ): Promise<PlatformEngagement[]> {
    const rows = await this.prisma.$queryRaw<PlatformEngagementRow[]>(
      Prisma.sql`
        SELECT
          pa."platform"::text AS platform,
          AVG(pa."engagementRate") AS avg_engagement_rate,
          COUNT(DISTINCT pa."postId") AS total_posts
        FROM "post_analytics" pa
        INNER JOIN "posts" p ON p."id" = pa."postId"
        WHERE ${this.buildAnalyticsSqlWhere(matchFilter)}
          AND p."isDeleted" = false
        GROUP BY pa."platform"
        ORDER BY avg_engagement_rate DESC
        LIMIT 20
      `,
    );

    const genfeed = rows.map((row) => ({
      avgEngagementRate: Number(row.avg_engagement_rate ?? 0),
      platform: row.platform || 'unknown',
      totalPosts: Number(row.total_posts ?? 0),
    }));
    return mergeWeightedAverages(
      genfeed,
      imported,
      (item) => item.platform,
      (item) => item.platform || 'unknown',
      (key, avgEngagementRate, totalPosts) => ({
        avgEngagementRate,
        platform: key,
        totalPosts,
      }),
    );
  }

  private async getAvgEngagementByContentType(
    matchFilter: Prisma.PostAnalyticsWhereInput,
    imported: ImportedPerformanceItem[] = [],
  ): Promise<ContentTypeEngagement[]> {
    const rows = await this.prisma.$queryRaw<ContentTypeEngagementRow[]>(
      Prisma.sql`
        SELECT
          COALESCE(p."category"::text, 'unknown') AS category,
          AVG(pa."engagementRate") AS avg_engagement_rate,
          COUNT(DISTINCT pa."postId") AS total_posts
        FROM "post_analytics" pa
        INNER JOIN "posts" p ON p."id" = pa."postId"
        WHERE ${this.buildAnalyticsSqlWhere(matchFilter)}
          AND p."isDeleted" = false
        GROUP BY COALESCE(p."category"::text, 'unknown')
        ORDER BY avg_engagement_rate DESC
        LIMIT 20
      `,
    );

    const genfeed = rows.map((row) => ({
      avgEngagementRate: Number(row.avg_engagement_rate ?? 0),
      category: row.category || 'unknown',
      totalPosts: Number(row.total_posts ?? 0),
    }));
    return mergeWeightedAverages(
      genfeed,
      imported,
      (item) => item.category,
      (item) => item.category,
      (key, avgEngagementRate, totalPosts) => ({
        avgEngagementRate,
        category: key,
        totalPosts,
      }),
    );
  }

  private async getBestPostingTimes(
    matchFilter: Prisma.PostAnalyticsWhereInput,
    imported: ImportedPerformanceItem[] = [],
  ): Promise<PostingTimeAnalysis[]> {
    const rows = await this.prisma.$queryRaw<PostingTimeAnalysisRow[]>(
      Prisma.sql`
        SELECT
          EXTRACT(HOUR FROM p."publicationDate")::int AS hour,
          AVG(pa."engagementRate") AS avg_engagement_rate,
          COUNT(DISTINCT pa."postId") AS post_count
        FROM "post_analytics" pa
        INNER JOIN "posts" p ON p."id" = pa."postId"
        WHERE ${this.buildAnalyticsSqlWhere(matchFilter)}
          AND p."isDeleted" = false
          AND p."publicationDate" IS NOT NULL
        GROUP BY hour
        ORDER BY avg_engagement_rate DESC
        LIMIT 24
      `,
    );

    const genfeed = rows.map((row) => ({
      avgEngagementRate: Number(row.avg_engagement_rate ?? 0),
      hour: Number(row.hour),
      postCount: Number(row.post_count ?? 0),
    }));
    const merged = mergeWeightedAverages(
      genfeed.map((row) => ({
        avgEngagementRate: row.avgEngagementRate,
        key: String(row.hour),
        totalPosts: row.postCount,
      })),
      imported.filter((item) => item.hour !== null),
      (item) => item.key,
      (item) => String(item.hour),
      (key, avgEngagementRate, totalPosts) => ({
        avgEngagementRate,
        hour: Number(key),
        postCount: totalPosts,
      }),
    );
    return merged.slice(0, 24);
  }

  private async getTopHooks(
    matchFilter: Prisma.PostAnalyticsWhereInput,
    imported: ImportedPerformanceItem[] = [],
  ): Promise<string[]> {
    const topContent = await this.getContentByEngagement(
      matchFilter,
      5,
      'desc',
      undefined,
      imported,
    );

    return topContent
      .map((item) => {
        const text = item.description || item.title || '';
        const firstLine = text.split(/[.\n]/)[0]?.trim();
        return firstLine || '';
      })
      .filter(Boolean);
  }

  private async getWeekOverWeekTrend(
    currentFilter: Prisma.PostAnalyticsWhereInput,
    previousFilter: Prisma.PostAnalyticsWhereInput,
    imported: ImportedPerformanceWindow = { current: [], previous: [] },
  ): Promise<{
    direction: 'up' | 'down' | 'stable';
    percentageChange: number;
    currentEngagement: number;
    previousEngagement: number;
  }> {
    const aggregateEngagement = async (
      filter: Prisma.PostAnalyticsWhereInput,
    ): Promise<number> => {
      const aggregate = await this.prisma.postAnalytics.aggregate({
        _sum: {
          totalComments: true,
          totalLikes: true,
          totalShares: true,
        },
        where: filter,
      });
      const sums = (aggregate as { _sum?: Record<string, unknown> })._sum ?? {};
      return (
        Number(sums.totalLikes ?? 0) +
        Number(sums.totalComments ?? 0) +
        Number(sums.totalShares ?? 0)
      );
    };

    const [genfeedCurrent, genfeedPrevious] = await Promise.all([
      aggregateEngagement(currentFilter),
      aggregateEngagement(previousFilter),
    ]);
    const currentEngagement =
      genfeedCurrent + sumImportedEngagement(imported.current);
    const previousEngagement =
      genfeedPrevious + sumImportedEngagement(imported.previous);

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

// ─── Imported content helpers ───────────────────────────────────────

type ImportedSourcePostRow = {
  contentType: string;
  id: string;
  metrics: unknown;
  platform: string;
  publishedAt: Date | null;
  text: string | null;
};

/** Imported content types onto the `PostCategory` labels the SQL groups use. */
const IMPORTED_CATEGORY_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  post: 'POST',
  reel: 'REEL',
  tweet: 'TEXT',
  video: 'VIDEO',
};

function readMetric(metrics: SourcePostMetrics, key: string): number {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function toImportedPerformanceItem(
  row: ImportedSourcePostRow,
): ImportedPerformanceItem {
  const metrics =
    row.metrics &&
    typeof row.metrics === 'object' &&
    !Array.isArray(row.metrics)
      ? (row.metrics as SourcePostMetrics)
      : {};
  const likes = readMetric(metrics, 'likes');
  const comments = readMetric(metrics, 'comments');
  const shares = readMetric(metrics, 'shares');
  const saves = readMetric(metrics, 'saves');
  const views =
    readMetric(metrics, 'views') ||
    readMetric(metrics, 'impressions') ||
    readMetric(metrics, 'reach');
  // Same formula PostAnalyticsService uses for Genfeed posts.
  const engagementRate =
    views > 0 ? ((likes + comments + shares) / views) * 100 : 0;
  const text = (row.text ?? '').trim();
  const title = text.split(/\n/)[0]?.trim().slice(0, 120) ?? '';
  const publishedAt = row.publishedAt ? new Date(row.publishedAt) : null;

  return {
    category:
      IMPORTED_CATEGORY_BY_CONTENT_TYPE[row.contentType.toLowerCase()] ??
      'unknown',
    comments,
    description: text,
    engagementRate,
    hour: publishedAt ? publishedAt.getUTCHours() : null,
    likes,
    origin: 'imported',
    platform: row.platform,
    postId: row.id,
    ...(publishedAt ? { publishDate: publishedAt.toISOString() } : {}),
    saves,
    shares,
    sourcePostId: row.id,
    title,
    views,
  };
}

function toPerformanceContentItem(
  item: ImportedPerformanceItem,
): PerformanceContentItem {
  const { category: _category, hour: _hour, ...content } = item;
  return content;
}

function sumImportedEngagement(items: ImportedPerformanceItem[]): number {
  return items.reduce(
    (total, item) => total + item.likes + item.comments + item.shares,
    0,
  );
}

function buildDataset(
  genfeedPosts: number,
  importedPosts: number,
): PerformanceDataset {
  const totalPosts = genfeedPosts + importedPosts;
  let confidence: PerformanceDatasetConfidence = 'high';
  if (totalPosts === 0) {
    confidence = 'none';
  } else if (totalPosts < PERFORMANCE_DATASET_LOW_MAX_POSTS) {
    confidence = 'low';
  } else if (totalPosts < PERFORMANCE_DATASET_MEDIUM_MAX_POSTS) {
    confidence = 'medium';
  }
  return { confidence, genfeedPosts, importedPosts, totalPosts };
}

/**
 * Fold imported items into SQL-grouped averages: each bucket's average is
 * re-weighted by post count so one imported reel cannot outvote fifty
 * Genfeed posts, and buckets only imports have are added. Sorted by average
 * engagement descending, as the SQL queries are.
 */
function mergeWeightedAverages<
  G extends { avgEngagementRate: number; totalPosts: number },
  R,
>(
  genfeed: G[],
  imported: ImportedPerformanceItem[],
  readGenfeedKey: (row: G) => string,
  readImportedKey: (item: ImportedPerformanceItem) => string,
  build: (key: string, avgEngagementRate: number, totalPosts: number) => R,
): R[] {
  if (imported.length === 0) {
    return genfeed.map((row) =>
      build(readGenfeedKey(row), row.avgEngagementRate, row.totalPosts),
    );
  }
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of genfeed) {
    buckets.set(readGenfeedKey(row), {
      count: row.totalPosts,
      sum: row.avgEngagementRate * row.totalPosts,
    });
  }
  for (const item of imported) {
    const key = readImportedKey(item);
    const bucket = buckets.get(key) ?? { count: 0, sum: 0 };
    bucket.count += 1;
    bucket.sum += item.engagementRate;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, bucket]) =>
      build(
        key,
        bucket.count > 0 ? bucket.sum / bucket.count : 0,
        bucket.count,
      ),
    )
    .sort((a, b) => {
      const left = (a as { avgEngagementRate: number }).avgEngagementRate;
      const right = (b as { avgEngagementRate: number }).avgEngagementRate;
      return right - left;
    });
}
