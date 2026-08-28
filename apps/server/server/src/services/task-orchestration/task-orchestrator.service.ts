import { AgentExecutionStatus, AgentRunStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { AgentRunsService } from '@server/collections/agent-runs/services/agent-runs.service';
import { TasksService } from '@server/collections/tasks/services/tasks.service';
import {
  WorkspaceTaskQualityAssessmentResult,
  WorkspaceTaskQualityService,
} from '@server/services/task-orchestration/workspace-task-quality.service';

@Injectable()
export class TaskOrchestratorService {
  private readonly logContext = 'TaskOrchestratorService';

  constructor(
    private readonly agentRunsService: AgentRunsService,
    private readonly tasksService: TasksService,
    private readonly workspaceTaskQualityService: WorkspaceTaskQualityService,
    private readonly logger: LoggerService,
  ) {}

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private normalizeRunStatus(value: unknown): AgentExecutionStatus {
    switch (value) {
      case AgentExecutionStatus.PENDING:
      case AgentExecutionStatus.RUNNING:
      case AgentExecutionStatus.COMPLETED:
      case AgentExecutionStatus.FAILED:
      case AgentExecutionStatus.CANCELLED:
        return value;
      case AgentRunStatus.COMPLETED:
        return AgentExecutionStatus.COMPLETED;
      case AgentRunStatus.FAILED:
      case AgentRunStatus.BUDGET_EXHAUSTED:
        return AgentExecutionStatus.FAILED;
      default:
        return AgentExecutionStatus.RUNNING;
    }
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
      linkedRuns: { some: { id: runId } },
      organizationId: organizationId,
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
      task.id.toString(),
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
        task.id.toString(),
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

  async handleRunStarted(runId: string, organizationId: string): Promise<void> {
    const task = await this.tasksService.findOne({
      linkedRuns: { some: { id: runId } },
      organizationId: organizationId,
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
      task.id.toString(),
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
      if (!run || !terminalStatuses.has(this.normalizeRunStatus(run.status))) {
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
      const runStatus = this.normalizeRunStatus(run.status);

      if (runStatus === AgentExecutionStatus.FAILED) {
        hasFailures = true;
      }

      const summary = this.readString(run.summary);
      if (summary) {
        summaries.push(summary);
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
      const runStatus = this.normalizeRunStatus(run.status);

      runStates.push({
        id: run.id.toString(),
        label: this.readString(run.label) ?? 'Agent run',
        progress:
          runStatus === AgentExecutionStatus.COMPLETED ||
          runStatus === AgentExecutionStatus.FAILED ||
          runStatus === AgentExecutionStatus.CANCELLED
            ? 100
            : runStatus === AgentExecutionStatus.PENDING
              ? 5
              : typeof run.progress === 'number'
                ? Math.min(99, Math.max(1, run.progress))
                : 50,
        status: runStatus,
        summary: this.readString(run.summary),
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
