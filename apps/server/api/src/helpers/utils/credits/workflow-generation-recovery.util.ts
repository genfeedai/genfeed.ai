import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { workflowExecutionGenerationBillingSchema } from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import { assertWorkflowFundingIdentity } from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { WorkflowExecutionGenerationBilling } from '@genfeedai/contracts/interfaces/billing';
import { Prisma } from '@genfeedai/prisma';
import { z } from 'zod';

export interface WorkflowFundingRecoveryExecution {
  actorUserId: string;
  workflowVersionId: string;
  status: WorkflowExecutionStatus;
  isDeleted: boolean;
  funding: WorkflowExecutionGenerationBilling | null;
}

/** Recovery locks live or tombstoned execution rows; admission remains exclusively live-only. */
export async function lockWorkflowFundingRecoveryExecution(
  tx: Prisma.TransactionClient,
  executionId: string,
  organizationId: string,
): Promise<WorkflowFundingRecoveryExecution | null> {
  for (const isDeleted of [false, true]) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "workflow_executions" WHERE "id" = ${executionId} AND "organizationId" = ${organizationId} AND "isDeleted" = ${isDeleted} FOR UPDATE`,
    );
    const execution = await tx.workflowExecution.findFirst({
      where: { id: executionId, organizationId, isDeleted },
      select: {
        userId: true,
        workflowVersionId: true,
        status: true,
        generationBilling: true,
      },
    });
    if (!execution) continue;
    const funding = execution.generationBilling
      ? workflowExecutionGenerationBillingSchema.parse(
          execution.generationBilling,
        )
      : null;
    if (funding) {
      assertWorkflowFundingIdentity(funding);
      if (
        funding.manifest.executionId !== executionId ||
        funding.manifest.organizationId !== organizationId
      )
        throw new BusinessLogicException(
          'Workflow recovery evidence belongs to another execution',
        );
    }
    return {
      actorUserId: execution.userId,
      workflowVersionId: execution.workflowVersionId,
      status: z.enum(WorkflowExecutionStatus).parse(execution.status),
      isDeleted,
      funding,
    };
  }
  return null;
}
