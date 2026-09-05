import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { WorkflowAccountingScope } from '@genfeedai/contracts/interfaces';

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
  prisma: PrismaService,
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
  if (!execution)
    throw new Error('Workflow accounting execution is outside organization');
  return attribution;
}
