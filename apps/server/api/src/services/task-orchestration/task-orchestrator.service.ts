import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { scopedWhere } from '@api/index';
import {
  WorkspaceTaskQualityAssessmentResult,
  WorkspaceTaskQualityService,
} from '@api/services/task-orchestration/workspace-task-quality.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
   * Called when an agent run completes.
   * Checks if all runs for the workspace task are done and updates status.
   */
  async handleExecutionCompletion(
    executionId: string,
    organizationId: string,
  ): Promise<void> {
    // Find the workspace task that links to this run
    const task = await this.tasksService.findOne({
      linkedExecutions: { some: { id: executionId } },
      organizationId: organizationId,
    });

    if (!task) {
      return; // Run not linked to any workspace task
    }

    const { executionStates, progress } = await this.buildTaskProgress(
      task.linkedExecutionIds.map((id) => id.toString()),
      organizationId,
    );

    const completedExecution = executionStates.find(
      (execution) => execution.id === executionId,
    );
    await this.tasksService.recordTaskEvent(
      task.id.toString(),
      organizationId,
      task.assigneeUserId ?? '',
      {
        payload: {
          progress,
          executionId,
          status: completedExecution?.status,
          summary: completedExecution?.summary,
        },
        type:
          completedExecution?.status === WorkflowExecutionStatus.FAILED
            ? 'execution_failed'
            : 'execution_completed',
      },
      { progress },
    );

    // Check all linked runs
    const allComplete = await this.areAllExecutionsFinished(
      task.linkedExecutionIds.map((id) => id.toString()),
      organizationId,
    );

    if (!allComplete) {
      return; // Still waiting for other runs
    }

    // Determine final status based on run outcomes
    const { hasFailures, summaries } = await this.collectExecutionResults(
      task.linkedExecutionIds.map((id) => id.toString()),
      organizationId,
    );

    const resultPreview = summaries.filter(Boolean).join(' | ');

    if (hasFailures) {
      await this.tasksService.recordTaskEvent(
        task.id.toString(),
        organizationId,
        task.assigneeUserId ?? '',
        {
          payload: {
            failureReason: 'One or more workflow executions failed.',
            resultPreview: resultPreview || undefined,
          },
          type: 'task_failed',
        },
        {
          failureReason: 'One or more workflow executions failed.',
          progress: {
            activeRunCount: 0,
            message: 'One or more executions failed.',
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
        task.id.toString(),
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
      `${this.logContext}: Task ${task.id} rollup complete — ${hasFailures ? 'failed' : 'in_review'}`,
    );
  }

  async handleExecutionStarted(
    executionId: string,
    organizationId: string,
  ): Promise<void> {
    const task = await this.tasksService.findOne({
      linkedExecutions: { some: { id: executionId } },
      organizationId: organizationId,
    });

    if (!task) {
      return;
    }

    const { executionStates, progress } = await this.buildTaskProgress(
      task.linkedExecutionIds.map((id) => id.toString()),
      organizationId,
    );
    const startedExecution = executionStates.find(
      (execution) => execution.id === executionId,
    );

    await this.tasksService.recordTaskEvent(
      task.id.toString(),
      organizationId,
      task.assigneeUserId ?? '',
      {
        payload: {
          label: startedExecution?.label,
          progress,
          executionId,
          status: startedExecution?.status,
        },
        type: 'execution_started',
      },
      { progress },
    );
  }

  private async areAllExecutionsFinished(
    executionIds: string[],
    organizationId: string,
  ): Promise<boolean> {
    const terminalStatuses = new Set([
      WorkflowExecutionStatus.COMPLETED,
      WorkflowExecutionStatus.FAILED,
      WorkflowExecutionStatus.CANCELLED,
    ]);

    for (const executionId of executionIds) {
      const execution = await this.workflowExecutionsService.findOne(
        scopedWhere(organizationId, { id: executionId }),
      );
      if (
        !execution ||
        !terminalStatuses.has(this.normalizeExecutionStatus(execution.status))
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
