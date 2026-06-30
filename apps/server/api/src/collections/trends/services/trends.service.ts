import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { TrendIdea } from '@api/collections/trends/dto/trend-ideas.dto';
import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type {
  HistoricalTrendsOptions,
  TrendContentResult,
  TrendCorpusFreshnessResult,
  TrendData,
  TrendDiscoveryItem,
  TrendPatternAnalysis,
  TrendSourceAccountResult,
  TrendSourceItem,
  TrendSourceReferenceResult,
} from '@api/collections/trends/interfaces/trend.interfaces';
import type {
  TrendTimelineEntry,
  TrendTurnoverStats,
} from '@api/collections/trends/interfaces/trend-turnover.interface';
import type { TrendingHashtagDocument } from '@api/collections/trends/schemas/trending-hashtag.schema';
import type { TrendingSoundDocument } from '@api/collections/trends/schemas/trending-sound.schema';
import type { TrendingVideoDocument } from '@api/collections/trends/schemas/trending-video.schema';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { TrendContentIdeasService } from '@api/collections/trends/services/modules/trend-content-ideas.service';
import { TrendFetchService } from '@api/collections/trends/services/modules/trend-fetch.service';
import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import {
  type PrelaunchReferenceCorpusBackfillOptions,
  type PrelaunchReferenceCorpusBackfillResult,
  TrendPrelaunchCorpusService,
} from '@api/collections/trends/services/modules/trend-prelaunch-corpus.service';
import { TrendQueryService } from '@api/collections/trends/services/modules/trend-query.service';
import { TrendSourcePreviewService } from '@api/collections/trends/services/modules/trend-source-preview.service';
import { TrendVideoService } from '@api/collections/trends/services/modules/trend-video.service';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { Timeframe } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type {
  PrelaunchReferenceCorpusBackfillOptions,
  PrelaunchReferenceCorpusBackfillResult,
} from '@api/collections/trends/services/modules/trend-prelaunch-corpus.service';

/**
 * Orchestrates trend retrieval, access control, and discovery, delegating the
 * source-item subsystem, preview persistence, read queries, and prelaunch
 * corpus seeding to focused module services (issue #752).
 */
@Injectable()
export class TrendsService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly trendPreferencesService: TrendPreferencesService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
    private readonly trendFetchService: TrendFetchService,
    private readonly trendContentIdeasService: TrendContentIdeasService,
    private readonly trendAnalysisService: TrendAnalysisService,
    private readonly trendFilteringService: TrendFilteringService,
    private readonly trendVideoService: TrendVideoService,
    private readonly trendQueryService: TrendQueryService,
    private readonly trendSourcePreviewService: TrendSourcePreviewService,
    private readonly trendPrelaunchCorpusService: TrendPrelaunchCorpusService,
  ) {}

  getGlobalCorpusStats(): Promise<{
    activeTrends: number;
    referenceRecords: number;
  }> {
    return this.trendPrelaunchCorpusService.getGlobalCorpusStats();
  }

  // ==================== Orchestrator Methods ====================

  /**
   * Calculate virality score — delegates to TrendFilteringService
   */
  calculateViralityScore(trend: TrendData): number {
    return this.trendFilteringService.calculateViralityScore(trend);
  }

  /**
   * Fetch trends from a specific platform — delegates to TrendFetchService
   */
  fetchPlatformTrends(
    platform: string,
    organizationId?: string,
    brandId?: string,
  ): Promise<TrendData[]> {
    return this.trendFetchService.fetchPlatformTrends(
      platform,
      organizationId,
      brandId,
    );
  }

  /**
   * Fetch and cache trends for all platforms — delegates to TrendFetchService
   */
  fetchAndCacheTrends(
    organizationId?: string,
    brandId?: string,
  ): Promise<TrendEntity[]> {
    return this.fetchAndHydrateTrends(organizationId, brandId);
  }

  private async fetchAndHydrateTrends(
    organizationId?: string,
    brandId?: string,
  ): Promise<TrendEntity[]> {
    const trends = await this.trendFetchService.fetchAndCacheTrends(
      organizationId,
      brandId,
      (trend) => this.trendFilteringService.calculateViralityScore(trend),
    );
    const hydratedTrends =
      await this.trendSourcePreviewService.precomputeTrendSourcePreview(
        trends,
        { force: true },
      );
    await this.trendReferenceCorpusService.syncTrendReferences(
      hydratedTrends.map((trend) =>
        this.trendSourcePreviewService.toSyncTrendInput(trend),
      ),
    );
    await this.trendSourcePreviewService.invalidateContentCache([
      'trends:content',
    ]);
    return hydratedTrends;
  }

  /**
   * Get trends from cache or fetch fresh
   * Returns only current (active) trends, preserving historical data for analysis
   */
  async getTrends(
    organizationId?: string,
    brandId?: string,
    platform?: string,
    options: {
      allowFetchIfMissing?: boolean;
    } = {},
  ): Promise<TrendEntity[]> {
    const cachedTrends = await this.trendQueryService.findActiveTrends({
      brandId: brandId ?? null,
      organizationId: organizationId ?? null,
      platform,
    });

    if (cachedTrends.length > 0) {
      return cachedTrends;
    }

    if (organizationId || brandId) {
      const globalTrends = await this.trendQueryService.findActiveTrends({
        brandId: null,
        organizationId: null,
        platform,
      });
      if (globalTrends.length > 0) {
        this.loggerService.log(
          'No tenant-scoped trends found, falling back to precomputed global trends',
        );
        return globalTrends;
      }
    }

    const lastGoodTrends = await this.trendQueryService.findLastGoodTrends({
      brandId: brandId ?? null,
      organizationId: organizationId ?? null,
      platform,
    });
    if (lastGoodTrends.length > 0) {
      this.loggerService.log(
        'No active trends found, falling back to last-good trend dataset',
      );
      return lastGoodTrends;
    }

    if (organizationId || brandId) {
      const globalLastGoodTrends =
        await this.trendQueryService.findLastGoodTrends({
          brandId: null,
          organizationId: null,
          platform,
        });
      if (globalLastGoodTrends.length > 0) {
        this.loggerService.log(
          'No tenant-scoped last-good trends found, falling back to global last-good trend dataset',
        );
        return globalLastGoodTrends;
      }
    }

    if (options.allowFetchIfMissing === false) {
      this.loggerService.log(
        'No cached trends found and live fetch is disabled, returning empty result',
      );
      return [];
    }

    // No cached trends, fetch fresh
    this.loggerService.log('No cached trends found, fetching fresh data');
    const fetchedTrends = await this.fetchAndCacheTrends(
      organizationId,
      brandId,
    );
    if (fetchedTrends.length > 0) {
      return fetchedTrends;
    }

    this.loggerService.log(
      'Fresh trend fetch returned no data, returning bootstrap trend fallback',
    );
    return this.trendQueryService.getBootstrapTrends(platform);
  }

  /**
   * Get user's connected platforms
   */
  async getConnectedPlatforms(organizationId: string): Promise<string[]> {
    try {
      const credentials = await this.credentialsService.findAll(
        {
          where: {
            isConnected: true,
            isDeleted: false,
            organizationId: organizationId,
          },
        },
        { limit: 100 },
      );

      if (credentials?.docs) {
        return credentials.docs.map((cred) => cred.platform.toLowerCase());
      }
      return [];
    } catch (error: unknown) {
      this.loggerService.error('Failed to get connected platforms', error);
      return [];
    }
  }

  /**
   * Get trends with access control logic
   */
  async getTrendsWithAccessControl(
    organizationId?: string,
    brandId?: string,
    platform?: string,
    options: {
      allowFetchIfMissing?: boolean;
    } = {},
  ): Promise<{
    trends: TrendEntity[];
    connectedPlatforms: string[];
    lockedPlatforms: string[];
  }> {
    const connectedPlatforms = organizationId
      ? await this.getConnectedPlatforms(organizationId)
      : [];
    const allPlatforms = [
      'tiktok',
      'instagram',
      'linkedin',
      'twitter',
      'youtube',
      'reddit',
      'pinterest',
    ];
    const lockedPlatforms = allPlatforms.filter(
      (p) => !connectedPlatforms.includes(p),
    );

    // Get trends
    let trends = await this.getTrends(organizationId, brandId, platform, {
      allowFetchIfMissing: options.allowFetchIfMissing ?? false,
    });

    // The raw getTrends probe returns [] on a cold cache so programmatic callers
    // (e.g. the agent tool executor) can detect a true cache-miss and trigger a
    // live fetch themselves. Access-control / display consumers reach trends
    // through this wrapper and still need a curated set to render, so restore the
    // bootstrap fallback here when nothing is cached.
    if (trends.length === 0) {
      trends = this.trendQueryService.getBootstrapTrends(platform);
    }

    // Filter by brand description if brandId provided
    if (brandId && organizationId) {
      try {
        const brand = await this.brandsService.findOne({
          _id: brandId,
          isDeleted: false,
          organization: organizationId,
        });

        if (brand?.description) {
          trends = this.trendFilteringService.filterTrendsByBrandDescription(
            trends,
            brand.description,
          );
        }
      } catch (error: unknown) {
        this.loggerService.warn('Failed to fetch brand for filtering', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    // Apply preferences filtering if organization exists
    if (organizationId) {
      try {
        const preferences = await this.trendPreferencesService.getPreferences(
          organizationId,
          brandId,
        );

        if (preferences) {
          trends = this.trendFilteringService.filterTrendsByPreferences(
            trends,
            {
              categories: preferences.categories,
              hashtags: preferences.hashtags,
              keywords: preferences.keywords,
              platforms: preferences.platforms,
            },
          );
        }
      } catch (error: unknown) {
        this.loggerService.warn('Failed to fetch preferences for filtering', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    // Mark trends that require authentication
    const enrichedTrends = trends.map((trend) => {
      return new TrendEntity({
        ...trend,
        requiresAuth:
          (trend.requiresAuth || !!organizationId) &&
          !connectedPlatforms.includes(trend.platform),
      });
    });

    return {
      connectedPlatforms,
      lockedPlatforms,
      trends: enrichedTrends,
    };
  }

  async getTrendsDiscovery(
    organizationId?: string,
    brandId?: string,
    platform?: string,
  ): Promise<{
    trends: TrendDiscoveryItem[];
    connectedPlatforms: string[];
    lockedPlatforms: string[];
  }> {
    const result = await this.getTrendsWithAccessControl(
      organizationId,
      brandId,
      platform,
    );

    const trends = await Promise.all(
      result.trends.map(async (trend) =>
        this.trendSourcePreviewService.buildTrendDiscoveryItem(
          trend,
          organizationId,
        ),
      ),
    );

    return {
      connectedPlatforms: result.connectedPlatforms,
      lockedPlatforms: result.lockedPlatforms,
      trends,
    };
  }

  // ==================== Delegated: Content Ideas ====================

  /**
   * Generate AI-powered content ideas for trends
   */
  generateContentIdeas(
    trends: TrendEntity[],
    limit: number = 10,
    onBilling?: (amount: number) => void,
  ): Promise<Map<string, TrendIdea[]>> {
    return this.trendContentIdeasService.generateContentIdeas(
      trends,
      limit,
      onBilling,
    );
  }

  // ==================== Delegated: Analysis ====================

  /**
   * Mark expired trends as historical
   */
  markExpiredTrendsAsHistorical(): Promise<number> {
    return this.trendAnalysisService.markExpiredTrendsAsHistorical();
  }

  /**
   * Refresh trends manually (mark old as historical, fetch fresh)
   */
  async refreshTrends(
    organizationId?: string,
    brandId?: string,
  ): Promise<TrendEntity[]> {
    await this.trendAnalysisService.markCurrentTrendsAsHistorical(
      organizationId,
      brandId,
    );
    return this.fetchAndHydrateTrends(organizationId, brandId);
  }

  async precomputeGlobalTrendSourcePreview(): Promise<{ processed: number }> {
    const trends = await this.getTrends();
    const hydratedTrends =
      await this.trendSourcePreviewService.precomputeTrendSourcePreview(
        trends,
        { force: true },
      );
    await this.trendReferenceCorpusService.syncTrendReferences(
      hydratedTrends.map((trend) =>
        this.trendSourcePreviewService.toSyncTrendInput(trend),
      ),
    );
    const processed = hydratedTrends.length;

    await this.trendSourcePreviewService.invalidateContentCache([
      'trends:content',
    ]);

    return { processed };
  }

  backfillPrelaunchReferenceCorpus(
    options: Parameters<
      TrendPrelaunchCorpusService['backfillPrelaunchReferenceCorpus']
    >[0] = {},
  ): ReturnType<
    TrendPrelaunchCorpusService['backfillPrelaunchReferenceCorpus']
  > {
    return this.trendPrelaunchCorpusService.backfillPrelaunchReferenceCorpus(
      options,
    );
  }

  async getReferenceCorpus(
    organizationId?: string,
    brandId?: string,
    options: {
      authorHandle?: string;
      limit?: number;
      platform?: string;
      trendId?: string;
    } = {},
  ): Promise<TrendSourceReferenceResult> {
    return this.trendReferenceCorpusService.getReferenceCorpus(
      organizationId,
      brandId,
      options,
    );
  }

  async getPromptReferencePacks(
    organizationId?: string,
    brandId?: string,
    options: Parameters<
      TrendReferenceCorpusService['getPromptReferencePacks']
    >[2] = {},
  ): ReturnType<TrendReferenceCorpusService['getPromptReferencePacks']> {
    return this.trendReferenceCorpusService.getPromptReferencePacks(
      organizationId,
      brandId,
      options,
    );
  }

  async getTopReferenceAccounts(
    organizationId?: string,
    brandId?: string,
    options: {
      limit?: number;
      platform?: string;
    } = {},
  ): Promise<TrendSourceAccountResult> {
    return this.trendReferenceCorpusService.getTopReferenceAccounts(
      organizationId,
      brandId,
      options,
    );
  }

  getCorpusFreshnessHealth(
    options: { platform?: string } = {},
  ): Promise<TrendCorpusFreshnessResult> {
    return this.trendReferenceCorpusService.getCorpusFreshnessHealth(options);
  }

  /**
   * Get historical trends for AI analysis
   */
  getHistoricalTrends(
    options: HistoricalTrendsOptions = {},
  ): Promise<TrendEntity[]> {
    return this.trendAnalysisService.getHistoricalTrends(options);
  }

  /**
   * Analyze trend patterns using historical data
   */
  analyzeTrendPatterns(
    topic: string,
    platform: string,
    daysBack: number = 7,
  ): Promise<TrendPatternAnalysis> {
    return this.trendAnalysisService.analyzeTrendPatterns(
      topic,
      platform,
      daysBack,
    );
  }

  // ==================== Delegated: Read Queries ====================

  /**
   * Get a single trend by ID
   */
  getTrendById(
    trendId: string,
    organizationId?: string,
  ): Promise<TrendEntity | null> {
    return this.trendQueryService.getTrendById(trendId, organizationId);
  }

  async getTrendSourceItems(
    trendId: string,
    organizationId?: string,
    limit: number = 5,
  ): Promise<TrendSourceItem[]> {
    const trend = await this.trendQueryService.getTrendById(
      trendId,
      organizationId,
    );
    if (!trend) {
      return [];
    }

    return this.trendSourcePreviewService.getAnnotatedSourceItems(trend, limit);
  }

  getTrendContent(
    organizationId?: string,
    brandId?: string,
    options: {
      platform?: string;
      limit?: number;
      refresh?: boolean;
    } = {},
  ): Promise<TrendContentResult> {
    return this.trendSourcePreviewService.getTrendContent(
      { brandId, organizationId },
      options,
      () =>
        this.getTrendsWithAccessControl(
          organizationId,
          brandId,
          options.platform,
        ),
    );
  }

  /**
   * Get related trends (same topic, different platforms)
   */
  getRelatedTrends(
    topic: string,
    excludePlatform: string,
    organizationId?: string,
    limit: number = 10,
  ): Promise<TrendEntity[]> {
    return this.trendFilteringService.getRelatedTrends(
      topic,
      excludePlatform,
      organizationId,
      limit,
    );
  }

  // ==================== Delegated: Video/Hashtag/Sound ====================

  /**
   * Get viral videos
   */
  getViralVideos(options?: {
    platform?: string;
    limit?: number;
    minViralScore?: number;
    timeframe?: Timeframe.H24 | Timeframe.H72 | Timeframe.D7;
  }): Promise<TrendingVideoDocument[]> {
    return this.trendVideoService.getViralVideos(options);
  }

  /**
   * Fetch and store viral videos from Apify
   */
  fetchAndCacheViralVideos(platform: string): Promise<void> {
    return this.trendVideoService.fetchAndCacheViralVideos(platform);
  }

  /**
   * Get trending hashtags
   */
  getTrendingHashtags(options?: {
    platform?: string;
    limit?: number;
  }): Promise<TrendingHashtagDocument[]> {
    return this.trendVideoService.getTrendingHashtags(options);
  }

  /**
   * Fetch and store trending hashtags
   */
  fetchAndCacheHashtags(platform: string): Promise<void> {
    return this.trendVideoService.fetchAndCacheHashtags(platform);
  }

  /**
   * Get trending sounds
   */
  getTrendingSounds(options?: {
    limit?: number;
  }): Promise<TrendingSoundDocument[]> {
    return this.trendVideoService.getTrendingSounds(options);
  }

  /**
   * Fetch and store trending sounds
   */
  fetchAndCacheSounds(): Promise<void> {
    return this.trendVideoService.fetchAndCacheSounds();
  }

  /**
   * Get cross-platform viral leaderboard
   */
  getViralLeaderboard(options?: {
    timeframe?: Timeframe.H24 | Timeframe.H72 | Timeframe.D7;
    limit?: number;
  }): Promise<TrendingVideoDocument[]> {
    return this.trendVideoService.getViralLeaderboard(options);
  }

  /**
   * Mark expired videos as historical
   */
  markExpiredVideosAsHistorical(): Promise<number> {
    return this.trendVideoService.markExpiredVideosAsHistorical();
  }

  /**
   * Mark expired hashtags as historical
   */
  markExpiredHashtagsAsHistorical(): Promise<number> {
    return this.trendVideoService.markExpiredHashtagsAsHistorical();
  }

  /**
   * Mark expired sounds as historical
   */
  markExpiredSoundsAsHistorical(): Promise<number> {
    return this.trendVideoService.markExpiredSoundsAsHistorical();
  }

  // ==================== Delegated: Turnover Analytics ====================

  /**
   * Get trend appearance and death counts by platform for the given period.
   */
  getTurnoverStats(days: 7 | 30 | 90): Promise<TrendTurnoverStats[]> {
    return this.trendVideoService.getTurnoverStats(days);
  }

  /**
   * Get daily trend births and deaths timeline for the given period.
   */
  getTrendTimeline(days: 7 | 30 | 90): Promise<TrendTimelineEntry[]> {
    return this.trendVideoService.getTrendTimeline(days);
  }
}
