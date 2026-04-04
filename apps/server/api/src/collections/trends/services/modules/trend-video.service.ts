import type {
  TrendTimelineEntry,
  TrendTurnoverStats,
} from '@api/collections/trends/interfaces/trend-turnover.interface';
import {
  TrendingHashtag,
  type TrendingHashtagDocument,
} from '@api/collections/trends/schemas/trending-hashtag.schema';
import {
  TrendingSound,
  type TrendingSoundDocument,
} from '@api/collections/trends/schemas/trending-sound.schema';
import {
  TrendingVideo,
  type TrendingVideoDocument,
} from '@api/collections/trends/schemas/trending-video.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { Timeframe } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class TrendVideoService {
  private readonly CACHE_PREFIX = 'trends';
  private readonly READ_CACHE_TTL_SECONDS = 1800; // 30 minutes
  private readonly TREND_SIGNAL_DOCUMENT_TTL_SECONDS = 48 * 60 * 60;

  constructor(
    @InjectModel(TrendingVideo.name, DB_CONNECTIONS.CLOUD)
    private trendingVideoModel: Model<TrendingVideoDocument>,
    @InjectModel(TrendingHashtag.name, DB_CONNECTIONS.CLOUD)
    private trendingHashtagModel: Model<TrendingHashtagDocument>,
    @InjectModel(TrendingSound.name, DB_CONNECTIONS.CLOUD)
    private trendingSoundModel: Model<TrendingSoundDocument>,
    private readonly loggerService: LoggerService,
    private readonly cacheService: CacheService,
    private readonly apifyService: ApifyService,
  ) {}

  /**
   * Get viral videos from all platforms or a specific platform
   * Uses Redis cache for global data
   */
  async getViralVideos(options?: {
    platform?: string;
    limit?: number;
    minViralScore?: number;
    timeframe?: Timeframe.H24 | Timeframe.H72 | Timeframe.D7;
  }): Promise<TrendingVideoDocument[]> {
    const limit = options?.limit || 50;
    const platform = options?.platform;
    const minViralScore = options?.minViralScore;
    const cacheKey = `${this.CACHE_PREFIX}:videos:${platform || 'all'}${minViralScore ? `:min${minViralScore}` : ''}`;

    // Check cache first
    const cached =
      await this.cacheService.get<TrendingVideoDocument[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Query from database
    const query: Record<string, unknown> = {
      expiresAt: { $gt: new Date() },
      isCurrent: true,
      isDeleted: false,
    };

    if (platform) {
      query.platform = platform;
    }

    if (minViralScore != null) {
      query.viralScore = { $gte: minViralScore };
    }

    const videos = await this.trendingVideoModel
      .find(query)
      .sort({ viewCount: -1, viralScore: -1 })
      .limit(limit)
      .lean();

    // Cache results
    if (videos.length > 0) {
      await this.cacheService.set(cacheKey, videos, {
        tags: [
          'trends',
          'videos',
          platform ? `videos:${platform}` : 'videos:all',
        ],
        ttl: this.READ_CACHE_TTL_SECONDS,
      });
      return videos as TrendingVideoDocument[];
    }

    this.loggerService.debug(
      `No cached viral videos available for ${platform || 'all'}; skipping live Apify fetch on read path`,
    );
    return [];
  }

  /**
   * Fetch and store viral videos from Apify
   */
  async fetchAndCacheViralVideos(
    platform: string,
    limit: number = 12,
  ): Promise<void> {
    const videoFetchers: Record<
      string,
      () => Promise<Record<string, unknown>[]>
    > = {
      // @ts-expect-error TS2322
      instagram: () => this.apifyService.getInstagramVideos(limit),
      // @ts-expect-error TS2322
      reddit: () => this.apifyService.getRedditVideos(limit),
      // @ts-expect-error TS2322
      tiktok: () => this.apifyService.getTikTokVideos(limit),
      // @ts-expect-error TS2322
      youtube: () => this.apifyService.getYouTubeVideos(limit),
    };

    const fetcher = videoFetchers[platform];
    if (!fetcher) {
      return;
    }

    try {
      const videos = await fetcher();
      const expiresAt = new Date(
        Date.now() + this.TREND_SIGNAL_DOCUMENT_TTL_SECONDS * 1000,
      );

      for (const video of videos) {
        await this.trendingVideoModel.findOneAndUpdate(
          // @ts-expect-error TS2769
          { externalId: video.externalId, platform },
          {
            $set: {
              ...video,
              expiresAt,
              isCurrent: true,
              isDeleted: false,
              lastSeenAt: new Date(),
            },
          },
          { returnDocument: 'after', upsert: true },
        );
      }

      this.loggerService.log(
        `Cached ${videos.length} viral videos for ${platform}`,
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `Failed to fetch viral videos for ${platform}`,
        error,
      );
    }
  }

  // ==================== Trending Hashtags ====================

  /**
   * Get trending hashtags from all platforms or a specific platform
   */
  async getTrendingHashtags(options?: {
    platform?: string;
    limit?: number;
  }): Promise<TrendingHashtagDocument[]> {
    const limit = options?.limit || 50;
    const platform = options?.platform;
    const cacheKey = `${this.CACHE_PREFIX}:hashtags:${platform || 'all'}`;

    // Check cache first
    const cached =
      await this.cacheService.get<TrendingHashtagDocument[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const query: Record<string, unknown> = {
      expiresAt: { $gt: new Date() },
      isCurrent: true,
      isDeleted: false,
    };

    if (platform) {
      query.platform = platform;
    }

    const hashtags = await this.trendingHashtagModel
      .find(query)
      .sort({ postCount: -1, viralityScore: -1 })
      .limit(limit)
      .lean();

    // Cache results
    if (hashtags.length > 0) {
      await this.cacheService.set(cacheKey, hashtags, {
        tags: [
          'trends',
          'hashtags',
          platform ? `hashtags:${platform}` : 'hashtags:all',
        ],
        ttl: this.READ_CACHE_TTL_SECONDS,
      });
      return hashtags as TrendingHashtagDocument[];
    }

    this.loggerService.debug(
      `No cached trending hashtags available for ${platform || 'all'}; skipping live Apify fetch on read path`,
    );
    return [];
  }

  /**
   * Fetch and store trending hashtags from Apify
   */
  async fetchAndCacheHashtags(
    platform: string,
    limit: number = 12,
  ): Promise<void> {
    try {
      const hashtags = await this.apifyService.getTrendingHashtags(
        platform,
        limit,
      );

      if (hashtags.length === 0) {
        return;
      }

      const expiresAt = new Date(
        Date.now() + this.TREND_SIGNAL_DOCUMENT_TTL_SECONDS * 1000,
      );

      for (const hashtag of hashtags) {
        await this.trendingHashtagModel.findOneAndUpdate(
          { hashtag: hashtag.hashtag, platform },
          {
            $set: {
              ...hashtag,
              expiresAt,
              isCurrent: true,
              isDeleted: false,
              lastSeenAt: new Date(),
            },
          },
          { returnDocument: 'after', upsert: true },
        );
      }

      this.loggerService.log(
        `Cached ${hashtags.length} hashtags for ${platform}`,
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `Failed to fetch hashtags for ${platform}`,
        error,
      );
    }
  }

  // ==================== Trending Sounds ====================

  /**
   * Get trending sounds (TikTok-specific)
   */
  async getTrendingSounds(options?: {
    limit?: number;
  }): Promise<TrendingSoundDocument[]> {
    const limit = options?.limit || 50;
    const cacheKey = `${this.CACHE_PREFIX}:sounds`;

    // Check cache first
    const cached =
      await this.cacheService.get<TrendingSoundDocument[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const sounds = await this.trendingSoundModel
      .find({
        expiresAt: { $gt: new Date() },
        isCurrent: true,
        isDeleted: false,
      })
      .sort({ usageCount: -1, viralityScore: -1 })
      .limit(limit)
      .lean();

    // Cache results
    if (sounds.length > 0) {
      await this.cacheService.set(cacheKey, sounds, {
        tags: ['trends', 'sounds'],
        ttl: this.READ_CACHE_TTL_SECONDS,
      });
      return sounds as TrendingSoundDocument[];
    }

    this.loggerService.debug(
      'No cached trending sounds available; skipping live Apify fetch on read path',
    );
    return [];
  }

  /**
   * Fetch and store trending sounds from Apify (TikTok)
   */
  async fetchAndCacheSounds(limit: number = 12): Promise<void> {
    try {
      const sounds = await this.apifyService.getTikTokSounds(limit);

      if (sounds.length === 0) {
        return;
      }

      const expiresAt = new Date(
        Date.now() + this.TREND_SIGNAL_DOCUMENT_TTL_SECONDS * 1000,
      );

      for (const sound of sounds) {
        await this.trendingSoundModel.findOneAndUpdate(
          { soundId: sound.soundId },
          {
            $set: {
              ...sound,
              expiresAt,
              isCurrent: true,
              isDeleted: false,
              lastSeenAt: new Date(),
            },
          },
          { returnDocument: 'after', upsert: true },
        );
      }

      this.loggerService.log(`Cached ${sounds.length} trending sounds`);
    } catch (error: unknown) {
      this.loggerService.error('Failed to fetch trending sounds', error);
    }
  }

  // ==================== Viral Leaderboard ====================

  /**
   * Get cross-platform viral leaderboard
   */
  async getViralLeaderboard(options?: {
    timeframe?: Timeframe.H24 | Timeframe.H72 | Timeframe.D7;
    limit?: number;
  }): Promise<TrendingVideoDocument[]> {
    const limit = options?.limit || 20;
    const timeframe = options?.timeframe || Timeframe.H24;
    const cacheKey = `${this.CACHE_PREFIX}:leaderboard:${timeframe}`;

    // Check cache first (shorter TTL for leaderboard)
    const cached =
      await this.cacheService.get<TrendingVideoDocument[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Calculate time filter
    const hoursAgo: Record<string, number> = {
      [Timeframe.D7]: 168,
      [Timeframe.H24]: 24,
      [Timeframe.H72]: 72,
    };
    const sinceDate = new Date(
      Date.now() - hoursAgo[timeframe] * 60 * 60 * 1000,
    );

    const videos = await this.trendingVideoModel
      .find({
        createdAt: { $gte: sinceDate },
        isCurrent: true,
        isDeleted: false,
      })
      .sort({ velocity: -1, viralScore: -1 })
      .limit(limit)
      .lean();

    // Cache results with shorter TTL (15 min for leaderboard)
    if (videos.length > 0) {
      await this.cacheService.set(cacheKey, videos, {
        tags: ['trends', 'leaderboard', `leaderboard:${timeframe}`],
        ttl: 900, // 15 minutes
      });
    }

    return videos as TrendingVideoDocument[];
  }

  // ==================== Mark Expired Items ====================

  /**
   * Generic method to mark expired items as historical in any model
   */
  private async markExpiredAsHistorical(
    model: Model<unknown>,
  ): Promise<number> {
    const result = await model.updateMany(
      {
        expiresAt: { $lte: new Date() },
        isCurrent: true,
        isDeleted: false,
      },
      { $set: { isCurrent: false } },
    );
    return result.modifiedCount;
  }

  /**
   * Mark expired videos as historical
   */
  markExpiredVideosAsHistorical(): Promise<number> {
    return this.markExpiredAsHistorical(this.trendingVideoModel);
  }

  /**
   * Mark expired hashtags as historical
   */
  markExpiredHashtagsAsHistorical(): Promise<number> {
    return this.markExpiredAsHistorical(this.trendingHashtagModel);
  }

  /**
   * Mark expired sounds as historical
   */
  markExpiredSoundsAsHistorical(): Promise<number> {
    return this.markExpiredAsHistorical(this.trendingSoundModel);
  }

  // ==================== Trend Turnover Analytics ====================

  /**
   * Aggregate trend appearance and death counts by platform
   * across hashtags, videos, and sounds for a given period.
   */
  async getTurnoverStats(days: 7 | 30 | 90): Promise<TrendTurnoverStats[]> {
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const pipeline = [
      { $match: { createdAt: { $gte: periodStart }, isDeleted: false } },
      {
        $group: {
          _id: '$platform',
          alive: { $sum: { $cond: [{ $eq: ['$isCurrent', true] }, 1, 0] } },
          appeared: { $sum: 1 },
          died: { $sum: { $cond: [{ $eq: ['$isCurrent', false] }, 1, 0] } },
          totalLifespanMs: {
            $sum: {
              $cond: {
                else: 0,
                if: { $eq: ['$isCurrent', false] },
                then: {
                  $subtract: [
                    { $ifNull: ['$lastSeenAt', '$updatedAt'] },
                    '$createdAt',
                  ],
                },
              },
            },
          },
        },
      },
    ];

    const [hashtagResults, videoResults, soundResults] = await Promise.all([
      this.trendingHashtagModel.aggregate<{
        _id: string;
        appeared: number;
        died: number;
        alive: number;
        totalLifespanMs: number;
      }>(pipeline),
      this.trendingVideoModel.aggregate<{
        _id: string;
        appeared: number;
        died: number;
        alive: number;
        totalLifespanMs: number;
      }>(pipeline),
      this.trendingSoundModel.aggregate<{
        _id: string;
        appeared: number;
        died: number;
        alive: number;
        totalLifespanMs: number;
      }>(pipeline),
    ]);

    const platformMap = new Map<
      string,
      { appeared: number; died: number; alive: number; totalLifespanMs: number }
    >();

    for (const row of [...hashtagResults, ...videoResults, ...soundResults]) {
      const existing = platformMap.get(row._id) ?? {
        alive: 0,
        appeared: 0,
        died: 0,
        totalLifespanMs: 0,
      };
      platformMap.set(row._id, {
        alive: existing.alive + row.alive,
        appeared: existing.appeared + row.appeared,
        died: existing.died + row.died,
        totalLifespanMs: existing.totalLifespanMs + row.totalLifespanMs,
      });
    }

    return Array.from(platformMap.entries())
      .map(([platform, stats]) => ({
        alive: stats.alive,
        appeared: stats.appeared,
        avgLifespanDays:
          stats.died > 0
            ? Math.round((stats.totalLifespanMs / stats.died / 86400000) * 10) /
              10
            : 0,
        died: stats.died,
        platform,
        turnoverRate:
          stats.appeared > 0
            ? Math.round((stats.died / stats.appeared) * 100)
            : 0,
      }))
      .sort((a, b) => b.turnoverRate - a.turnoverRate);
  }

  /**
   * Return daily buckets of trend births and deaths for the given period.
   */
  async getTrendTimeline(days: 7 | 30 | 90): Promise<TrendTimelineEntry[]> {
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const birthsPipeline = [
      { $match: { createdAt: { $gte: periodStart }, isDeleted: false } },
      {
        $group: {
          _id: {
            $dateToString: { date: '$createdAt', format: '%Y-%m-%d' },
          },
          count: { $sum: 1 },
        },
      },
    ];

    const deathsPipeline = [
      { $match: { isCurrent: false, isDeleted: false } },
      {
        $addFields: {
          deathDate: { $ifNull: ['$lastSeenAt', '$updatedAt'] },
        },
      },
      { $match: { deathDate: { $gte: periodStart } } },
      {
        $group: {
          _id: {
            $dateToString: { date: '$deathDate', format: '%Y-%m-%d' },
          },
          count: { $sum: 1 },
        },
      },
    ];

    type DayRow = { _id: string; count: number };

    const [hashBirths, vidBirths, sndBirths, hashDeaths, vidDeaths, sndDeaths] =
      await Promise.all([
        this.trendingHashtagModel.aggregate<DayRow>(birthsPipeline),
        this.trendingVideoModel.aggregate<DayRow>(birthsPipeline),
        this.trendingSoundModel.aggregate<DayRow>(birthsPipeline),
        this.trendingHashtagModel.aggregate<DayRow>(deathsPipeline),
        this.trendingVideoModel.aggregate<DayRow>(deathsPipeline),
        this.trendingSoundModel.aggregate<DayRow>(deathsPipeline),
      ]);

    const birthMap = new Map<string, number>();
    for (const row of [...hashBirths, ...vidBirths, ...sndBirths]) {
      birthMap.set(row._id, (birthMap.get(row._id) ?? 0) + row.count);
    }

    const deathMap = new Map<string, number>();
    for (const row of [...hashDeaths, ...vidDeaths, ...sndDeaths]) {
      deathMap.set(row._id, (deathMap.get(row._id) ?? 0) + row.count);
    }

    const allDates = new Set([...birthMap.keys(), ...deathMap.keys()]);

    return Array.from(allDates)
      .sort()
      .map((date) => ({
        appeared: birthMap.get(date) ?? 0,
        date,
        died: deathMap.get(date) ?? 0,
      }));
  }
}
