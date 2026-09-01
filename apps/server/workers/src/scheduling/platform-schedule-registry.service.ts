import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import {
  PLATFORM_SCHEDULE_CATALOG,
  PLATFORM_SCHEDULE_QUEUE,
  type PlatformScheduledTaskName,
  platformSchedulerId,
  RETIRED_SYSTEM_SWEEP_SCHEDULER_IDS,
} from '@workers/scheduling/platform-schedules.constants';
import { Queue } from 'bullmq';

@Injectable()
export class PlatformScheduleRegistryService implements OnApplicationBootstrap {
  private readonly context = PlatformScheduleRegistryService.name;

  constructor(
    @InjectQueue(PLATFORM_SCHEDULE_QUEUE)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) {
      this.logger.log(
        'Platform schedules disabled for local development (set GF_DEV_ENABLE_SCHEDULERS=true to enable)',
        this.context,
      );
      return;
    }

    await this.reconcile();
  }

  async reconcile(): Promise<void> {
    const desiredSchedulerIds = new Set<string>();
    const entries = Object.entries(PLATFORM_SCHEDULE_CATALOG) as Array<
      [PlatformScheduledTaskName, { pattern: string; timezone: 'UTC' }]
    >;

    for (const [taskName, schedule] of entries) {
      const schedulerId = platformSchedulerId(taskName);
      desiredSchedulerIds.add(schedulerId);

      await this.queue.upsertJobScheduler(
        schedulerId,
        { pattern: schedule.pattern, tz: schedule.timezone },
        {
          name: taskName,
          opts: {
            attempts: 1,
            removeOnComplete: 20,
            removeOnFail: 50,
          },
        },
      );
    }

    const currentSchedulers = await this.queue.getJobSchedulers(0, -1, true);
    for (const scheduler of currentSchedulers) {
      if (
        !scheduler.key ||
        desiredSchedulerIds.has(scheduler.key) ||
        (!scheduler.key.startsWith('platform:') &&
          !RETIRED_SYSTEM_SWEEP_SCHEDULER_IDS.has(scheduler.key))
      ) {
        continue;
      }

      await this.queue.removeJobScheduler(scheduler.key);
      this.logger.log(
        `Removed retired platform scheduler ${scheduler.key}`,
        this.context,
      );
    }

    this.logger.log(
      `Reconciled ${desiredSchedulerIds.size} platform schedules`,
      this.context,
    );
  }
}
