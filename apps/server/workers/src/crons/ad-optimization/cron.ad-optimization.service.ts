import { randomUUID } from 'node:crypto';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import type { AdOptimizationJobData } from '@api/queues/ad-optimization/ad-optimization.processor';
import { QueueService } from '@api/queues/core/queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class CronAdOptimizationService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly QUEUE_NAME = 'ad-optimization';
  private readonly LOCK_KEY = 'cron:ad-optimization';
  private readonly LOCK_TTL_SECONDS = 900;
  private readonly MAX_JITTER_MS = 15 * 60 * 1000;

  constructor(
    private readonly logger: LoggerService,
    private readonly queueService: QueueService,
    private readonly cacheService: CacheService,
    private readonly optimizationConfigService: AdOptimizationConfigsService,
  ) {}

  @Cron('0 4 * * *') // 4 AM daily
  async runOptimization(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const acquired = await this.cacheService.acquireLock(
      this.LOCK_KEY,
      this.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      this.logger.log(`${url} skipped: lock not acquired`);
      return;
    }

    try {
      this.logger.log(`${url} started`);

      const enabledConfigs =
        await this.optimizationConfigService.findAllEnabled();

      if (enabledConfigs.length === 0) {
        this.logger.log(`${url} completed: no enabled optimization configs`);
        return;
      }

      const runId = randomUUID();

      for (const config of enabledConfigs) {
        const jitterMs = Math.random() * this.MAX_JITTER_MS;
        const orgId = String(config.organization);

        const jobData: AdOptimizationJobData = {
          configId: String(config._id),
          organizationId: orgId,
          runId,
        };

        await this.queueService.add(this.QUEUE_NAME, jobData, {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          delay: jitterMs,
        });

        this.logger.log(
          `${this.constructorName}: Enqueued optimization for org ${orgId} with ${Math.round(jitterMs / 1000)}s jitter`,
        );
      }

      this.logger.log(
        `${url} completed: enqueued ${enabledConfigs.length} optimization jobs with runId ${runId}`,
      );
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    } finally {
      await this.cacheService.releaseLock(this.LOCK_KEY);
    }
  }
}
