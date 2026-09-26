import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
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
import type { Job } from 'bullmq';
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

/**
 * NX-guarded Redis key so the deploy drain runs exactly once fleet-wide, ever
 * — not once per boot, per replica (#5252 review). Deleting the key manually
 * is the only way to re-arm it.
 */
const DRAIN_MARKER_KEY = 'genfeed:platform-schedules:5162-job-drain';

const DRAIN_PAGE_SIZE = 100;

@Injectable()
export class PlatformScheduleRegistryService implements OnApplicationBootstrap {
  private readonly context = PlatformScheduleRegistryService.name;

  constructor(
    @InjectQueue(PLATFORM_SCHEDULE_QUEUE)
    private readonly queue: Queue,
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly workflowExecutionQueue: Queue<WorkflowExecutionJobData>,
    private readonly workflowExecutions: WorkflowExecutionsService,
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
    // Off the bootstrap critical path (#5252 review): a full backlog scan
    // must not delay the worker coming up and starting to process real jobs.
    // Every failure mode inside is caught internally, so this can never
    // reject and can never surface an unhandled rejection either.
    void this.drainStalePlatformSourcedJobs();
  }

  /**
   * One-time deploy migration (#5162 / #5252 review): before this fix,
   * platform-sourced `system-run` jobs (platform-cron sweep dispatches,
   * proactive agent-strategy turns) landed on `WORKFLOW_EXECUTION_QUEUE`.
   * Any such job still `waiting`/`delayed` there at deploy would otherwise
   * keep competing with interactive agent turns for that queue's capacity
   * until it happened to run.
   *
   * Guarded by an NX Redis key so it executes exactly once fleet-wide (not
   * once per boot): every replica races to claim `DRAIN_MARKER_KEY`, and
   * only the winner scans. Paginates instead of loading the whole backlog.
   * Never touches `active` jobs. Wrapped so no failure here can fail worker
   * boot — see `onApplicationBootstrap`'s fire-and-forget call.
   *
   * For each match, `cancelExecution` runs BEFORE `job.remove()` (#5252
   * blocker): removing only the BullMQ job left the `WorkflowExecution` row
   * `PENDING` forever, which `PendingWorkflowExecutionReconcileService`
   * would eventually fail with a customer notification/webhook and proactive
   * accounting it never earned. `cancelExecution` is a silent CAS onto
   * `CANCELLED` — no notification, no webhook, no `recordRun`.
   */
  async drainStalePlatformSourcedJobs(): Promise<void> {
    try {
      const client = await this.workflowExecutionQueue.client;
      const claimed = await client.set(
        DRAIN_MARKER_KEY,
        new Date().toISOString(),
        'NX',
      );
      if (claimed !== 'OK') {
        return;
      }

      let drained = 0;
      let start = 0;
      while (true) {
        const page = await this.workflowExecutionQueue.getJobs(
          ['waiting', 'delayed'],
          start,
          start + DRAIN_PAGE_SIZE - 1,
        );
        if (page.length === 0) break;

        for (const job of page) {
          if (await this.drainJobIfPlatformSourced(job)) {
            drained += 1;
          }
        }

        if (page.length < DRAIN_PAGE_SIZE) break;
        start += DRAIN_PAGE_SIZE;
      }
      if (drained > 0) {
        this.logger.log(
          `${this.context} drained ${drained} pre-#5162 platform-sourced job(s) from ${WORKFLOW_EXECUTION_QUEUE}`,
          this.context,
        );
      }
    } catch (error: unknown) {
      this.logger.error(`${this.context} platform-sourced job drain failed`, {
        error,
      });
    }
  }

  private async drainJobIfPlatformSourced(
    job: Job<WorkflowExecutionJobData>,
  ): Promise<boolean> {
    const source = job.data.systemRun?.input.source;
    if (job.data.type !== 'system-run' || !source) return false;
    if (!DRAINED_JOB_SOURCES.has(source)) return false;

    const executionId = job.data.systemRun?.priorExecution?.executionId;
    if (!executionId) {
      // Every platform-sourced enqueue sets priorExecution — see
      // SystemWorkflowRunnerService.enqueueWorkflow. Without an execution id
      // to cancel, removing the job would leave an unreachable PENDING row,
      // so leave both the job and the (unknown) row alone; the reconciler's
      // own independent 24h window still catches it.
      this.logger.error(
        `${this.context} stale platform-sourced job has no priorExecution.executionId to cancel — leaving it for the reconciler`,
        { jobId: job.id },
      );
      return false;
    }

    try {
      await this.workflowExecutions.cancelExecution(executionId);
    } catch (error: unknown) {
      this.logger.error(
        `${this.context} failed to cancel the execution behind a stale platform-sourced job — leaving the job queued`,
        { error, executionId, jobId: job.id },
      );
      return false;
    }

    try {
      await job.remove();
      return true;
    } catch (error: unknown) {
      // Expected under concurrent boot: another replica's fetch already
      // claimed or removed this exact job between our getJobs() page and
      // this remove() call. The execution is already cancelled either way.
      this.logger.debug(
        `${this.context} stale platform-sourced job was already gone or locked when draining`,
        { error, jobId: job.id },
      );
      return false;
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
