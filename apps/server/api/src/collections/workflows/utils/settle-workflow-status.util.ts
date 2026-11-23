import { runSerializableWithRetry } from '@api/collections/workflows/utils/serializable-retry.util';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';

export interface SettleWorkflowStatusInput {
  organizationId: string;
  workflowId: string;
  /** The execution that just reached a terminal status. */
  executionId: string;
  /** The terminal `status` (and any other columns) to write. */
  data: Prisma.WorkflowUpdateInput;
}

/**
 * Writes the status a finished execution leaves on its workflow, unless
 * another execution of the same workflow is still RUNNING (#10402). Every run
 * of a workflow shares one `Workflow.status`, so the first run to finish used to
 * mark the workflow COMPLETED or FAILED while a sibling was still going. The
 * last run to finish writes the terminal status.
 *
 * The count and the write are one Serializable transaction. A run that starts
 * between them changes the executions the count read, and the workflow row the
 * write targets, so one of the two transactions aborts and is retried against
 * what was committed; a plain read followed by a write would let the finished
 * run stamp COMPLETED over the run that just began.
 *
 * @returns whether the status was written.
 */
export const settleWorkflowStatus = traced(
  'settleWorkflowStatus',
  async (
    prisma: PrismaService,
    input: SettleWorkflowStatusInput,
  ): Promise<boolean> =>
    runSerializableWithRetry(prisma, async (tx) => {
      const stillRunning = await tx.workflowExecution.count({
        where: scopedWhere(input.organizationId, {
          id: { not: input.executionId },
          status: WorkflowExecutionStatus.RUNNING,
          workflowId: input.workflowId,
        }),
      });
      if (stillRunning > 0) return false;
      await tx.workflow.update({
        data: input.data,
        where: scopedWhere(input.organizationId, { id: input.workflowId }),
      });
      return true;
    }),
);
