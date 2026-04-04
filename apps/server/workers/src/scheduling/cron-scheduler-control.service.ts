import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@workers/config/config.service';

@Injectable()
export class CronSchedulerControlService implements OnApplicationBootstrap {
  private readonly context = 'CronSchedulerControlService';

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.configService.isDevSchedulersEnabled) {
      return;
    }

    const cronJobs = this.schedulerRegistry.getCronJobs();

    for (const [, job] of cronJobs) {
      job.stop();
    }

    this.logger.log(
      `Disabled ${cronJobs.size} cron jobs for local development (set GF_DEV_ENABLE_SCHEDULERS=true to enable)`,
      this.context,
    );
  }
}
