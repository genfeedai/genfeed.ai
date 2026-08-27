import { TrendsService } from '@api/collections/trends/services/trends.service';
import { CacheService } from '@server/services/cache/cache.service';
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
  private readonly BACKFILL_COOLDOWN_KEY = 'cron:trends:backfill:cooldown';
  private readonly BACKFILL_ATTEMPTS_KEY = 'cron:trends:backfill:attempts';
  private readonly BACKFILL_BASE_COOLDOWN_SECONDS = 60 * 60; // 1 hour
  private readonly BACKFILL_MAX_COOLDOWN_SECONDS = 12 * 60 * 60; // 12 hours
  private readonly BACKFILL_ATTEMPTS_TTL_SECONDS = 24 * 60 * 60;

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
          await this.clearBackfillBackoff();
          this.loggerService.log(
            `${url} skipped - corpus thresholds already satisfied`,
            stats,
          );
          return {
            skipped: true,
            stats,
          };
        }

        const attempts = await this.getBackfillAttempts();
        const cooldownSeconds = this.resolveBackfillCooldownSeconds(attempts);
        const claim = await this.cacheService.claimOnce(
          this.BACKFILL_COOLDOWN_KEY,
          cooldownSeconds,
        );

        // Each backfill costs a full round of billed Apify actor runs. When the
        // corpus stays short — a failing account, a rate limit, a genuinely thin
        // platform — re-running every 30 minutes just burns credit, so the
        // window widens until something actually lands.
        if (claim === 'duplicate') {
          this.loggerService.log(
            `${url} skipped - backing off after unproductive backfills`,
            { attempts, cooldownSeconds, stats },
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
          const isProductive =
            updatedStats.activeTrends > stats.activeTrends ||
            updatedStats.referenceRecords > stats.referenceRecords;

          if (isProductive) {
            await this.clearBackfillBackoff();
          } else {
            await this.recordUnproductiveBackfill(attempts);
            this.loggerService.warn(
              `${url} produced no new corpus records - widening the back-off window`,
              { attempts: attempts + 1, stats: updatedStats },
            );
          }

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
          await this.recordUnproductiveBackfill(attempts);
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

  private async getBackfillAttempts(): Promise<number> {
    const stored = await this.cacheService.get<number>(
      this.BACKFILL_ATTEMPTS_KEY,
    );

    return typeof stored === 'number' && stored > 0 ? stored : 0;
  }

  /**
   * Doubles the wait after each unproductive backfill, capped so the corpus is
   * still retried at least twice a day.
   */
  private resolveBackfillCooldownSeconds(attempts: number): number {
    return Math.min(
      this.BACKFILL_BASE_COOLDOWN_SECONDS * 2 ** attempts,
      this.BACKFILL_MAX_COOLDOWN_SECONDS,
    );
  }

  private async recordUnproductiveBackfill(attempts: number): Promise<void> {
    await this.cacheService.set(this.BACKFILL_ATTEMPTS_KEY, attempts + 1, {
      ttl: this.BACKFILL_ATTEMPTS_TTL_SECONDS,
    });
  }

  private async clearBackfillBackoff(): Promise<void> {
    await this.cacheService.del(this.BACKFILL_ATTEMPTS_KEY);
    await this.cacheService.del(this.BACKFILL_COOLDOWN_KEY);
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
