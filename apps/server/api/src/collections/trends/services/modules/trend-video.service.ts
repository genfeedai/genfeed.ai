import type {
  TrendTimelineEntry,
  TrendTurnoverStats,
} from '@api/collections/trends/interfaces/trend-turnover.interface';
import type { TrendingHashtagDocument } from '@api/collections/trends/schemas/trending-hashtag.schema';
import type { TrendingSoundDocument } from '@api/collections/trends/schemas/trending-sound.schema';
import type { TrendingVideoDocument } from '@api/collections/trends/schemas/trending-video.schema';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Timeframe } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TrendVideoService {
  private readonly CACHE_PREFIX = 'trends';
  private readonly READ_CACHE_TTL_SECONDS = 1800; // 30 minutes
  private readonly TREND_SIGNAL_DOCUMENT_TTL_SECONDS = 48 * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
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

    // Fetch all non-deleted records and filter in-memory
    const now = new Date();
    const docs = await this.prisma.trendingVideo.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit * 5,
      where: { isDeleted: false },
    });

    const videos = docs
      .map((doc) => doc.data as unknown as TrendingVideoDocument)
      .filter((v) => {
        if (!v.isCurrent) return false;
        if (v.expiresAt && new Date(v.expiresAt) <= now) return false;
        if (platform && v.platform !== platform) return false;
        if (minViralScore != null && (v.viralScore ?? 0) < minViralScore)
          return false;
        return true;
      })
      .sort(
        (a, b) =>
          (b.viewCount ?? 0) - (a.viewCount ?? 0) ||
          (b.viralScore ?? 0) - (a.viralScore ?? 0),
      )
      .slice(0, limit);

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
      return videos;
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
        const externalId = video.externalId as string | undefined;

        // Find existing record by externalId + platform in data (in-memory match)
        if (externalId) {
          // Find the actual match via in-memory check
          const allDocs = await this.prisma.trendingVideo.findMany({
            orderBy: { createdAt: 'desc' },
            take: 1000,
            where: { isDeleted: false },
          });
          const match = allDocs.find((doc) => {
            const d = doc.data as unknown as Record<string, unknown>;
            return d.externalId === externalId && d.platform === platform;
          });

          const dataPayload = {
            ...video,
            expiresAt,
            isCurrent: true,
            isDeleted: false,
            lastSeenAt: new Date(),
          };

          if (match) {
            await this.prisma.trendingVideo.update({
              data: { data: dataPayload as never },
              where: { id: match.id },
            });
          } else {
            await this.prisma.trendingVideo.create({
              data: { data: dataPayload as never, isDeleted: false },
            });
          }
        } else {
          await this.prisma.trendingVideo.create({
            data: {
              data: {
                ...video,
                expiresAt,
                isCurrent: true,
                isDeleted: false,
                lastSeenAt: new Date(),
              } as never,
              isDeleted: false,
            },
          });
        }
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

    const now = new Date();
    const docs = await this.prisma.trendingHashtag.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit * 5,
      where: { isDeleted: false },
    });

    const hashtags = docs
      .map((doc) => doc.data as unknown as TrendingHashtagDocument)
      .filter((h) => {
        if (!h.isCurrent) return false;
        if (h.expiresAt && new Date(h.expiresAt) <= now) return false;
        if (platform && h.platform !== platform) return false;
        return true;
      })
      .sort(
        (a, b) =>
          (b.postCount ?? 0) - (a.postCount ?? 0) ||
          (b.viralityScore ?? 0) - (a.viralityScore ?? 0),
      )
      .slice(0, limit);

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
      return hashtags;
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
        const hashtagKey = (hashtag as unknown as Record<string, unknown>)
          .hashtag as string | undefined;

        const allDocs = await this.prisma.trendingHashtag.findMany({
          orderBy: { createdAt: 'desc' },
          take: 1000,
          where: { isDeleted: false },
        });
        const match = hashtagKey
          ? allDocs.find((doc) => {
              const d = doc.data as unknown as Record<string, unknown>;
              return d.hashtag === hashtagKey && d.platform === platform;
            })
          : undefined;

        const dataPayload = {
          ...hashtag,
          expiresAt,
          isCurrent: true,
          isDeleted: false,
          lastSeenAt: new Date(),
        };

        if (match) {
          await this.prisma.trendingHashtag.update({
            data: { data: dataPayload as never },
            where: { id: match.id },
          });
        } else {
          await this.prisma.trendingHashtag.create({
            data: { data: dataPayload as never, isDeleted: false },
          });
        }
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

    const now = new Date();
    const docs = await this.prisma.trendingSound.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit * 5,
      where: { isDeleted: false },
    });

    const sounds = docs
      .map((doc) => doc.data as unknown as TrendingSoundDocument)
      .filter((s) => {
        if (!s.isCurrent) return false;
        if (s.expiresAt && new Date(s.expiresAt) <= now) return false;
        return true;
      })
      .sort(
        (a, b) =>
          (b.usageCount ?? 0) - (a.usageCount ?? 0) ||
          (b.viralityScore ?? 0) - (a.viralityScore ?? 0),
      )
      .slice(0, limit);

    // Cache results
    if (sounds.length > 0) {
      await this.cacheService.set(cacheKey, sounds, {
        tags: ['trends', 'sounds'],
        ttl: this.READ_CACHE_TTL_SECONDS,
      });
      return sounds;
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
        const soundId = (sound as unknown as Record<string, unknown>).soundId as
          | string
          | undefined;

        const allDocs = await this.prisma.trendingSound.findMany({
          orderBy: { createdAt: 'desc' },
          take: 1000,
          where: { isDeleted: false },
        });
        const match = soundId
          ? allDocs.find((doc) => {
              const d = doc.data as unknown as Record<string, unknown>;
              return d.soundId === soundId;
            })
          : undefined;

        const dataPayload = {
          ...sound,
          expiresAt,
          isCurrent: true,
          isDeleted: false,
          lastSeenAt: new Date(),
        };

        if (match) {
          await this.prisma.trendingSound.update({
            data: { data: dataPayload as never },
            where: { id: match.id },
          });
        } else {
          await this.prisma.trendingSound.create({
            data: { data: dataPayload as never, isDeleted: false },
          });
        }
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

    const docs = await this.prisma.trendingVideo.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit * 5,
      where: {
        createdAt: { gte: sinceDate },
        isDeleted: false,
      },
    });

    const videos = docs
      .map((doc) => doc.data as unknown as TrendingVideoDocument)
      .filter((v) => v.isCurrent)
      .sort(
        (a, b) =>
          (b.velocity ?? 0) - (a.velocity ?? 0) ||
          (b.viralScore ?? 0) - (a.viralScore ?? 0),
      )
      .slice(0, limit);

    // Cache results with shorter TTL (15 min for leaderboard)
    if (videos.length > 0) {
      await this.cacheService.set(cacheKey, videos, {
        tags: ['trends', 'leaderboard', `leaderboard:${timeframe}`],
        ttl: 900, // 15 minutes
      });
    }

    return videos;
  }

  // ==================== Mark Expired Items ====================

  /**
   * Mark expired videos as historical
   */
  async markExpiredVideosAsHistorical(): Promise<number> {
    return this.markExpiredAsHistoricalForModel('video');
  }

  /**
   * Mark expired hashtags as historical
   */
  async markExpiredHashtagsAsHistorical(): Promise<number> {
    return this.markExpiredAsHistoricalForModel('hashtag');
  }

  /**
   * Mark expired sounds as historical
   */
  async markExpiredSoundsAsHistorical(): Promise<number> {
    return this.markExpiredAsHistoricalForModel('sound');
  }

  /**
   * Mark expired items as historical for a given model type.
   * Since isCurrent/expiresAt live in the JSON `data` blob, we fetch current records,
   * filter expired ones in memory, and update them individually.
   */
  private async markExpiredAsHistoricalForModel(
    modelType: 'video' | 'hashtag' | 'sound',
  ): Promise<number> {
    const now = new Date();

    const fetchFn = {
      hashtag: () =>
        this.prisma.trendingHashtag.findMany({ where: { isDeleted: false } }),
      sound: () =>
        this.prisma.trendingSound.findMany({ where: { isDeleted: false } }),
      video: () =>
        this.prisma.trendingVideo.findMany({ where: { isDeleted: false } }),
    }[modelType];

    const docs = await fetchFn();
    const expired = docs.filter((doc) => {
      const d = doc.data as unknown as Record<string, unknown>;
      return (
        d.isCurrent === true &&
        d.expiresAt != null &&
        new Date(d.expiresAt as string) <= now
      );
    });

    for (const doc of expired) {
      const d = doc.data as unknown as Record<string, unknown>;
      const updatedData = { ...d, isCurrent: false };

      if (modelType === 'video') {
        await this.prisma.trendingVideo.update({
          data: { data: updatedData as never },
          where: { id: doc.id },
        });
      } else if (modelType === 'hashtag') {
        await this.prisma.trendingHashtag.update({
          data: { data: updatedData as never },
          where: { id: doc.id },
        });
      } else {
        await this.prisma.trendingSound.update({
          data: { data: updatedData as never },
          where: { id: doc.id },
        });
      }
    }

    return expired.length;
  }

  // ==================== Trend Turnover Analytics ====================

  /**
   * Aggregate trend appearance and death counts by platform
   * across hashtags, videos, and sounds for a given period.
   */
  async getTurnoverStats(days: 7 | 30 | 90): Promise<TrendTurnoverStats[]> {
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [hashtagDocs, videoDocs, soundDocs] = await Promise.all([
      this.prisma.trendingHashtag.findMany({
        where: { createdAt: { gte: periodStart }, isDeleted: false },
      }),
      this.prisma.trendingVideo.findMany({
        where: { createdAt: { gte: periodStart }, isDeleted: false },
      }),
      this.prisma.trendingSound.findMany({
        where: { createdAt: { gte: periodStart }, isDeleted: false },
      }),
    ]);

    type DocRow = { data: unknown; createdAt: Date };
    const allDocs: DocRow[] = [
      ...hashtagDocs.map((d) => ({ createdAt: d.createdAt, data: d.data })),
      ...videoDocs.map((d) => ({ createdAt: d.createdAt, data: d.data })),
      ...soundDocs.map((d) => ({ createdAt: d.createdAt, data: d.data })),
    ];

    const platformMap = new Map<
      string,
      { appeared: number; died: number; alive: number; totalLifespanMs: number }
    >();

    for (const row of allDocs) {
      const d = row.data as Record<string, unknown>;
      const platform = (d.platform as string) || 'unknown';
      const isCurrent = d.isCurrent === true;
      const lastSeenAt = d.lastSeenAt
        ? new Date(d.lastSeenAt as string)
        : row.createdAt;
      const lifespanMs = isCurrent
        ? 0
        : lastSeenAt.getTime() - row.createdAt.getTime();

      const existing = platformMap.get(platform) ?? {
        alive: 0,
        appeared: 0,
        died: 0,
        totalLifespanMs: 0,
      };
      platformMap.set(platform, {
        alive: existing.alive + (isCurrent ? 1 : 0),
        appeared: existing.appeared + 1,
        died: existing.died + (isCurrent ? 0 : 1),
        totalLifespanMs: existing.totalLifespanMs + lifespanMs,
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

    const [hashtagDocs, videoDocs, soundDocs] = await Promise.all([
      this.prisma.trendingHashtag.findMany({
        where: { isDeleted: false },
      }),
      this.prisma.trendingVideo.findMany({
        where: { isDeleted: false },
      }),
      this.prisma.trendingSound.findMany({
        where: { isDeleted: false },
      }),
    ]);

    type DocRow = { data: unknown; createdAt: Date };
    const allDocs: DocRow[] = [
      ...hashtagDocs.map((d) => ({ createdAt: d.createdAt, data: d.data })),
      ...videoDocs.map((d) => ({ createdAt: d.createdAt, data: d.data })),
      ...soundDocs.map((d) => ({ createdAt: d.createdAt, data: d.data })),
    ];

    const birthMap = new Map<string, number>();
    const deathMap = new Map<string, number>();

    for (const row of allDocs) {
      const d = row.data as Record<string, unknown>;
      const isCurrent = d.isCurrent === true;

      // births: created within the period
      if (row.createdAt >= periodStart) {
        const dateStr = row.createdAt.toISOString().slice(0, 10);
        birthMap.set(dateStr, (birthMap.get(dateStr) ?? 0) + 1);
      }

      // deaths: not current, with lastSeenAt/updatedAt within period
      if (!isCurrent && d.lastSeenAt) {
        const deathDate = new Date(d.lastSeenAt as string);
        if (deathDate >= periodStart) {
          const dateStr = deathDate.toISOString().slice(0, 10);
          deathMap.set(dateStr, (deathMap.get(dateStr) ?? 0) + 1);
        }
      }
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
