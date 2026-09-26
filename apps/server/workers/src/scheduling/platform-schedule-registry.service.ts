import type { WorkflowExecutionJobData } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  PLATFORM_WORKFLOW_SCHEDULE_SOURCE,
  PROACTIVE_AGENT_TURN_SOURCE,
} from '@api/collections/workflows/system-workflow-definition';
import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import {
  PLATFORM_SCHEDULE_CATALOG,
  PLATFORM_SCHEDULE_QUEUE,
  type PlatformSchedule,
  type PlatformScheduledTaskName,
  platformSchedulerId,
  RETIRED_SYSTEM_SWEEP_SCHEDULER_IDS,
} from '@workers/scheduling/platform-schedules.constants';
import { Queue } from 'bullmq';

/**
 * Platform-originated `source` values that used to enqueue onto
 * `WORKFLOW_EXECUTION_QUEUE` before #5162 and now route to
 * `PLATFORM_SYSTEM_WORKFLOW_QUEUE` instead.
 */
const DRAINED_JOB_SOURCES = new Set<string>([
  PLATFORM_WORKFLOW_SCHEDULE_SOURCE,
  PROACTIVE_AGENT_TURN_SOURCE,
]);

@Injectable()
export class PlatformScheduleRegistryService implements OnApplicationBootstrap {
  private readonly context = PlatformScheduleRegistryService.name;

  constructor(
    @InjectQueue(PLATFORM_SCHEDULE_QUEUE)
    private readonly queue: Queue,
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly workflowExecutionQueue: Queue<WorkflowExecutionJobData>,
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
    await this.drainStalePlatformSourcedJobs();
  }

  /**
   * One-time deploy migration (#5162 / #5252 review): before this fix,
   * platform-sourced `system-run` jobs (platform-cron sweep dispatches,
   * proactive agent-strategy turns) landed on `WORKFLOW_EXECUTION_QUEUE`.
   * Any such job still `waiting`/`delayed` there at deploy would otherwise
   * keep competing with interactive agent turns for that queue's capacity
   * until it happened to run — exactly the failure mode this PR fixes. New
   * dispatches already land on `PLATFORM_SYSTEM_WORKFLOW_QUEUE`; this only
   * prunes stragglers enqueued before the fix shipped. Idempotent (finds
   * nothing on a second run) and safe under concurrent replicas booting at
   * once (`job.remove()` on an already-removed job is a no-op we swallow).
   * Never touches `active` jobs — only jobs that have not started.
   */
  async drainStalePlatformSourcedJobs(): Promise<void> {
    const staleJobs = await this.workflowExecutionQueue.getJobs([
      'waiting',
      'delayed',
    ]);
    let drained = 0;
    for (const job of staleJobs) {
      const source = job.data.systemRun?.input.source;
      if (job.data.type !== 'system-run' || !source) continue;
      if (!DRAINED_JOB_SOURCES.has(source)) continue;

      try {
        await job.remove();
        drained += 1;
      } catch (error: unknown) {
        this.logger.error(
          `${this.context} failed to drain stale platform-sourced job from ${WORKFLOW_EXECUTION_QUEUE}`,
          { error, jobId: job.id },
        );
      }
    }
    if (drained > 0) {
      this.logger.log(
        `Drained ${drained} pre-#5162 platform-sourced job(s) from ${WORKFLOW_EXECUTION_QUEUE}`,
        this.context,
      );
    }
  }

  async reconcile(): Promise<void> {
    const desiredSchedulerIds = new Set<string>();
    const entries = Object.entries(PLATFORM_SCHEDULE_CATALOG) as Array<
      [PlatformScheduledTaskName, PlatformSchedule]
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
