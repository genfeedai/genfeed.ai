import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { workflowExecutionGenerationBillingSchema } from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import {
  assertWorkflowDispatchOpen,
  assertWorkflowFundingIdentity,
} from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import { CreditReservationStatus } from '@genfeedai/contracts';
import { WORKFLOW_GENERATION_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import type { WorkflowExecutionGenerationBilling } from '@genfeedai/contracts/interfaces/billing';
import { Prisma } from '@genfeedai/prisma';

/** Admission, proof and closure serialize on the same tenant-scoped execution row. */
export async function lockWorkflowExecutionFunding(
  tx: Prisma.TransactionClient,
  executionId: string,
  organizationId: string,
): Promise<WorkflowExecutionGenerationBilling | null> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "workflow_executions" WHERE "id" = ${executionId} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`,
  );
  const execution = await tx.workflowExecution.findFirst({
    where: { id: executionId, organizationId, isDeleted: false },
    select: { generationBilling: true },
  });
  if (!execution)
    throw new BusinessLogicException('Workflow execution is unavailable');
  if (!execution.generationBilling) return null;
  const plan = workflowExecutionGenerationBillingSchema.parse(
    execution.generationBilling,
  );
  assertWorkflowFundingIdentity(plan);
  if (
    plan.manifest.executionId !== executionId ||
    plan.manifest.organizationId !== organizationId
  )
    throw new BusinessLogicException(
      'Workflow funding belongs to another execution',
    );
  return plan;
}

/** New paid execution paths must never treat a missing manifest as admission. */
export async function assertWorkflowExecutionAdmission(
  tx: Prisma.TransactionClient,
  executionId: string,
  organizationId: string,
): Promise<WorkflowExecutionGenerationBilling> {
  const funding = await lockWorkflowExecutionFunding(
    tx,
    executionId,
    organizationId,
  );
  if (!funding)
    throw new BusinessLogicException('Workflow generation funding is missing');
  assertWorkflowDispatchOpen(funding);
  if (new Prisma.Decimal(funding.holdAmount).greaterThan(0)) {
    if (!funding.reservationId)
      throw new BusinessLogicException('Workflow generation hold is missing');
    const hold = await tx.creditReservation.findFirst({
      where: {
        id: funding.reservationId,
        organizationId,
        isDeleted: false,
        workloadType: WORKFLOW_GENERATION_WORKLOAD_TYPE,
        workloadId: executionId,
      },
      select: { amount: true, actorUserId: true, status: true, metadata: true },
    });
    if (
      !hold ||
      hold.status !== CreditReservationStatus.RESERVED ||
      hold.actorUserId !== funding.manifest.actorUserId ||
      !new Prisma.Decimal(hold.amount).equals(funding.holdAmount)
    )
      throw new BusinessLogicException(
        'Workflow generation hold cannot authorize dispatch',
      );
    const metadata = hold.metadata;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      workflowExecutionGenerationBillingSchema.parse(metadata.workflowFunding)
        .manifestHash !== funding.manifestHash
    )
      throw new BusinessLogicException(
        'Workflow financial hold differs from its execution manifest',
      );
  }
  return funding;
}
