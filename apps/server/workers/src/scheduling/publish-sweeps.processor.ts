import { PUBLISH_SWEEP_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import { PlatformPublishingTaskHandlers } from '@workers/scheduling/platform-publishing-task-handlers.service';
import {
  isPublishSweepTask,
  type PlatformTaskHandler,
  type PublishSweepTaskName,
} from '@workers/scheduling/platform-schedules.constants';
import type { Job } from 'bullmq';

/**
 * Runs the per-minute publishing sweeps (uploads ahead of time, due posts,
 * thread comments) on a
 * queue of their own. On `system-sweeps` they waited behind every other
 * platform task for a processor that runs one job at a time, which delayed a
 * due post by up to half a minute whenever an hourly task was running.
 *
 * Concurrency 3 gives each sweep its own slot, so a long upload run or a post
 * sweep paging through a burst does not hold back the others. Each sweep
 * takes its own Redis lock, so two slots never run the same sweep.
 */
@Injectable()
@Processor(PUBLISH_SWEEP_QUEUE, { concurrency: 3 })
export class PublishSweepsProcessor extends WorkerHost {
  private readonly context = PublishSweepsProcessor.name;
  private readonly handlers: Record<PublishSweepTaskName, PlatformTaskHandler>;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    publishingTasks: PlatformPublishingTaskHandlers,
  ) {
    super();
    this.handlers = publishingTasks.createPublishSweepHandlers();
  }

  async process(job: Job): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) {
      this.logger.debug(
        `Skipping publish sweep ${job.name}: schedulers disabled for local development`,
        this.context,
      );
      return;
    }

    if (!isPublishSweepTask(job.name)) {
      this.logger.warn(
        `Skipping publish sweep ${job.name}: this worker version does not know the task`,
        this.context,
      );
      return;
    }

    await this.handlers[job.name](job);
  }
}
