import { TrendsService } from '@api/collections/trends/services/trends.service';
import { ConfigService } from '@api/config/config.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

type WarmupTask = {
  label: string;
  run: () => Promise<void>;
};

@Injectable()
export class TrendsWarmupService implements OnModuleInit {
  private readonly constructorName = String(this.constructor.name);
  private readonly WARMUP_LOCK_KEY = 'trends:global-warmup';
  private readonly WARMUP_LOCK_TTL_SECONDS = 30 * 60;
  private readonly STARTUP_WARMUP_MIN_ACTIVE_TRENDS = 50;
  private readonly STARTUP_WARMUP_MIN_REFERENCE_RECORDS = 100;
  private readonly HASHTAG_PLATFORMS = [
    'tiktok',
    'instagram',
    'twitter',
  ] as const;
  private readonly VIDEO_PLATFORMS = [
    'tiktok',
    'instagram',
    'youtube',
    'reddit',
  ] as const;

  constructor(
    private readonly configService: ConfigService,
    private readonly trendsService: TrendsService,
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    if (!this.configService.isDevSchedulersEnabled) {
      this.loggerService.log(
        'Trend warmup scheduler disabled for local development',
        this.constructorName,
      );
      return;
    }

    void this.warmGlobalTrendDatasetsOnStartup();
  }

  @Cron('0 15 0,12 * * *', {
    timeZone: 'UTC',
  })
  async warmGlobalTrendDatasets(): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) {
      return;
    }

    const didRun = await this.cacheService.withLock(
      this.WARMUP_LOCK_KEY,
      async () => {
        const tasks: WarmupTask[] = [
          {
            label: 'global-trends',
            run: async () => {
              await this.trendsService.refreshTrends();
            },
          },
          ...this.VIDEO_PLATFORMS.map((platform) => ({
            label: `viral-videos:${platform}`,
            run: async () => {
              await this.trendsService.fetchAndCacheViralVideos(platform);
            },
          })),
          ...this.HASHTAG_PLATFORMS.map((platform) => ({
            label: `hashtags:${platform}`,
            run: async () => {
              await this.trendsService.fetchAndCacheHashtags(platform);
            },
          })),
          {
            label: 'sounds:tiktok',
            run: async () => {
              await this.trendsService.fetchAndCacheSounds();
            },
          },
          {
            label: 'source-preview',
            run: async () => {
              await this.trendsService.precomputeGlobalTrendSourcePreview();
            },
          },
        ];

        this.loggerService.log(
          `Starting scheduled trend warmup with ${tasks.length} tasks`,
          this.constructorName,
        );

        const results = await Promise.allSettled(
          tasks.map(async (task) => {
            await task.run();
            return task.label;
          }),
        );

        const failedTasks = results.flatMap((result, index) =>
          result.status === 'rejected'
            ? [
                `${tasks[index]?.label || 'unknown'}: ${
                  result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason)
                }`,
              ]
            : [],
        );

        if (failedTasks.length > 0) {
          this.loggerService.warn(
            `Scheduled trend warmup completed with failures: ${failedTasks.join('; ')}`,
            this.constructorName,
          );
          return;
        }

        this.loggerService.log(
          'Scheduled trend warmup completed successfully',
          this.constructorName,
        );
      },
      this.WARMUP_LOCK_TTL_SECONDS,
    );

    if (didRun === null) {
      this.loggerService.log(
        'Skipping scheduled trend warmup because another instance already holds the lock',
        this.constructorName,
      );
    }
  }

  private async warmGlobalTrendDatasetsOnStartup(): Promise<void> {
    try {
      const stats = await this.trendsService.getGlobalCorpusStats();

      if (
        stats.activeTrends >= this.STARTUP_WARMUP_MIN_ACTIVE_TRENDS &&
        stats.referenceRecords >= this.STARTUP_WARMUP_MIN_REFERENCE_RECORDS
      ) {
        this.loggerService.log(
          `Skipping startup trend warmup because corpus thresholds are already satisfied (${stats.activeTrends} active trends, ${stats.referenceRecords} references)`,
          this.constructorName,
        );
        return;
      }

      this.loggerService.log(
        `Starting startup trend warmup because corpus is below threshold (${stats.activeTrends} active trends, ${stats.referenceRecords} references)`,
        this.constructorName,
      );

      await this.warmGlobalTrendDatasets();
    } catch (error: unknown) {
      this.loggerService.warn(
        `Startup trend warmup check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        this.constructorName,
      );
    }
  }
}
