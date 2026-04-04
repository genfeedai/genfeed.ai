import { TrendsService } from '@api/collections/trends/services/trends.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@workers/config/config.service';

@Injectable()
export class CronTrendsService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly REFRESH_LOCK_KEY = 'cron:trends:refresh';
  private readonly BACKFILL_LOCK_KEY = 'cron:trends:backfill';
  private readonly LOCK_TTL_SECONDS = 900; // 15 minute lock
  private readonly BACKFILL_MIN_ACTIVE_TRENDS = 50;
  private readonly BACKFILL_MIN_REFERENCE_RECORDS = 100;

  constructor(
    private readonly trendsService: TrendsService,
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Refresh global trends daily at 6 AM UTC
   * Uses distributed locking to prevent multiple instances from running simultaneously
   * Historical trends are preserved for AI analysis
   * Fallback chain: Grok-4 → Apify → empty (works without APIFY_API_TOKEN)
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async refreshGlobalTrends() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.configService.isDevSchedulersEnabled) {
      this.loggerService.log(
        `${url} skipped - local schedulers disabled (set GF_DEV_ENABLE_SCHEDULERS=true to enable)`,
      );
      return;
    }

    // Use distributed lock to prevent multiple instances from running
    const result = await this.cacheService.withLock(
      this.REFRESH_LOCK_KEY,
      async () => {
        this.loggerService.log(`${url} started`);

        try {
          const trendsResults = await this.refreshGlobalTrendDatasets({
            logPrefix: url,
            markExpiredAsHistorical: true,
          });

          this.loggerService.log(`${url} completed`, {
            trendsResults,
          });

          return { success: true, trendsResults };
        } catch (error: unknown) {
          this.loggerService.error(`${url} failed`, error);
          return { error, success: false };
        }
      },
      this.LOCK_TTL_SECONDS,
    );

    if (result === null) {
      this.loggerService.log(
        `${url} skipped - lock already held by another instance`,
      );
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async backfillGlobalTrendCorpus() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.configService.isDevSchedulersEnabled) {
      this.loggerService.log(
        `${url} skipped - local schedulers disabled (set GF_DEV_ENABLE_SCHEDULERS=true to enable)`,
      );
      return;
    }

    const result = await this.cacheService.withLock(
      this.BACKFILL_LOCK_KEY,
      async () => {
        const stats = await this.trendsService.getGlobalCorpusStats();

        this.loggerService.log(`${url} evaluated corpus state`, stats);

        if (
          stats.activeTrends >= this.BACKFILL_MIN_ACTIVE_TRENDS &&
          stats.referenceRecords >= this.BACKFILL_MIN_REFERENCE_RECORDS
        ) {
          this.loggerService.log(
            `${url} skipped - corpus thresholds already satisfied`,
            stats,
          );
          return {
            skipped: true,
            stats,
          };
        }

        this.loggerService.log(`${url} started`);

        try {
          const trendsResults = await this.refreshGlobalTrendDatasets({
            logPrefix: url,
            markExpiredAsHistorical: stats.activeTrends > 0,
          });
          const updatedStats = await this.trendsService.getGlobalCorpusStats();

          this.loggerService.log(`${url} completed`, {
            stats: updatedStats,
            trendsResults,
          });

          return {
            skipped: false,
            stats: updatedStats,
            trendsResults,
          };
        } catch (error: unknown) {
          this.loggerService.error(`${url} failed`, error);
          return { error, success: false };
        }
      },
      this.LOCK_TTL_SECONDS,
    );

    if (result === null) {
      this.loggerService.log(
        `${url} skipped - lock already held by another instance`,
      );
    }
  }

  private async refreshGlobalTrendDatasets(options: {
    logPrefix: string;
    markExpiredAsHistorical: boolean;
  }): Promise<Record<string, number>> {
    if (options.markExpiredAsHistorical) {
      const [expiredTrends, expiredVideos, expiredHashtags, expiredSounds] =
        await Promise.all([
          this.trendsService.markExpiredTrendsAsHistorical(),
          this.trendsService.markExpiredVideosAsHistorical(),
          this.trendsService.markExpiredHashtagsAsHistorical(),
          this.trendsService.markExpiredSoundsAsHistorical(),
        ]);

      this.loggerService.log(
        `${options.logPrefix} marked expired items as historical`,
        {
          expiredHashtags,
          expiredSounds,
          expiredTrends,
          expiredVideos,
        },
      );
    }

    const globalTrends = await this.trendsService.fetchAndCacheTrends();
    const platforms = [
      'tiktok',
      'instagram',
      'twitter',
      'youtube',
      'reddit',
      'pinterest',
    ];
    const trendsResults: Record<string, number> = {
      global: globalTrends.length,
    };

    for (const platform of platforms) {
      try {
        if (['tiktok', 'instagram', 'youtube', 'reddit'].includes(platform)) {
          await this.trendsService.fetchAndCacheViralVideos(platform);
        }

        if (['tiktok', 'instagram', 'twitter'].includes(platform)) {
          await this.trendsService.fetchAndCacheHashtags(platform);
        }

        trendsResults[platform] = 1;
      } catch (error: unknown) {
        this.loggerService.error(
          `${options.logPrefix} failed for platform ${platform}`,
          error,
        );
      }
    }

    try {
      await this.trendsService.fetchAndCacheSounds();
    } catch (error: unknown) {
      this.loggerService.error(
        `${options.logPrefix} failed to fetch sounds`,
        error,
      );
    }

    return trendsResults;
  }
}
