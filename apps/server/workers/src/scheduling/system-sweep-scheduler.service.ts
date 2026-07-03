import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import {
  SYSTEM_SWEEP_DEFINITIONS,
  SYSTEM_SWEEPS_QUEUE,
} from '@workers/scheduling/system-sweeps.constants';
import { Queue } from 'bullmq';

/**
 * Registers BullMQ Job Schedulers for tenant-product sweeps on bootstrap.
 *
 * upsertJobScheduler is idempotent per scheduler id, so any number of worker
 * replicas can register concurrently and each schedule still fires exactly
 * once. Stale schedulers (removed from the manifest) are cleaned up so
 * retired sweeps stop firing without manual Redis surgery.
 */
@Injectable()
export class SystemSweepSchedulerService implements OnApplicationBootstrap {
  private readonly context = 'SystemSweepSchedulerService';

  constructor(
    @InjectQueue(SYSTEM_SWEEPS_QUEUE)
    private readonly systemSweepsQueue: Queue,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) {
      this.logger.log(
        'System sweep schedulers disabled for local development (set GF_DEV_ENABLE_SCHEDULERS=true to enable)',
        this.context,
      );
      return;
    }

    await this.syncSweepSchedulers();
  }

  async syncSweepSchedulers(): Promise<void> {
    for (const definition of SYSTEM_SWEEP_DEFINITIONS) {
      await this.systemSweepsQueue.upsertJobScheduler(
        definition.jobName,
        { pattern: definition.pattern, tz: definition.timezone },
        {
          name: definition.jobName,
          opts: {
            // Sweeps are self-repeating; a failed run is retried by the next
            // scheduled fire, never by BullMQ attempts (avoids overlap).
            attempts: 1,
            removeOnComplete: 20,
            removeOnFail: 50,
          },
        },
      );

      this.logger.log(
        `Registered system sweep scheduler ${definition.jobName} (${definition.pattern} ${definition.timezone})`,
        this.context,
      );
    }

    await this.removeStaleSweepSchedulers();
  }

  private async removeStaleSweepSchedulers(): Promise<void> {
    const knownJobNames = new Set<string>(
      SYSTEM_SWEEP_DEFINITIONS.map((definition) => definition.jobName),
    );
    const schedulers = await this.systemSweepsQueue.getJobSchedulers(
      0,
      -1,
      true,
    );

    for (const scheduler of schedulers) {
      if (!scheduler.key || knownJobNames.has(scheduler.key)) {
        continue;
      }

      await this.systemSweepsQueue.removeJobScheduler(scheduler.key);
      this.logger.log(
        `Removed stale system sweep scheduler ${scheduler.key}`,
        this.context,
      );
    }
  }
}
