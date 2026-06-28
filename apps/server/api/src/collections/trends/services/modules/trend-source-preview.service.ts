import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type {
  TrendContentItem,
  TrendContentResult,
  TrendDiscoveryItem,
  TrendSourceItem,
} from '@api/collections/trends/interfaces/trend.interfaces';
import { TREND_SOURCE_PREVIEW_LIMIT } from '@api/collections/trends/services/modules/trend-source.constants';
import { TrendSourceItemsService } from '@api/collections/trends/services/modules/trend-source-items.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

interface TrendsAccessControlResult {
  trends: TrendEntity[];
  connectedPlatforms: string[];
  lockedPlatforms: string[];
}

/**
 * Owns source-preview persistence/precompute/resolution, the content feed
 * assembly, the cached content endpoint, and trend discovery items.
 *
 * Extracted from TrendsService (issue #752). Live fetch + normalization is
 * delegated to {@link TrendSourceItemsService}.
 */
@Injectable()
export class TrendSourcePreviewService {
  private readonly CONTENT_CACHE_TTL_SECONDS = 600;
  private readonly CONTENT_FEED_PLATFORMS = new Set([
    'instagram',
    'linkedin',
    'reddit',
    'tiktok',
    'twitter',
    'youtube',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
    private readonly cacheService: CacheService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
    private readonly trendSourceItemsService: TrendSourceItemsService,
  ) {}

  /**
   * Build the source-reference sync input for a trend (delegates to the
   * source-items service which owns the stored-preview accessors).
   */
  toSyncTrendInput(trend: TrendEntity): {
    id: string;
    mentions: number;
    platform: string;
    sourcePreview: TrendSourceItem[];
    sourcePreviewState: 'live' | 'fallback' | 'empty';
    topic: string;
    viralityScore: number;
  } {
    return this.trendSourceItemsService.toSyncTrendInput(trend);
  }

  /**
   * Fetch live source items for a trend (falling back to synthesized items)
   * and annotate them with reference IDs.
   */
  async getAnnotatedSourceItems(
    trend: TrendEntity,
    limit: number,
  ): Promise<TrendSourceItem[]> {
    try {
      const items = await this.trendSourceItemsService.fetchTrendSourceItems(
        trend,
        limit,
      );
      if (items.length > 0) {
        return this.trendReferenceCorpusService.annotateSourceItemsWithReferenceIds(
          items,
        );
      }
    } catch (error: unknown) {
      this.loggerService.warn('Failed to fetch live trend source items', {
        error: error instanceof Error ? error.message : String(error),
        platform: trend.platform,
        trendId: trend.id,
      });
    }

    return this.trendReferenceCorpusService.annotateSourceItemsWithReferenceIds(
      this.trendSourceItemsService
        .buildFallbackTrendSourceItems(trend)
        .slice(0, limit),
    );
  }

  /**
   * Precompute and persist source previews for a batch of trends, returning the
   * hydrated trends.
   */
  async precomputeTrendSourcePreview(
    trends: TrendEntity[],
    options: {
      force?: boolean;
      limit?: number;
    } = {},
  ): Promise<TrendEntity[]> {
    const limit = options.limit ?? TREND_SOURCE_PREVIEW_LIMIT;

    return await Promise.all(
      trends.map(async (trend) => {
        if (!this.CONTENT_FEED_PLATFORMS.has(trend.platform)) {
          return trend;
        }

        const cachedItems =
          this.trendSourceItemsService.getStoredTrendSourcePreview(
            trend,
            limit,
          );
        if (!options.force && cachedItems.length > 0) {
          return trend;
        }

        const resolvedItems = await this.resolveTrendSourcePreview(
          trend,
          undefined,
          {
            allowLiveFetch: true,
            ignoreCached: options.force === true,
            limit,
          },
        );

        return this.persistTrendSourcePreview(trend, resolvedItems);
      }),
    );
  }

  /**
   * Build a discovery item for a trend with an embedded (cache-only) preview.
   */
  async buildTrendDiscoveryItem(
    trend: TrendEntity,
    organizationId?: string,
  ): Promise<TrendDiscoveryItem> {
    const sourcePreview = await this.resolveTrendSourcePreview(
      trend,
      organizationId,
      {
        allowLiveFetch: false,
        limit: 3,
      },
    );
    const sourcePreviewState =
      this.trendSourceItemsService.getStoredTrendSourcePreviewState(
        trend,
        sourcePreview,
      );

    return {
      ...trend,
      id: String(trend.id),
      createdAt:
        trend.createdAt instanceof Date
          ? trend.createdAt
          : trend.createdAt
            ? new Date(trend.createdAt)
            : undefined,
      expiresAt:
        trend.expiresAt instanceof Date
          ? trend.expiresAt
          : new Date(trend.expiresAt),
      sourcePreview,
      sourcePreviewState,
      sourcePreviewTotal: sourcePreview.length,
      updatedAt:
        trend.updatedAt instanceof Date
          ? trend.updatedAt
          : trend.updatedAt
            ? new Date(trend.updatedAt)
            : undefined,
    };
  }

  /**
   * Resolve, dedupe, rank, and cache the content feed for a tenant scope.
   *
   * `loadAccessControl` is only invoked on a cache miss so callers don't pay
   * the access-control cost when the feed is already cached.
   */
  async getTrendContent(
    scope: { organizationId?: string; brandId?: string },
    options: {
      platform?: string;
      limit?: number;
      refresh?: boolean;
    },
    loadAccessControl: () => Promise<TrendsAccessControlResult>,
  ): Promise<TrendContentResult> {
    const limit = options.limit ?? 30;
    const platform = options.platform;
    const refresh = options.refresh ?? false;
    const cacheKey = this.cacheService.generateKey(
      'trends:content',
      scope.organizationId || 'global',
      scope.brandId || 'global',
      platform || 'all',
      limit,
    );

    if (!refresh) {
      const cached = await this.cacheService.get<TrendContentResult>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result = await loadAccessControl();

    const trends = refresh
      ? await this.precomputeTrendSourcePreview(result.trends, {
          force: true,
          limit: TREND_SOURCE_PREVIEW_LIMIT,
        })
      : result.trends;
    if (refresh) {
      // Refresh repopulates only the current key; bust shared content tags so
      // other trends:content:* variants don't keep serving stale previews.
      await this.invalidateContentCache(['trends:content']);
    }

    const contentItems =
      await this.trendReferenceCorpusService.annotateSourceItemsWithReferenceIds(
        this.buildTrendContentItems(trends, limit),
      );
    const payload: TrendContentResult = {
      connectedPlatforms: result.connectedPlatforms,
      items: contentItems,
      latestTrendAt: this.getLatestTrendAt(trends),
      lockedPlatforms: result.lockedPlatforms,
      totalTrends: trends.filter((trend) =>
        this.CONTENT_FEED_PLATFORMS.has(trend.platform),
      ).length,
    };

    await this.cacheService.set(cacheKey, payload, {
      tags: [
        'trends',
        'trends:content',
        platform ? `trends:content:${platform}` : 'trends:content:all',
      ],
      ttl: this.CONTENT_CACHE_TTL_SECONDS,
    });

    return payload;
  }

  /**
   * Invalidate cached content-feed entries by tag.
   */
  invalidateContentCache(tags: string[]): Promise<number> {
    return this.cacheService.invalidateByTags(tags);
  }

  private async persistTrendSourcePreview(
    trend: TrendEntity,
    items: TrendSourceItem[],
  ): Promise<TrendEntity> {
    const sourcePreviewState =
      this.trendSourceItemsService.getSourcePreviewState(items);
    const metadata = {
      ...trend.metadata,
      sourcePreviewCache: items,
      sourcePreviewCachedAt: new Date().toISOString(),
      sourcePreviewState,
    };

    const existingDoc = await this.prisma.trend.findFirst({
      where: { id: String(trend.id), isDeleted: false } as never,
    });
    if (existingDoc) {
      const existingData =
        (existingDoc.data as unknown as Record<string, unknown>) ?? {};
      await this.prisma.trend.update({
        data: { data: { ...existingData, metadata } as never },
        where: { id: String(trend.id) },
      });
    }

    return new TrendEntity({
      ...trend,
      metadata,
    });
  }

  private async resolveTrendSourcePreview(
    trend: TrendEntity,
    organizationId?: string,
    options: {
      allowLiveFetch?: boolean;
      ignoreCached?: boolean;
      limit?: number;
    } = {},
  ): Promise<TrendSourceItem[]> {
    const limit = options.limit ?? TREND_SOURCE_PREVIEW_LIMIT;
    const cachedItems =
      options.ignoreCached === true
        ? []
        : this.trendSourceItemsService.getStoredTrendSourcePreview(
            trend,
            limit,
          );
    if (cachedItems.length > 0) {
      return cachedItems;
    }

    const fallbackItems = this.trendSourceItemsService
      .buildFallbackTrendSourceItems(trend)
      .slice(0, limit);
    if (!options.allowLiveFetch) {
      return fallbackItems;
    }

    try {
      const items = await this.trendSourceItemsService.fetchTrendSourceItems(
        trend,
        limit,
      );
      if (items.length > 0) {
        return items;
      }
    } catch (error: unknown) {
      this.loggerService.warn('Failed to build embedded trend source preview', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        platform: trend.platform,
        trendId: trend.id,
      });
    }

    return fallbackItems;
  }

  private buildTrendContentItems(
    trends: TrendEntity[],
    limit: number,
  ): TrendContentItem[] {
    const dedupedItems = new Map<string, TrendContentItem>();

    for (const trend of trends) {
      if (!this.CONTENT_FEED_PLATFORMS.has(trend.platform)) {
        continue;
      }

      const storedItems =
        this.trendSourceItemsService.getStoredTrendSourcePreview(
          trend,
          TREND_SOURCE_PREVIEW_LIMIT,
        );
      const sourceItems =
        storedItems.length > 0
          ? storedItems
          : this.trendSourceItemsService.buildFallbackTrendSourceItems(trend);

      for (const sourceItem of sourceItems) {
        const contentItem: TrendContentItem = {
          ...sourceItem,
          contentRank: 0,
          matchedTrends: [trend.topic],
          requiresAuth: trend.requiresAuth,
          sourcePreviewState:
            this.trendSourceItemsService.getSourcePreviewState([sourceItem]),
          trendId: String(trend.id),
          trendMentions: trend.mentions,
          trendTopic: trend.topic,
          trendViralityScore: trend.viralityScore,
        };
        const dedupeKey = this.getTrendContentCacheKey(contentItem);
        const existing = dedupedItems.get(dedupeKey);

        if (!existing) {
          dedupedItems.set(dedupeKey, contentItem);
          continue;
        }

        const matchedTrends = Array.from(
          new Set([...existing.matchedTrends, trend.topic]),
        );
        const preferred =
          this.compareTrendContentItems(contentItem, existing) > 0
            ? existing
            : contentItem;

        dedupedItems.set(dedupeKey, {
          ...preferred,
          matchedTrends,
        });
      }
    }

    return Array.from(dedupedItems.values())
      .sort((left, right) => this.compareTrendContentItems(left, right))
      .slice(0, limit)
      .map((item, index) => ({
        ...item,
        contentRank: index + 1,
      }));
  }

  private getLatestTrendAt(trends: TrendEntity[]): string | undefined {
    const timestamps = trends
      .map((trend) =>
        trend.createdAt instanceof Date
          ? trend.createdAt.getTime()
          : trend.createdAt
            ? new Date(trend.createdAt).getTime()
            : 0,
      )
      .filter((value) => value > 0);

    if (timestamps.length === 0) {
      return undefined;
    }

    return new Date(Math.max(...timestamps)).toISOString();
  }

  private getTrendContentCacheKey(item: TrendContentItem): string {
    return `${item.platform}:${item.sourceUrl || item.id}`;
  }

  private getTrendContentEngagementScore(item: TrendContentItem): number {
    return (
      (item.metrics?.views || 0) +
      (item.metrics?.likes || 0) +
      (item.metrics?.comments || 0) +
      (item.metrics?.shares || 0)
    );
  }

  private compareTrendContentItems(
    left: TrendContentItem,
    right: TrendContentItem,
  ): number {
    const liveStateDelta =
      Number(right.sourcePreviewState === 'live') -
      Number(left.sourcePreviewState === 'live');
    if (liveStateDelta !== 0) {
      return liveStateDelta;
    }

    const viralityDelta = right.trendViralityScore - left.trendViralityScore;
    if (viralityDelta !== 0) {
      return viralityDelta;
    }

    const engagementDelta =
      this.getTrendContentEngagementScore(right) -
      this.getTrendContentEngagementScore(left);
    if (engagementDelta !== 0) {
      return engagementDelta;
    }

    return (
      new Date(right.publishedAt || 0).getTime() -
      new Date(left.publishedAt || 0).getTime()
    );
  }
}
