import { AiInfluencerService } from '@api/services/ai-influencer/ai-influencer.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CronAiInfluencerService {
  private static readonly LOCK_KEY = 'cron:ai-influencer-daily';
  private static readonly LOCK_TTL_SECONDS = 1800; // 30 minutes

  constructor(
    private readonly aiInfluencerService: AiInfluencerService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Run daily autopilot posts for all AI influencer personas.
   * Runs every 6 hours in production (disabled in development).
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async runDailyInfluencerPosts(): Promise<void> {
    const acquired = await this.cacheService.acquireLock(
      CronAiInfluencerService.LOCK_KEY,
      CronAiInfluencerService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return void this.logger.debug(
        'AI influencer cron already running (lock held), skipping',
        'CronAiInfluencerService',
      );
    }

    const startTime = Date.now();

    try {
      this.logger.log(
        'Starting AI influencer daily posts cycle',
        'CronAiInfluencerService',
      );

      const results = await this.aiInfluencerService.scheduleDailyPosts();

      const duration = Date.now() - startTime;
      this.logger.log(
        `AI influencer daily posts completed in ${duration}ms (${results.length} posts generated)`,
        'CronAiInfluencerService',
      );
    } catch (error: unknown) {
      this.logger.error(
        'AI influencer daily posts cycle failed',
        error,
        'CronAiInfluencerService',
      );
    } finally {
      await this.cacheService.releaseLock(CronAiInfluencerService.LOCK_KEY);
    }
  }
}
