import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import {
  AgentRunJobData,
  AgentRunQueueService,
} from '@api/queues/agent-run/agent-run-queue.service';
import type {
  DecomposedSubtask,
  TaskDecompositionResult,
} from '@api/services/task-orchestration/interfaces/task-decomposition.interface';
import { TaskDecompositionService } from '@api/services/task-orchestration/task-decomposition.service';
import {
  WorkspaceTaskQualityAssessmentResult,
  WorkspaceTaskQualityService,
} from '@api/services/task-orchestration/workspace-task-quality.service';
import { AgentExecutionStatus, AgentExecutionTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import { Types } from 'mongoose';

export interface OrchestrateTaskParams {
  /** Workspace task ID */
  taskId: string;
  /** Organization context (multi-tenancy) */
  organizationId: string;
  /** User who created the task */
  userId: string;
  /** The raw user request */
  request: string;
  /** Optional output type hint */
  outputType?: string;
  /** Target platforms */
  platforms?: string[];
  /** Brand ID (optional) */
  brandId?: string;
  /** Brand name for decomposition context */
  brandName?: string;
}

@Injectable()
export class TaskOrchestratorService {
  private readonly logContext = 'TaskOrchestratorService';

  constructor(
    private readonly decompositionService: TaskDecompositionService,
    private readonly agentRunsService: AgentRunsService,
    @Optional()
    @Inject(forwardRef(() => AgentRunQueueService))
    private readonly agentRunQueueService: AgentRunQueueService,
    private readonly tasksService: TasksService,
    private readonly workspaceTaskQualityService: WorkspaceTaskQualityService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Main orchestration entry point.
   * 1. Decompose the task via LLM
   * 2. Create agent run records for each subtask
   * 3. Enqueue runs to BullMQ
   * 4. Update workspace task with linked run IDs and status
   */
  async orchestrate(params: OrchestrateTaskParams): Promise<void> {
    const { taskId, organizationId, userId } = params;

    if (!this.agentRunQueueService) {
      this.logger.warn(
        `${this.logContext}: AgentRunQueueService not available, skipping orchestration`,
      );
      return;
    }

    this.logger.log(`${this.logContext}: Orchestrating task ${taskId}`, {
      organizationId,
      taskId,
    });

    // 1. Decompose
    const decomposition = await this.decompositionService.decompose(
      {
        brandName: params.brandName,
        outputType: params.outputType,
        platforms: params.platforms,
        request: params.request,
      },
      organizationId,
    );

    this.logger.log(
      `${this.logContext}: Decomposed into ${decomposition.subtasks.length} subtask(s)`,
      { isSingleAgent: decomposition.isSingleAgent, taskId },
    );

    // 2. Mark task as in_progress with routing summary + decomposition
    await this.tasksService.recordTaskEvent(
      taskId,
      organizationId,
      userId,
      {
        payload: {
          subtaskCount: decomposition.subtasks.length,
          summary: decomposition.routingSummary,
        },
        type: 'task_started',
      },
      {
        decomposition: {
          isSingleAgent: decomposition.isSingleAgent,
          subtasks: decomposition.subtasks.map((s) => ({
            agentType: s.agentType,
            brief: s.brief,
            label: s.label,
            order: s.order,
          })),
          summary: decomposition.routingSummary,
        },
        executionPathUsed: 'agent_orchestrator',
        progress: {
          activeRunCount: decomposition.subtasks.length,
          message: 'Preparing agent runs for execution.',
          percent: 5,
          stage: 'orchestrating',
        },
        routingSummary: decomposition.routingSummary,
        status: 'in_progress',
      },
    );

    // 3. Create agent runs and enqueue
    const runIds = await this.createAndEnqueueRuns(decomposition, params);

    // 4. Link runs to workspace task
    await this.tasksService.recordTaskEvent(
      taskId,
      organizationId,
      userId,
      {
        payload: { runIds },
        type: 'runs_linked',
      },
      {
        linkedRunIds: runIds.map((id) => new Types.ObjectId(id)),
        progress: {
          activeRunCount: runIds.length,
          message: `Queued ${runIds.length} run${runIds.length === 1 ? '' : 's'} for execution.`,
          percent: 10,
          stage: 'queued',
        },
      },
    );

    this.logger.log(
      `${this.logContext}: Task ${taskId} orchestrated with ${runIds.length} run(s)`,
    );
  }

  /**
   * Called when an agent run completes.
   * Checks if all runs for the workspace task are done and updates status.
   */
  async handleRunCompletion(
    runId: string,
    organizationId: string,
  ): Promise<void> {
    // Find the workspace task that links to this run
    const task = await this.tasksService.findOne({
      isDeleted: false,
      linkedRunIds: new Types.ObjectId(runId),
      organization: new Types.ObjectId(organizationId),
    });

    if (!task) {
      return; // Run not linked to any workspace task
    }

    const { progress, runStates } = await this.buildTaskProgress(
      task.linkedRunIds.map((id) => id.toString()),
      organizationId,
    );

    const completedRun = runStates.find((run) => run.id === runId);
    await this.tasksService.recordTaskEvent(
      task._id.toString(),
      organizationId,
      task.assigneeUserId ?? '',
      {
        payload: {
          progress,
          runId,
          status: completedRun?.status,
          summary: completedRun?.summary,
        },
        type:
          completedRun?.status === AgentExecutionStatus.FAILED
            ? 'run_failed'
            : 'run_completed',
      },
      { progress },
    );

    // Check all linked runs
    const allComplete = await this.areAllRunsFinished(
      task.linkedRunIds.map((id) => id.toString()),
      organizationId,
    );

    if (!allComplete) {
      return; // Still waiting for other runs
    }

    // Determine final status based on run outcomes
    const { hasFailures, summaries } = await this.collectRunResults(
      task.linkedRunIds.map((id) => id.toString()),
      organizationId,
    );

    const resultPreview = summaries.filter(Boolean).join(' | ');

    if (hasFailures) {
      await this.tasksService.recordTaskEvent(
        task._id.toString(),
        organizationId,
        task.assigneeUserId ?? '',
        {
          payload: {
            failureReason: 'One or more agent runs failed.',
            resultPreview: resultPreview || undefined,
          },
          type: 'task_failed',
        },
        {
          failureReason: 'One or more agent runs failed.',
          progress: {
            activeRunCount: 0,
            message: 'One or more runs failed.',
            percent: 100,
            stage: 'failed',
          },
          resultPreview: resultPreview || undefined,
          reviewTriggered: true,
          reviewState: 'none',
          status: 'failed',
        },
      );
    } else {
      const qualityAssessment = await this.workspaceTaskQualityService.assess(
        {
          outputType: task.outputType,
          platforms: task.platforms,
          request: task.request,
          summaries,
        },
        organizationId,
      );

      await this.tasksService.recordTaskEvent(
        task._id.toString(),
        organizationId,
        task.assigneeUserId ?? '',
        {
          payload: {
            gate: qualityAssessment.gate,
            resultPreview: resultPreview || undefined,
            score: qualityAssessment.score,
          },
          type: 'task_ready_for_review',
        },
        {
          completedAt: new Date(),
          progress: {
            activeRunCount: 0,
            message: 'Generation finished. Awaiting review.',
            percent: 100,
            stage: 'review',
          },
          qualityAssessment,
          resultPreview: resultPreview || undefined,
          reviewState: 'pending_approval',
          reviewTriggered: true,
          status: 'in_review',
          ...(qualityAssessment.gate === 'pass'
            ? {
                requestedChangesReason: null,
              }
            : {
                requestedChangesReason:
                  this.buildQualityReviewReason(qualityAssessment),
              }),
        },
      );
    }

    this.logger.log(
      `${this.logContext}: Task ${task._id} rollup complete — ${hasFailures ? 'failed' : 'in_review'}`,
    );
  }

  private async createAndEnqueueRuns(
    decomposition: TaskDecompositionResult,
    params: OrchestrateTaskParams,
  ): Promise<string[]> {
    const runIds: string[] = [];

    // Group by order for sequential execution
    const orderGroups = new Map<number, DecomposedSubtask[]>();
    for (const subtask of decomposition.subtasks) {
      const group = orderGroups.get(subtask.order) ?? [];
      group.push(subtask);
      orderGroups.set(subtask.order, group);
    }

    for (const [, subtasks] of [...orderGroups.entries()].sort(
      ([a], [b]) => a - b,
    )) {
      for (const subtask of subtasks) {
        const runId = await this.createRunAndEnqueue(subtask, params);
        runIds.push(runId);
      }
    }

    return runIds;
  }

  private async createRunAndEnqueue(
    subtask: DecomposedSubtask,
    params: OrchestrateTaskParams,
  ): Promise<string> {
    // Create the agent run record
    const run = await this.agentRunsService.create({
      label: subtask.label,
      metadata: {
        workspaceTaskId: params.taskId,
      },
      objective: subtask.brief,
      organization: new Types.ObjectId(params.organizationId) as never,
      trigger: AgentExecutionTrigger.EVENT,
      user: new Types.ObjectId(params.userId) as never,
    });

    const runId = run._id.toString();

    // Enqueue to BullMQ
    const jobData: AgentRunJobData = {
      agentType: subtask.agentType,
      objective: subtask.brief,
      organizationId: params.organizationId,
      runId,
      userId: params.userId,
    };

    await this.agentRunQueueService.queueRun(jobData);

    await this.tasksService.recordTaskEvent(
      params.taskId,
      params.organizationId,
      params.userId,
      {
        payload: {
          agentType: subtask.agentType,
          label: subtask.label,
          runId,
        },
        type: 'run_queued',
      },
    );

    this.logger.log(
      `${this.logContext}: Created and enqueued run ${runId} (${subtask.agentType})`,
      { agentType: subtask.agentType, label: subtask.label, runId },
    );

    return runId;
  }

  async handleRunStarted(runId: string, organizationId: string): Promise<void> {
    const task = await this.tasksService.findOne({
      isDeleted: false,
      linkedRunIds: new Types.ObjectId(runId),
      organization: new Types.ObjectId(organizationId),
    });

    if (!task) {
      return;
    }

    const { progress, runStates } = await this.buildTaskProgress(
      task.linkedRunIds.map((id) => id.toString()),
      organizationId,
    );
    const startedRun = runStates.find((run) => run.id === runId);

    await this.tasksService.recordTaskEvent(
      task._id.toString(),
      organizationId,
      task.assigneeUserId ?? '',
      {
        payload: {
          label: startedRun?.label,
          progress,
          runId,
          status: startedRun?.status,
        },
        type: 'run_started',
      },
      { progress },
    );
  }

  private async areAllRunsFinished(
    runIds: string[],
    organizationId: string,
  ): Promise<boolean> {
    const terminalStatuses = new Set([
      AgentExecutionStatus.COMPLETED,
      AgentExecutionStatus.FAILED,
      AgentExecutionStatus.CANCELLED,
    ]);

    for (const runId of runIds) {
      const run = await this.agentRunsService.getById(runId, organizationId);
      if (!run || !terminalStatuses.has(run.status)) {
        return false;
      }
    }

    return true;
  }

  private async collectRunResults(
    runIds: string[],
    organizationId: string,
  ): Promise<{ hasFailures: boolean; summaries: string[] }> {
    let hasFailures = false;
    const summaries: string[] = [];

    for (const runId of runIds) {
      const run = await this.agentRunsService.getById(runId, organizationId);
      if (!run) continue;

      if (run.status === AgentExecutionStatus.FAILED) {
        hasFailures = true;
      }

      if (run.summary) {
        summaries.push(run.summary);
      }
    }

    return { hasFailures, summaries };
  }

  private async buildTaskProgress(
    runIds: string[],
    organizationId: string,
  ): Promise<{
    progress: {
      activeRunCount: number;
      message: string;
      percent: number;
      stage: string;
    };
    runStates: Array<{
      id: string;
      label: string;
      progress: number;
      status: AgentExecutionStatus;
      summary?: string;
    }>;
  }> {
    const runStates: Array<{
      id: string;
      label: string;
      progress: number;
      status: AgentExecutionStatus;
      summary?: string;
    }> = [];

    for (const runId of runIds) {
      const run = await this.agentRunsService.getById(runId, organizationId);
      if (!run) {
        continue;
      }

      runStates.push({
        id: run._id.toString(),
        label: run.label,
        progress:
          run.status === AgentExecutionStatus.COMPLETED ||
          run.status === AgentExecutionStatus.FAILED ||
          run.status === AgentExecutionStatus.CANCELLED
            ? 100
            : run.status === AgentExecutionStatus.PENDING
              ? 5
              : typeof run.progress === 'number'
                ? Math.min(99, Math.max(1, run.progress))
                : 50,
        status: run.status,
        summary: run.summary,
      });
    }

    const activeRunCount = runStates.filter(
      (run) =>
        run.status === AgentExecutionStatus.PENDING ||
        run.status === AgentExecutionStatus.RUNNING,
    ).length;
    const averageProgress =
      runStates.length > 0
        ? Math.round(
            runStates.reduce((total, run) => total + run.progress, 0) /
              runStates.length,
          )
        : 0;

    const stage = runStates.some(
      (run) => run.status === AgentExecutionStatus.RUNNING,
    )
      ? 'running'
      : runStates.some((run) => run.status === AgentExecutionStatus.PENDING)
        ? 'queued'
        : runStates.some((run) => run.status === AgentExecutionStatus.FAILED)
          ? 'failed'
          : 'review';

    const message =
      stage === 'running'
        ? `${activeRunCount} run${activeRunCount === 1 ? '' : 's'} active.`
        : stage === 'queued'
          ? `${activeRunCount} run${activeRunCount === 1 ? '' : 's'} queued.`
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
      runStates,
    };
  }

  private buildQualityReviewReason(
    qualityAssessment: WorkspaceTaskQualityAssessmentResult,
  ): string {
    const fixes = qualityAssessment.suggestedFixes.slice(0, 3).join(' ');
    const summary =
      qualityAssessment.summary ??
      'The system quality gate flagged this output for revision.';

    return [summary, fixes].filter(Boolean).join(' ');
  }
}
