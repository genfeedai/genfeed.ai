import { WorkflowExecutionCancellationIntentService } from '@api/collections/workflow-executions/services/workflow-execution-cancellation-intent.service';
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

/**
 * Bounded immediate retry for the post-removal cancellation CAS (release
 * review finding): the removal already committed, so a transient DB blip on
 * the very next call would otherwise delay the cancel. An outage outlasting
 * these attempts is covered by the persisted cancellation intent (#5450), not
 * by counting the row as a strategy failure. Matches the immediate bounded
 * retry loops already used for a Prisma write elsewhere in this app (e.g.
 * `SchedulerPublishStateService.transition`).
 */
const CANCEL_EXECUTION_MAX_ATTEMPTS = 3;

@Injectable()
export class PlatformScheduleRegistryService implements OnApplicationBootstrap {
  private readonly context = PlatformScheduleRegistryService.name;

  constructor(
    @InjectQueue(PLATFORM_SCHEDULE_QUEUE)
    private readonly queue: Queue,
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly workflowExecutionQueue: Queue<WorkflowExecutionJobData>,
    private readonly workflowExecutions: WorkflowExecutionsService,
    private readonly cancellationIntent: WorkflowExecutionCancellationIntentService,
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
   * For each match, `job.remove()` runs BEFORE `cancelExecution` (release
   * review finding, superseding the earlier #5252 ordering): a job returned
   * by `getJobs(['waiting', 'delayed'])` can be claimed by a worker and start
   * running between that page fetch and this call. `job.remove()` throws
   * when BullMQ has locked the job for an active worker, so removing first
   * doubles as the liveness check — a locked/already-gone job is left
   * completely untouched, including its execution, instead of being
   * cancelled out from under the worker running it. Only once the removal
   * itself succeeds (the job was still genuinely queued) does
   * `cancelExecution` run, as a silent CAS onto `CANCELLED` — no
   * notification, no webhook, no `recordRun`. Before removing, the drain
   * persists a cancellation intent on the execution row (#5450); if the CAS
   * then keeps failing, the job is already gone but the row stays `PENDING`
   * with that intent, and `PendingWorkflowExecutionReconcileService` finishes
   * the silent cancel later (rather than a second drain — this migration
   * runs once, ever) instead of failing it as a never-claimed run.
   */
  async drainStalePlatformSourcedJobs(): Promise<void> {
    try {
      const client = await this.workflowExecutionQueue.getBackend().client;
      // bullmq's cross-backend `IRedisClient.set()` only types the `{ PX?;
      // EX? }` options object — a conditional write (`NX`) has no portable
      // meaning across every possible backend (e.g. its Postgres backend).
      // `RedisQueueBackend.client` is already documented as a "Redis-specific
      // escape hatch" (not part of `IQueueBackend`), which is exactly why
      // it's reached for here: the ioredis adapter this repo runs on forwards
      // a string third argument straight through to `ioredis.set(key, value,
      // 'NX')` (see bullmq's `ioredis-client.ts` `overrides.set`) — the
      // capability exists at runtime, it's just outside the declared
      // cross-backend type.
      const claimed = await (
        client as unknown as {
          set(key: string, value: string, mode: 'NX'): Promise<string | null>;
        }
      ).set(DRAIN_MARKER_KEY, new Date().toISOString(), 'NX');
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
    const organizationId = job.data.systemRun?.input.organizationId;
    if (job.data.type !== 'system-run' || !source || !organizationId) {
      return false;
    }
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

    // Persist the cancellation intent BEFORE the job disappears (#5450). The
    // reconciler honours it with a silent cancel, so a database outage that
    // outlasts the bounded retries below can never turn this drained run into
    // a loud `completeExecution` failure (customer-visible notification plus
    // `consecutiveFailures` accounting that can disable a strategy). If the
    // intent itself cannot be recorded, leave the job queued: it just runs or
    // is closed by the reconciler as before, and no execution is orphaned.
    try {
      await this.cancellationIntent.requestCancellation(executionId);
    } catch (error: unknown) {
      this.logger.error(
        `${this.context} could not record the cancellation intent for a stale platform-sourced job — leaving it queued`,
        { error, executionId, jobId: job.id },
      );
      return false;
    }

    try {
      await job.remove();
    } catch (error: unknown) {
      // Expected when a worker claimed (locked) this exact job between our
      // getJobs() page and this remove() call: it is now live work, not
      // stale. Leave it — and the execution behind it — completely alone;
      // cancelling here would CAS a RUNNING execution to CANCELLED out from
      // under the worker actively processing it. Withdraw the intent so the
      // reconciler never cancels this live run later.
      this.logger.debug(
        `${this.context} stale platform-sourced job was already active or gone when draining`,
        { error, jobId: job.id },
      );
      await this.clearCancellationIntent(executionId);
      return false;
    }

    for (
      let attempt = 1;
      attempt <= CANCEL_EXECUTION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await this.workflowExecutions.cancelExecution(
          executionId,
          organizationId,
        );
        return true;
      } catch (error: unknown) {
        if (attempt === CANCEL_EXECUTION_MAX_ATTEMPTS) {
          this.logger.error(
            `${this.context} removed a stale platform-sourced job but failed to cancel its execution after ${CANCEL_EXECUTION_MAX_ATTEMPTS} attempts — the persisted cancellation intent lets the reconciler close the row silently`,
            { error, executionId, jobId: job.id },
          );
          return false;
        }
        this.logger.debug(
          `${this.context} retrying cancellation of a stale platform-sourced job's execution`,
          { attempt, error, executionId, jobId: job.id },
        );
      }
    }
    return false;
  }

  private async clearCancellationIntent(executionId: string): Promise<void> {
    try {
      await this.cancellationIntent.clearCancellationRequest(executionId);
    } catch (error: unknown) {
      this.logger.error(
        `${this.context} could not withdraw the cancellation intent for a live platform-sourced job`,
        { error, executionId },
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
