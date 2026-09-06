import { AsyncLocalStorage } from 'node:async_hooks';
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
