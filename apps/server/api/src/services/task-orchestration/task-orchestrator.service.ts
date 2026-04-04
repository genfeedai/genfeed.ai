import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { WorkspaceTasksService } from '@api/collections/workspace-tasks/services/workspace-tasks.service';
import type { AgentRunJobData } from '@api/queues/agent-run/agent-run-queue.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import type {
  DecomposedSubtask,
  TaskDecompositionResult,
} from '@api/services/task-orchestration/interfaces/task-decomposition.interface';
import { TaskDecompositionService } from '@api/services/task-orchestration/task-decomposition.service';
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
    private readonly workspaceTasksService: WorkspaceTasksService,
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
    await this.workspaceTasksService.patch(taskId, {
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
      routingSummary: decomposition.routingSummary,
      status: 'in_progress',
    } as Record<string, unknown>);

    // 3. Create agent runs and enqueue
    const runIds = await this.createAndEnqueueRuns(decomposition, params);

    // 4. Link runs to workspace task
    await this.workspaceTasksService.patch(taskId, {
      linkedRunIds: runIds.map((id) => new Types.ObjectId(id)),
    } as Record<string, unknown>);

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
    const task = await this.workspaceTasksService.findOne({
      isDeleted: false,
      linkedRunIds: new Types.ObjectId(runId),
      organization: new Types.ObjectId(organizationId),
    });

    if (!task) {
      return; // Run not linked to any workspace task
    }

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
      await this.workspaceTasksService.patch(task._id.toString(), {
        failureReason: 'One or more agent runs failed.',
        resultPreview: resultPreview || undefined,
        reviewState: 'none',
        status: 'failed',
      } as Record<string, unknown>);
    } else {
      await this.workspaceTasksService.patch(task._id.toString(), {
        completedAt: new Date(),
        resultPreview: resultPreview || undefined,
        reviewState: 'pending_approval',
        status: 'needs_review',
      } as Record<string, unknown>);
    }

    this.logger.log(
      `${this.logContext}: Task ${task._id} rollup complete — ${hasFailures ? 'failed' : 'needs_review'}`,
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

    this.logger.log(
      `${this.logContext}: Created and enqueued run ${runId} (${subtask.agentType})`,
      { agentType: subtask.agentType, label: subtask.label, runId },
    );

    return runId;
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
}
