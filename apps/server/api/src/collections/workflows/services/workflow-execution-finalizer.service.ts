import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionStatus, WorkflowStatus } from '@genfeedai/enums';
import type { ExecutionRunResult } from '@genfeedai/workflow-engine';

type CompletedExecution = Awaited<
  ReturnType<WorkflowExecutionsService['completeExecution']>
>;

export class WorkflowExecutionFinalizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionsService: WorkflowExecutionsService,
    private readonly graphService: WorkflowExecutionGraphService,
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
    const completedExecution = await this.executionsService.completeExecution(
      input.executionId,
      input.finalStatus === WorkflowExecutionStatus.FAILED
        ? input.result.error
        : undefined,
    );

    if (input.result.totalCreditsUsed > 0) {
      await this.executionsService.setCreditsUsed(
        input.executionId,
        input.result.totalCreditsUsed,
      );
    }

    if (input.finalStatus === WorkflowExecutionStatus.FAILED) {
      const failedNodeId = this.graphService.findFirstFailedNodeId(
        input.result,
      );
      if (failedNodeId) {
        await this.executionsService.setFailedNodeId(
          input.executionId,
          failedNodeId,
        );
      }
    }

    await this.prisma.workflow.update({
      data: {
        completedAt: input.completedAt,
        status: input.workflowStatus,
      },
      where: { id: input.workflowId },
    });

    return completedExecution;
  }
}
