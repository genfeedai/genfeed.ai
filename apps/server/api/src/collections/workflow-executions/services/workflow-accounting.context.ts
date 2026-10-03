import { AsyncLocalStorage } from 'node:async_hooks';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { WorkflowAccountingScope } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

const storage = new AsyncLocalStorage<WorkflowAccountingScope>();
export function runWithWorkflowAccounting<T>(
  scope: WorkflowAccountingScope,
  callback: () => T,
): T {
  return storage.run(scope, callback);
}
export function workflowAccountingAttribution(
  organizationId: string,
): Partial<Omit<WorkflowAccountingScope, 'organizationId'>> {
  const scope = storage.getStore();
  if (!scope || scope.organizationId !== organizationId) return {};
  return {
    workflowExecutionId: scope.workflowExecutionId,
    workflowNodeId: scope.workflowNodeId,
    workflowOperationId: scope.workflowOperationId,
  };
}

export function currentWorkflowAccountingScope():
  | WorkflowAccountingScope
  | undefined {
  return storage.getStore();
}

export async function validatedWorkflowAccountingAttribution(
  prisma: Pick<Prisma.TransactionClient, 'workflowExecution'>,
  organizationId: string,
): Promise<Partial<Omit<WorkflowAccountingScope, 'organizationId'>>> {
  const attribution = workflowAccountingAttribution(organizationId);
  if (!attribution.workflowExecutionId) return attribution;
  const execution = await prisma.workflowExecution.findFirst({
    where: {
      id: attribution.workflowExecutionId,
      organizationId,
      isDeleted: false,
    },
    select: { id: true },
  });
  // Attribution is optional; an unavailable run must not cancel a valid charge.
  // The scoped lookup prevents attaching another organization's execution.
  if (!execution) return {};
  return attribution;
}

/**
 * Aggregate workflow funding carries explicit execution attribution without
 * borrowing a node's ALS scope, plus the owning workflow's brand.
 */
export async function validatedWorkflowFundingAttribution(
  prisma: Pick<Prisma.TransactionClient, 'workflowExecution'>,
  organizationId: string,
  workflowExecutionId: string,
): Promise<
  Pick<WorkflowAccountingScope, 'workflowExecutionId'> & { brandId?: string }
> {
  const execution = await prisma.workflowExecution.findFirst({
    where: { id: workflowExecutionId, organizationId, isDeleted: false },
    select: { id: true, workflow: { select: { brandId: true } } },
  });
  if (!execution)
    throw new BusinessLogicException(
      'Workflow funding execution is outside the organization',
    );
  // The workflow's brand is the spend's brand; a brandless workflow stays null.
  const brandId = execution.workflow?.brandId;
  return {
    workflowExecutionId: execution.id,
    ...(brandId ? { brandId } : {}),
  };
}
