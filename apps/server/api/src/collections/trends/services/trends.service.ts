import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { TrendIdea } from '@api/collections/trends/dto/trend-ideas.dto';
import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type {
  HistoricalTrendsOptions,
  TrendContentItem,
  TrendContentResult,
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
import type { TrendDocument } from '@api/collections/trends/schemas/trend.schema';
import type { TrendingHashtagDocument } from '@api/collections/trends/schemas/trending-hashtag.schema';
import type { TrendingSoundDocument } from '@api/collections/trends/schemas/trending-sound.schema';
import type { TrendingVideoDocument } from '@api/collections/trends/schemas/trending-video.schema';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { TrendContentIdeasService } from '@api/collections/trends/services/modules/trend-content-ideas.service';
import { TrendFetchService } from '@api/collections/trends/services/modules/trend-fetch.service';
import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { TrendVideoService } from '@api/collections/trends/services/modules/trend-video.service';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import type {
  ApifyInstagramPost,
  ApifyNormalizedTweet,
  ApifyRedditPost,
  ApifyTikTokVideo,
  ApifyYouTubeVideo,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Timeframe } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TrendsService {
  private readonly CONTENT_CACHE_TTL_SECONDS = 600;
  private readonly SOURCE_PREVIEW_LIMIT = 5;
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
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly trendPreferencesService: TrendPreferencesService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
    private readonly trendFetchService: TrendFetchService,
    private readonly trendContentIdeasService: TrendContentIdeasService,
    private readonly trendAnalysisService: TrendAnalysisService,
    private readonly trendFilteringService: TrendFilteringService,
    private readonly trendVideoService: TrendVideoService,
    private readonly apifyService: ApifyService,
  ) {}

  private toSyncTrendInput(trend: TrendEntity): {
    id: string;
    mentions: number;
    platform: string;
    sourcePreview: TrendSourceItem[];
    sourcePreviewState: 'live' | 'fallback' | 'empty';
    topic: string;
    viralityScore: number;
  } {
    return {
      id: String(trend.id),
      mentions: trend.mentions,
      platform: trend.platform,
      sourcePreview: this.getStoredTrendSourcePreview(
        trend,
        this.SOURCE_PREVIEW_LIMIT,
      ),
      sourcePreviewState: this.getStoredTrendSourcePreviewState(
        trend,
        this.getStoredTrendSourcePreview(trend, this.SOURCE_PREVIEW_LIMIT),
      ),
      topic: trend.topic,
      viralityScore: trend.viralityScore,
    };
  }

  async getGlobalCorpusStats(): Promise<{
    activeTrends: number;
    referenceRecords: number;
  }> {
    const now = new Date();
    const [allGlobalTrends, referenceRecords] = await Promise.all([
      this.prisma.trend.findMany({
        where: { isDeleted: false, organizationId: null } as never,
      }),
      this.trendReferenceCorpusService.countGlobalReferences(),
    ]);
    const activeTrends = allGlobalTrends.filter((doc) => {
      const d = doc.data as unknown as Record<string, unknown>;
      return (
        d.isCurrent === true &&
        d.expiresAt != null &&
        new Date(d.expiresAt as string) > now
      );
    }).length;

    return {
      activeTrends,
      referenceRecords,
    };
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
    const hydratedTrends = await this.precomputeTrendSourcePreview(trends, {
      force: true,
      limit: this.SOURCE_PREVIEW_LIMIT,
    });
    await this.trendReferenceCorpusService.syncTrendReferences(
      hydratedTrends.map((trend) => this.toSyncTrendInput(trend)),
    );
    await this.cacheService.invalidateByTags(['trends:content']);
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
    const cachedTrends = await this.findActiveTrends({
      brandId: brandId ?? null,
      organizationId: organizationId ?? null,
      platform,
    });

    if (cachedTrends.length > 0) {
      return cachedTrends;
    }

    if (organizationId || brandId) {
      const globalTrends = await this.findActiveTrends({
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

    if (options.allowFetchIfMissing === false) {
      this.loggerService.log(
        'No cached trends found, returning empty result without live fetch',
      );
      return [];
    }

    // No cached trends, fetch fresh
    this.loggerService.log('No cached trends found, fetching fresh data');
    return await this.fetchAndCacheTrends(organizationId, brandId);
  }

  private async findActiveTrends(filter: {
    organizationId: string | null;
    brandId: string | null;
    platform?: string;
  }): Promise<TrendEntity[]> {
    const now = new Date();
    const docs = await this.prisma.trend.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      where: {
        brandId: filter.brandId,
        isDeleted: false,
        organizationId: filter.organizationId,
      } as never,
    });

    return docs
      .filter((doc) => {
        const d = doc.data as unknown as Record<string, unknown>;
        if (d.isCurrent !== true) return false;
        if (d.expiresAt && new Date(d.expiresAt as string) <= now) return false;
        if (filter.platform && d.platform !== filter.platform) return false;
        return true;
      })
      .sort((a, b) => {
        const ad = a.data as unknown as Record<string, number>;
        const bd = b.data as unknown as Record<string, number>;
        return (bd.viralityScore ?? 0) - (ad.viralityScore ?? 0);
      })
      .slice(0, 50)
      .map(
        (doc) =>
          new TrendEntity({
            ...doc,
            ...(doc.data as Record<string, unknown>),
          } as unknown as TrendDocument),
      );
  }

  /**
   * Get user's connected platforms
   */
  async getConnectedPlatforms(organizationId: string): Promise<string[]> {
    try {
      const credentials = await this.credentialsService.findAll(
        [
          {
            $match: {
              isConnected: true,
              isDeleted: false,
              organizationId: organizationId,
            },
          },
        ],
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
        requiresAuth: !connectedPlatforms.includes(trend.platform),
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
        this.buildTrendDiscoveryItem(trend, organizationId),
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
    const hydratedTrends = await this.precomputeTrendSourcePreview(trends, {
      force: true,
      limit: this.SOURCE_PREVIEW_LIMIT,
    });
    await this.trendReferenceCorpusService.syncTrendReferences(
      hydratedTrends.map((trend) => this.toSyncTrendInput(trend)),
    );
    const processed = hydratedTrends.length;

    await this.cacheService.invalidateByTags(['trends:content']);

    return { processed };
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

  // ==================== Delegated: Filtering ====================

  /**
   * Get a single trend by ID
   */
  async getTrendById(
    trendId: string,
    organizationId?: string,
  ): Promise<TrendEntity | null> {
    const doc = await this.prisma.trend.findFirst({
      where: { id: trendId, isDeleted: false } as never,
    });

    if (!doc) {
      return null;
    }

    // If organizationId provided, trend must belong to that org or be global
    if (organizationId) {
      const docOrgId = (doc as unknown as Record<string, unknown>)
        .organizationId;
      if (docOrgId !== organizationId && docOrgId !== null) {
        return null;
      }
    }

    return new TrendEntity({
      ...doc,
      ...(doc.data as Record<string, unknown>),
    } as unknown as TrendDocument);
  }

  async getTrendSourceItems(
    trendId: string,
    organizationId?: string,
    limit: number = 5,
  ): Promise<TrendSourceItem[]> {
    const trend = await this.getTrendById(trendId, organizationId);
    if (!trend) {
      return [];
    }

    try {
      const items = await this.fetchTrendSourceItems(trend, limit);
      if (items.length > 0) {
        return this.trendReferenceCorpusService.annotateSourceItemsWithReferenceIds(
          items,
        );
      }
    } catch (error: unknown) {
      this.loggerService.warn('Failed to fetch live trend source items', {
        error: error instanceof Error ? error.message : String(error),
        platform: trend.platform,
        trendId,
      });
    }

    return this.trendReferenceCorpusService.annotateSourceItemsWithReferenceIds(
      this.buildFallbackTrendSourceItems(trend),
    );
  }

  async getTrendContent(
    organizationId?: string,
    brandId?: string,
    options: {
      platform?: string;
      limit?: number;
      refresh?: boolean;
    } = {},
  ): Promise<TrendContentResult> {
    const limit = options.limit ?? 30;
    const platform = options.platform;
    const refresh = options.refresh ?? false;
    const cacheKey = this.cacheService.generateKey(
      'trends:content',
      organizationId || 'global',
      brandId || 'global',
      platform || 'all',
      limit,
    );

    if (!refresh) {
      const cached = await this.cacheService.get<TrendContentResult>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result = await this.getTrendsWithAccessControl(
      organizationId,
      brandId,
      platform,
    );

    const trends = refresh
      ? await this.precomputeTrendSourcePreview(result.trends, {
          force: true,
          limit: this.SOURCE_PREVIEW_LIMIT,
        })
      : result.trends;

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

  private async fetchTrendSourceItems(
    trend: TrendEntity,
    limit: number,
  ): Promise<TrendSourceItem[]> {
    switch (trend.platform) {
      case 'instagram':
        return this.fetchInstagramSourceItems(trend, limit);
      case 'tiktok':
        return this.fetchTikTokSourceItems(trend, limit);
      case 'twitter':
        return this.fetchTwitterSourceItems(trend, limit);
      case 'youtube':
        return this.fetchYouTubeSourceItems(trend, limit);
      case 'reddit':
        return this.fetchRedditSourceItems(trend, limit);
      default:
        return [];
    }
  }

  private async fetchInstagramSourceItems(
    trend: TrendEntity,
    limit: number,
  ): Promise<TrendSourceItem[]> {
    const hashtag = this.getTrendSearchTerm(trend);
    if (!hashtag) {
      return [];
    }

    const posts = await this.apifyService.searchInstagramByHashtag(hashtag, {
      limit,
    });

    return posts
      .map((post) => this.mapInstagramPostToSourceItem(post))
      .filter((item): item is TrendSourceItem => item !== null);
  }

  private async fetchTikTokSourceItems(
    trend: TrendEntity,
    limit: number,
  ): Promise<TrendSourceItem[]> {
    const hashtag = this.getTrendSearchTerm(trend);
    if (!hashtag) {
      return [];
    }

    const videos = await this.apifyService.searchTikTokByHashtag(hashtag, {
      limit,
    });

    return videos
      .map((video) => this.mapTikTokVideoToSourceItem(video))
      .filter((item): item is TrendSourceItem => item !== null);
  }

  private async fetchTwitterSourceItems(
    trend: TrendEntity,
    limit: number,
  ): Promise<TrendSourceItem[]> {
    const query = this.getTrendSearchTerm(trend);
    if (!query) {
      return [];
    }

    const tweets = await this.apifyService.searchTwitterTweets(query, {
      limit,
    });

    return tweets.map((tweet) => this.mapTweetToSourceItem(tweet));
  }

  private async fetchYouTubeSourceItems(
    trend: TrendEntity,
    limit: number,
  ): Promise<TrendSourceItem[]> {
    const query = this.getTrendSearchTerm(trend);
    if (!query) {
      return [];
    }

    const videos = await this.apifyService.searchYouTubeVideos(query, {
      limit,
    });

    return videos
      .map((video) => this.mapYouTubeVideoToSourceItem(video))
      .filter((item): item is TrendSourceItem => item !== null);
  }

  private async fetchRedditSourceItems(
    trend: TrendEntity,
    limit: number,
  ): Promise<TrendSourceItem[]> {
    const query = this.getTrendSearchTerm(trend);
    if (!query) {
      return [];
    }

    const posts = await this.apifyService.searchRedditPosts(query, { limit });

    return posts
      .map((post) => this.mapRedditPostToSourceItem(post))
      .filter((item): item is TrendSourceItem => item !== null);
  }

  private getTrendSearchTerm(trend: TrendEntity): string | null {
    const primaryHashtag = Array.isArray(trend.metadata?.hashtags)
      ? trend.metadata.hashtags.find((tag) => !!tag?.trim())
      : null;

    if (primaryHashtag) {
      return primaryHashtag.replace(/^#/, '').trim();
    }

    const topic = trend.topic?.trim();
    if (!topic) {
      return null;
    }

    return topic.replace(/^#/, '').trim();
  }

  private mapInstagramPostToSourceItem(
    post: ApifyInstagramPost,
  ): TrendSourceItem | null {
    const sourceUrl = post.shortCode
      ? `https://www.instagram.com/p/${post.shortCode}/`
      : post.videoUrl || post.imageUrl;

    if (!sourceUrl) {
      return null;
    }

    return {
      authorHandle: post.ownerUsername || undefined,
      contentType: post.videoUrl ? 'video' : 'image',
      id: post.id,
      mediaUrl: post.videoUrl || post.imageUrl,
      metrics: {
        comments: post.commentsCount,
        likes: post.likesCount,
        views: post.videoViewCount,
      },
      platform: 'instagram',
      publishedAt: post.timestamp || undefined,
      sourceUrl,
      text: post.caption,
      thumbnailUrl: post.imageUrl,
      title: this.truncateText(post.caption, 100),
    };
  }

  private mapTikTokVideoToSourceItem(
    video: ApifyTikTokVideo,
  ): TrendSourceItem | null {
    if (!video.webVideoUrl) {
      return null;
    }

    return {
      authorHandle:
        video.authorMeta?.name || video.authorMeta?.nickname || undefined,
      contentType: 'video',
      id: video.id,
      mediaUrl: video.webVideoUrl,
      metrics: {
        comments: video.commentCount,
        likes: video.diggCount,
        shares: video.shareCount,
        views: video.playCount,
      },
      platform: 'tiktok',
      publishedAt: video.createTime
        ? new Date(video.createTime * 1000).toISOString()
        : undefined,
      sourceUrl: video.webVideoUrl,
      text: video.desc,
      thumbnailUrl: video.authorMeta?.avatar || video.musicMeta?.coverUrl,
      title: this.truncateText(video.desc, 100),
    };
  }

  private mapTweetToSourceItem(tweet: ApifyNormalizedTweet): TrendSourceItem {
    const sourceUrl = tweet.authorUsername
      ? `https://x.com/${tweet.authorUsername}/status/${tweet.id}`
      : `https://x.com/i/web/status/${tweet.id}`;

    return {
      authorHandle: tweet.authorUsername || undefined,
      contentType: 'tweet',
      id: tweet.id,
      metrics: {
        comments: tweet.metrics?.replies,
        likes: tweet.metrics?.likes,
        shares: tweet.metrics?.retweets,
      },
      platform: 'twitter',
      publishedAt: tweet.createdAt?.toISOString(),
      sourceUrl,
      text: tweet.text,
      thumbnailUrl: tweet.authorAvatarUrl,
      title: this.truncateText(tweet.text, 100),
    };
  }

  private mapYouTubeVideoToSourceItem(
    video: ApifyYouTubeVideo,
  ): TrendSourceItem | null {
    if (!video.url) {
      return null;
    }

    return {
      authorHandle: video.channelName || undefined,
      contentType: 'video',
      id: video.id,
      mediaUrl: video.url,
      metrics: {
        comments: video.commentCount,
        likes: video.likeCount,
        views: video.viewCount,
      },
      platform: 'youtube',
      publishedAt: video.publishedAt || undefined,
      sourceUrl: video.url,
      text: video.description,
      thumbnailUrl: video.thumbnailUrl,
      title: video.title,
    };
  }

  private mapRedditPostToSourceItem(
    post: ApifyRedditPost,
  ): TrendSourceItem | null {
    const sourceUrl = post.permalink
      ? `https://reddit.com${post.permalink}`
      : post.url;

    if (!sourceUrl) {
      return null;
    }

    return {
      authorHandle: post.author || undefined,
      contentType: post.isVideo ? 'video' : 'post',
      id: post.id,
      mediaUrl: post.url,
      metrics: {
        comments: post.numComments,
        likes: post.score,
      },
      platform: 'reddit',
      publishedAt: post.createdUtc
        ? new Date(post.createdUtc * 1000).toISOString()
        : undefined,
      sourceUrl,
      text: post.title,
      title: post.title,
    };
  }

  private buildFallbackTrendSourceItems(trend: TrendEntity): TrendSourceItem[] {
    const mediaUrl =
      typeof trend.metadata?.videoUrl === 'string'
        ? trend.metadata.videoUrl
        : undefined;
    const sourceUrls = Array.isArray(trend.metadata?.urls)
      ? trend.metadata.urls.filter(
          (url): url is string => typeof url === 'string' && !!url,
        )
      : [];
    const resolvedSourceUrls =
      sourceUrls.length > 0 ? sourceUrls : mediaUrl ? [mediaUrl] : [];

    return resolvedSourceUrls.map((sourceUrl, index) => ({
      authorHandle:
        typeof trend.metadata?.creatorHandle === 'string'
          ? trend.metadata.creatorHandle
          : undefined,
      contentType:
        trend.platform === 'twitter'
          ? 'tweet'
          : trend.metadata?.videoUrl
            ? 'video'
            : 'post',
      id: `${trend.id}-fallback-${index + 1}`,
      mediaUrl,
      platform: trend.platform,
      publishedAt: trend.createdAt?.toISOString(),
      sourceUrl,
      text:
        typeof trend.metadata?.sampleContent === 'string'
          ? trend.metadata.sampleContent
          : trend.topic,
      thumbnailUrl:
        typeof trend.metadata?.thumbnailUrl === 'string'
          ? trend.metadata.thumbnailUrl
          : undefined,
      title: trend.topic,
    }));
  }

  private getStoredTrendSourcePreview(
    trend: TrendEntity,
    limit: number = this.SOURCE_PREVIEW_LIMIT,
  ): TrendSourceItem[] {
    const cachedItems = trend.metadata?.sourcePreviewCache;
    if (!Array.isArray(cachedItems)) {
      return [];
    }

    return cachedItems
      .filter((item): item is TrendSourceItem => this.isTrendSourceItem(item))
      .slice(0, limit);
  }

  private getStoredTrendSourcePreviewState(
    trend: TrendEntity,
    items: TrendSourceItem[],
  ): 'live' | 'fallback' | 'empty' {
    const storedState = trend.metadata?.sourcePreviewState;
    if (
      storedState === 'live' ||
      storedState === 'fallback' ||
      storedState === 'empty'
    ) {
      return storedState;
    }

    return this.getSourcePreviewState(items);
  }

  private getSourcePreviewState(
    items: TrendSourceItem[],
  ): 'live' | 'fallback' | 'empty' {
    if (items.length === 0) {
      return 'empty';
    }

    return items[0]?.id.endsWith('-fallback') ? 'fallback' : 'live';
  }

  private isTrendSourceItem(value: unknown): value is TrendSourceItem {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const item = value as Record<string, unknown>;
    return (
      typeof item.id === 'string' &&
      typeof item.platform === 'string' &&
      typeof item.sourceUrl === 'string' &&
      typeof item.contentType === 'string'
    );
  }

  private async persistTrendSourcePreview(
    trend: TrendEntity,
    items: TrendSourceItem[],
  ): Promise<TrendEntity> {
    const sourcePreviewState = this.getSourcePreviewState(items);
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

  private async precomputeTrendSourcePreview(
    trends: TrendEntity[],
    options: {
      force?: boolean;
      limit?: number;
    } = {},
  ): Promise<TrendEntity[]> {
    const limit = options.limit ?? this.SOURCE_PREVIEW_LIMIT;

    return await Promise.all(
      trends.map(async (trend) => {
        if (!this.CONTENT_FEED_PLATFORMS.has(trend.platform)) {
          return trend;
        }

        const cachedItems = this.getStoredTrendSourcePreview(trend, limit);
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

  private buildTrendContentItems(
    trends: TrendEntity[],
    limit: number,
  ): TrendContentItem[] {
    const dedupedItems = new Map<string, TrendContentItem>();

    for (const trend of trends) {
      if (!this.CONTENT_FEED_PLATFORMS.has(trend.platform)) {
        continue;
      }

      const storedItems = this.getStoredTrendSourcePreview(
        trend,
        this.SOURCE_PREVIEW_LIMIT,
      );
      const sourceItems =
        storedItems.length > 0
          ? storedItems
          : this.buildFallbackTrendSourceItems(trend);

      for (const sourceItem of sourceItems) {
        const contentItem: TrendContentItem = {
          ...sourceItem,
          contentRank: 0,
          matchedTrends: [trend.topic],
          requiresAuth: trend.requiresAuth,
          sourcePreviewState: this.getSourcePreviewState([sourceItem]),
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

  private truncateText(
    value?: string,
    maxLength: number = 100,
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    return value.length > maxLength
      ? `${value.slice(0, maxLength - 1)}…`
      : value;
  }

  private async buildTrendDiscoveryItem(
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
    const sourcePreviewState = this.getStoredTrendSourcePreviewState(
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

  private async resolveTrendSourcePreview(
    trend: TrendEntity,
    organizationId?: string,
    options: {
      allowLiveFetch?: boolean;
      ignoreCached?: boolean;
      limit?: number;
    } = {},
  ): Promise<TrendSourceItem[]> {
    const limit = options.limit ?? this.SOURCE_PREVIEW_LIMIT;
    const cachedItems =
      options.ignoreCached === true
        ? []
        : this.getStoredTrendSourcePreview(trend, limit);
    if (cachedItems.length > 0) {
      return cachedItems;
    }

    const fallbackItems = this.buildFallbackTrendSourceItems(trend).slice(
      0,
      limit,
    );
    if (!options.allowLiveFetch) {
      return fallbackItems;
    }

    try {
      const items = await this.fetchTrendSourceItems(trend, limit);
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
}
