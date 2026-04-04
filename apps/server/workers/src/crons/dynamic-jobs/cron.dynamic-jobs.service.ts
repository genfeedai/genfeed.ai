import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CronDynamicJobsService {
  private static readonly LOCK_KEY = 'cron:dynamic-jobs';
  private static readonly LOCK_TTL_SECONDS = 300;

  constructor(
    private readonly cronJobsService: CronJobsService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueDynamicJobs(): Promise<void> {
    const acquired = await this.cacheService.acquireLock(
      CronDynamicJobsService.LOCK_KEY,
      CronDynamicJobsService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      this.logger.debug(
        'Dynamic cron job scheduler already running (lock held), skipping',
        'CronDynamicJobsService',
      );
      return;
    }

    try {
      const processed = await this.cronJobsService.processDueJobs();
      this.logger.log(
        `Dynamic cron cycle processed ${processed} jobs`,
        'CronDynamicJobsService',
      );
    } catch (error: unknown) {
      this.logger.error(
        'Dynamic cron cycle failed',
        error,
        'CronDynamicJobsService',
      );
    } finally {
      await this.cacheService.releaseLock(CronDynamicJobsService.LOCK_KEY);
    }
  }
}
