import { randomUUID } from 'node:crypto';
import type { TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { scopedWhere } from '@api/index';
import {
  buildRollupFailureOutcome,
  buildRollupReviewOutcome,
} from '@api/services/task-orchestration/task-rollup-outcome.util';
import { WorkspaceTaskQualityService } from '@api/services/task-orchestration/workspace-task-quality.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Longer than a quality assessment can take; also the retry backoff. */
export const TASK_ROLLUP_LEASE_TTL_MS = 10 * 60 * 1000;
/** Leaves recently active tasks to the event-driven fast path. */
const STALLED_ROLLUP_GRACE_MS = 2 * 60 * 1000;
/**
 * How far back the recovery sweep reaches, by task creation time. It also
 * bounds the one-off backfill of tasks stuck before the rollup was restored;
 * widen it here to reach older tasks.
 */
export const STALLED_ROLLUP_BACKFILL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Lease acquisitions per execution cycle before a rollup is abandoned. */
export const TASK_ROLLUP_MAX_ATTEMPTS = 3;
const RECOVERY_LOG_PREFIX = 'workspace-task-rollup-recovery';
const STALLED_ROLLUP_BATCH_SIZE = 25;

@Injectable()
export class TaskOrchestratorService {
  private readonly logContext = 'TaskOrchestratorService';

  constructor(
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    private readonly tasksService: TasksService,
    private readonly workspaceTaskQualityService: WorkspaceTaskQualityService,
    private readonly logger: LoggerService,
  ) {}

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private normalizeExecutionStatus(value: unknown): WorkflowExecutionStatus {
    switch (value) {
      case WorkflowExecutionStatus.PENDING:
      case WorkflowExecutionStatus.RUNNING:
      case WorkflowExecutionStatus.COMPLETED:
      case WorkflowExecutionStatus.FAILED:
      case WorkflowExecutionStatus.CANCELLED:
        return value;
      default:
        return WorkflowExecutionStatus.RUNNING;
    }
  }

  /**
   * Fast path, fired when one linked execution settles: records its progress
   * and, once every linked execution has settled, rolls the task up.
   */
  async handleExecutionCompletion(
    executionId: string,
    organizationId: string,
  ): Promise<void> {
    const task = await this.findTaskLinkedTo(executionId, organizationId);
    if (task?.status !== 'in_progress') {
      return;
    }

    const executionIds = task.linkedExecutionIds.map((id) => id.toString());
    const { executionStates, progress } = await this.buildTaskProgress(
      executionIds,
      organizationId,
    );
    const completedExecution = executionStates.find(
      (execution) => execution.id === executionId,
    );
    // Progress is computed from a snapshot; if the task was rolled up since,
    // this write is stale and must not land on top of the final state.
    const progressed = await this.tasksService.recordTaskEventIfMatches(
      task.id.toString(),
      organizationId,
      task.assigneeUserId ?? '',
      {
        payload: {
          executionId,
          progress,
          status: completedExecution?.status,
          summary: completedExecution?.summary,
        },
        type:
          completedExecution?.status === WorkflowExecutionStatus.FAILED
            ? 'execution_failed'
            : 'execution_completed',
      },
      { progress },
      { status: 'in_progress' },
    );
    if (
      !progressed ||
      !(await this.areAllExecutionsFinished(executionIds, organizationId))
    ) {
      return;
    }

    await this.rollUpTask(progressed, organizationId);
  }

  /**
   * Rolls up executions that settled before their links were persisted: their
   * terminal event found no linked task and is never re-emitted.
   */
  async reconcileTerminalExecutions(
    executionIds: string[],
    organizationId: string,
  ): Promise<void> {
    for (const executionId of executionIds) {
      const execution = await this.workflowExecutionsService.findOne(
        scopedWhere(organizationId, { id: executionId }),
      );
      if (
        execution &&
        this.isTerminalStatus(this.normalizeExecutionStatus(execution.status))
      ) {
        await this.handleExecutionCompletion(executionId, organizationId);
      }
    }
  }

  /**
   * Durable path: rolls up tasks whose executions all settled but that the
   * fast path never finished (lost event, or a lease holder that died or
   * failed before its final write). An expired lease is the retry backoff.
   * Returns how many tasks it rolled up.
   */
  async recoverStalledRollups(now = new Date()): Promise<number> {
    const scan = {
      createdAfter: new Date(now.getTime() - STALLED_ROLLUP_BACKFILL_WINDOW_MS),
      limit: STALLED_ROLLUP_BATCH_SIZE,
      maxAttempts: TASK_ROLLUP_MAX_ATTEMPTS,
      now,
      settledBefore: new Date(now.getTime() - STALLED_ROLLUP_GRACE_MS),
    };
    const eligible = await this.tasksService.countStalledRollupCandidates(scan);
    this.logger.log(`${RECOVERY_LOG_PREFIX}: ${eligible} eligible`);
    const candidates =
      await this.tasksService.findStalledRollupCandidates(scan);
    let rolledUp = 0;
    for (const candidate of candidates) {
      try {
        const task = await this.tasksService.findOne(
          scopedWhere(candidate.organizationId, { id: candidate.id }),
        );
        if (task && (await this.rollUpTask(task, candidate.organizationId))) {
          rolledUp += 1;
        }
      } catch (error: unknown) {
        this.logger.error(
          `${this.logContext}: Stalled rollup for task ${candidate.id} failed`,
          error,
        );
      }
    }
    return rolledUp;
  }

  async handleExecutionStarted(
    executionId: string,
    organizationId: string,
  ): Promise<void> {
    const task = await this.findTaskLinkedTo(executionId, organizationId);
    if (task?.status !== 'in_progress') {
      return;
    }

    const { executionStates, progress } = await this.buildTaskProgress(
      task.linkedExecutionIds.map((id) => id.toString()),
      organizationId,
    );
    const startedExecution = executionStates.find(
      (execution) => execution.id === executionId,
    );

    await this.tasksService.recordTaskEventIfMatches(
      task.id.toString(),
      organizationId,
      task.assigneeUserId ?? '',
      {
        payload: {
          executionId,
          label: startedExecution?.label,
          progress,
          status: startedExecution?.status,
        },
        type: 'execution_started',
      },
      { progress },
      { status: 'in_progress' },
    );
  }

  /**
   * Runs the rollup under a lease so that, of all concurrent triggers in the
   * API and workers, one assesses and writes. The final status, its fields and
   * the lease release land in one write that only the current holder can
   * make, so `in_review`/`failed` always come with their review fields. A
   * holder that throws keeps its lease until expiry; the sweep then retries.
   */
  private async rollUpTask(
    task: TaskDocument,
    organizationId: string,
  ): Promise<boolean> {
    const taskId = task.id.toString();
    const owner = randomUUID();
    const attempt = await this.tasksService.acquireRollupLease({
      maxAttempts: TASK_ROLLUP_MAX_ATTEMPTS,
      organizationId,
      owner,
      taskId,
      ttlMs: TASK_ROLLUP_LEASE_TTL_MS,
    });
    if (attempt === null) {
      return false;
    }

    try {
      return await this.runLeasedRollup(task, organizationId, owner, attempt);
    } catch (error: unknown) {
      this.noteFailedAttempt(taskId, attempt);
      throw error;
    }
  }

  /** The leased part of a rollup; false when the lease was lost before the final write. */
  private async runLeasedRollup(
    task: TaskDocument,
    organizationId: string,
    owner: string,
    attempt: number,
  ): Promise<boolean> {
    const taskId = task.id.toString();
    const { hasFailures, summaries } = await this.collectExecutionResults(
      task.linkedExecutionIds.map((id) => id.toString()),
      organizationId,
    );
    const resultPreview = summaries.filter(Boolean).join(' | ');
    const outcome = hasFailures
      ? buildRollupFailureOutcome(resultPreview)
      : buildRollupReviewOutcome(
          await this.workspaceTaskQualityService.assess(
            {
              outputType: task.outputType,
              platforms: task.platforms,
              request: task.request,
              summaries,
            },
            organizationId,
          ),
          resultPreview,
          new Date(),
        );

    const written = await this.tasksService.recordTaskEventIfMatches(
      taskId,
      organizationId,
      task.assigneeUserId ?? '',
      outcome.event,
      {
        ...outcome.patch,
        rolledUpAt: new Date(),
        rollupLeaseExpiresAt: null,
        rollupLeaseOwner: null,
      },
      { rollupLeaseOwner: owner, status: 'in_progress' },
    );
    if (!written) {
      this.logger.warn(
        `${this.logContext}: Task ${taskId} rollup lease expired before its final write`,
      );
      this.noteFailedAttempt(taskId, attempt);
      return false;
    }

    this.logger.log(
      `${this.logContext}: Task ${taskId} rollup complete — ${written.status}`,
    );
    return true;
  }

  /**
   * The attempt that exhausts the cap is the last one that can ever run, so
   * logging here reports an abandoned task exactly once.
   */
  private noteFailedAttempt(taskId: string, attempt: number): void {
    if (attempt >= TASK_ROLLUP_MAX_ATTEMPTS) {
      this.logger.error(
        `${this.logContext}: Task ${taskId} rollup abandoned after ${attempt} attempts; left in_progress`,
      );
    }
  }

  private findTaskLinkedTo(
    executionId: string,
    organizationId: string,
  ): Promise<TaskDocument | null> {
    return this.tasksService.findOne(
      scopedWhere(organizationId, {
        linkedExecutions: { some: { id: executionId } },
      }),
    );
  }

  private isTerminalStatus(status: WorkflowExecutionStatus): boolean {
    return (
      status === WorkflowExecutionStatus.COMPLETED ||
      status === WorkflowExecutionStatus.FAILED ||
      status === WorkflowExecutionStatus.CANCELLED
    );
  }

  private async areAllExecutionsFinished(
    executionIds: string[],
    organizationId: string,
  ): Promise<boolean> {
    for (const executionId of executionIds) {
      const execution = await this.workflowExecutionsService.findOne(
        scopedWhere(organizationId, { id: executionId }),
      );
      if (
        !execution ||
        !this.isTerminalStatus(this.normalizeExecutionStatus(execution.status))
      ) {
        return false;
      }
    }

    return true;
  }

  private async collectExecutionResults(
    executionIds: string[],
    organizationId: string,
  ): Promise<{ hasFailures: boolean; summaries: string[] }> {
    let hasFailures = false;
    const summaries: string[] = [];

    for (const executionId of executionIds) {
      const execution = await this.workflowExecutionsService.findOne(
        scopedWhere(organizationId, { id: executionId }),
      );
      if (!execution) continue;
      const executionStatus = this.normalizeExecutionStatus(execution.status);

      if (executionStatus === WorkflowExecutionStatus.FAILED) {
        hasFailures = true;
      }

      const summary = this.readString(execution.metadata?.summary);
      if (summary) {
        summaries.push(summary);
      }
    }

    return { hasFailures, summaries };
  }

  private async buildTaskProgress(
    executionIds: string[],
    organizationId: string,
  ): Promise<{
    progress: {
      activeRunCount: number;
      message: string;
      percent: number;
      stage: string;
    };
    executionStates: Array<{
      id: string;
      label: string;
      progress: number;
      status: WorkflowExecutionStatus;
      summary?: string;
    }>;
  }> {
    const executionStates: Array<{
      id: string;
      label: string;
      progress: number;
      status: WorkflowExecutionStatus;
      summary?: string;
    }> = [];

    for (const executionId of executionIds) {
      const execution = await this.workflowExecutionsService.findOne(
        scopedWhere(organizationId, { id: executionId }),
      );
      if (!execution) {
        continue;
      }
      const executionStatus = this.normalizeExecutionStatus(execution.status);
      const workflow =
        execution.workflow && typeof execution.workflow === 'object'
          ? (execution.workflow as Record<string, unknown>)
          : undefined;

      executionStates.push({
        id: execution.id.toString(),
        label:
          this.readString(workflow?.label) ??
          this.readString(execution.metadata?.label) ??
          'Workflow execution',
        progress:
          executionStatus === WorkflowExecutionStatus.COMPLETED ||
          executionStatus === WorkflowExecutionStatus.FAILED ||
          executionStatus === WorkflowExecutionStatus.CANCELLED
            ? 100
            : executionStatus === WorkflowExecutionStatus.PENDING
              ? 5
              : typeof execution.progress === 'number'
                ? Math.min(99, Math.max(1, execution.progress))
                : 50,
        status: executionStatus,
        summary: this.readString(execution.metadata?.summary),
      });
    }

    const activeRunCount = executionStates.filter(
      (execution) =>
        execution.status === WorkflowExecutionStatus.PENDING ||
        execution.status === WorkflowExecutionStatus.RUNNING,
    ).length;
    const averageProgress =
      executionStates.length > 0
        ? Math.round(
            executionStates.reduce(
              (total, execution) => total + execution.progress,
              0,
            ) / executionStates.length,
          )
        : 0;

    const stage = executionStates.some(
      (execution) => execution.status === WorkflowExecutionStatus.RUNNING,
    )
      ? 'running'
      : executionStates.some(
            (execution) => execution.status === WorkflowExecutionStatus.PENDING,
          )
        ? 'queued'
        : executionStates.some(
              (execution) =>
                execution.status === WorkflowExecutionStatus.FAILED,
            )
          ? 'failed'
          : 'review';

    const message =
      stage === 'running'
        ? `${activeRunCount} execution${activeRunCount === 1 ? '' : 's'} active.`
        : stage === 'queued'
          ? `${activeRunCount} execution${activeRunCount === 1 ? '' : 's'} queued.`
          : stage === 'failed'
            ? 'Execution finished with failures.'
            : 'Execution finished.';

    return {
      progress: {
        activeRunCount,
        message,
        percent: averageProgress,
        stage,
      },
      executionStates,
    };
  }
}
