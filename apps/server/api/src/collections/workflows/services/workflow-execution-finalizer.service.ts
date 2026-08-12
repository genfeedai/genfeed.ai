import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionStatus, WorkflowStatus } from '@genfeedai/enums';
import type { ExecutionRunResult } from '@genfeedai/workflows/engine';

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

    return completedExecution;
  }
}
