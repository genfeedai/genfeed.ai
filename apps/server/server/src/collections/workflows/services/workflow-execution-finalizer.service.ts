import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/enums';
import type { ExecutionRunResult } from '@genfeedai/workflows/engine';
import { LoggerService } from '@libs/logger/logger.service';
import { WorkflowExecutionsService } from '@server/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowArtifactLifecycleService } from '@server/collections/workflows/services/workflow-artifact-lifecycle.service';
import { WorkflowExecutionGraphService } from '@server/collections/workflows/services/workflow-execution-graph.service';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

type CompletedExecution = Awaited<
  ReturnType<WorkflowExecutionsService['completeExecution']>
>;

export class WorkflowExecutionFinalizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionsService: WorkflowExecutionsService,
    private readonly graphService: WorkflowExecutionGraphService,
    private readonly notificationsPublisher?: NotificationsPublisherService,
    private readonly logger?: LoggerService,
    private readonly artifactLifecycle?: WorkflowArtifactLifecycleService,
  ) {}

  mapRunResultToExecutionStatus(
    result: ExecutionRunResult,
  ): WorkflowExecutionStatus {
    return result.status === 'completed'
      ? WorkflowExecutionStatus.COMPLETED
      : result.status === 'running'
        ? WorkflowExecutionStatus.RUNNING
        : WorkflowExecutionStatus.FAILED;
  }

  async finalizeExecution(input: {
    executionId: string;
    workflowId: string;
    finalStatus: WorkflowExecutionStatus;
    result: ExecutionRunResult;
    completedAt: Date;
    workflowStatus: WorkflowStatus;
  }): Promise<CompletedExecution> {
    // Credits and the failed node ride on the same terminal UPDATE as status
    // so concurrent runner patches cannot be erased by a result-JSON rewrite.
    const failedNodeId =
      input.finalStatus === WorkflowExecutionStatus.FAILED
        ? this.graphService.findFirstFailedNodeId(input.result)
        : undefined;

    const completedExecution = await this.executionsService.completeExecution(
      input.executionId,
      input.finalStatus === WorkflowExecutionStatus.FAILED
        ? input.result.error
        : undefined,
      {
        ...(input.result.totalCreditsUsed > 0
          ? { creditsUsed: input.result.totalCreditsUsed }
          : {}),
        ...(failedNodeId ? { failedNodeId } : {}),
      },
    );

    await this.prisma.workflow.update({
      data: {
        completedAt: input.completedAt,
        status: input.workflowStatus,
      },
      where: { id: input.workflowId },
    });

    await this.notifyScheduledFailure(input, completedExecution);

    if (
      completedExecution?.organizationId &&
      completedExecution.userId &&
      this.artifactLifecycle
    ) {
      try {
        await this.artifactLifecycle.applyTerminalRetention({
          executionId: input.executionId,
          organizationId: completedExecution.organizationId,
          userId: completedExecution.userId,
        });
      } catch (error: unknown) {
        this.logger?.error(
          'Workflow execution terminal payload scrubbing failed',
          error,
          'WorkflowExecutionFinalizerService',
        );
      }
      await this.artifactLifecycle.scheduleTerminalCleanup({
        executionId: input.executionId,
        organizationId: completedExecution.organizationId,
        userId: completedExecution.userId,
      });
    }

    return completedExecution;
  }

  private async notifyScheduledFailure(
    input: {
      executionId: string;
      workflowId: string;
      finalStatus: WorkflowExecutionStatus;
      result: ExecutionRunResult;
    },
    completedExecution: CompletedExecution,
  ): Promise<void> {
    if (
      input.finalStatus !== WorkflowExecutionStatus.FAILED ||
      !completedExecution ||
      completedExecution.trigger !== WorkflowExecutionTrigger.SCHEDULED
    ) {
      return;
    }

    const userId = completedExecution.userId;
    const organizationId = completedExecution.organizationId;
    if (!userId || !organizationId || !this.notificationsPublisher) {
      return;
    }

    // tenant-scope-ignore: the tenant-owned execution row already proves authorization; hidden executions reference a global workflow mirror, so label lookup must use that pinned identity instead of the run tenant
    const workflow = await this.prisma.workflow.findUnique({
      select: { label: true },
      where: { id: input.workflowId },
    });
    const workflowLabel =
      typeof workflow?.label === 'string' && workflow.label.trim().length > 0
        ? workflow.label
        : input.workflowId;
    const error =
      typeof input.result.error === 'string' && input.result.error.trim()
        ? input.result.error
        : 'Unknown error';

    try {
      await this.notificationsPublisher.publishNotification({
        organizationId,
        userId,
        notification: {
          link: `/automation/runs/${completedExecution.id}`,
          message: `${workflowLabel} failed during a scheduled run: ${error}`,
          metadata: {
            executionId: completedExecution.id,
            trigger: WorkflowExecutionTrigger.SCHEDULED,
            workflowId: input.workflowId,
          },
          title: 'Scheduled workflow failed',
          type: 'workflow_scheduled_failed',
        },
      });

      await this.notificationsPublisher.publishWorkflowStatus(
        input.workflowId,
        'failed',
        userId,
        {
          error: input.result.error,
          workflowLabel,
        },
      );
    } catch (error_: unknown) {
      this.logger?.error(
        'Failed to publish scheduled workflow failure notice',
        error_,
        'WorkflowExecutionFinalizerService',
      );
    }
  }
}
