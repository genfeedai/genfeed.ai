import type { WorkflowExecutionCompletionRow } from '@api/collections/workflow-executions/services/workflow-execution-outcome.util';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

export async function findWorkflowExecutionCompletionRow(
  prisma: PrismaService,
  executionId: string,
  organizationId: string,
): Promise<WorkflowExecutionCompletionRow | null> {
  return (await prisma.workflowExecution.findFirst({
    select: {
      estimatedDurationMs: true,
      organizationId: true,
      startedAt: true,
      trigger: true,
      userId: true,
      workflowId: true,
      workflow: { select: { label: true, metadata: true, userId: true } },
    },
    where: scopedWhere(organizationId, { id: executionId }),
  })) as WorkflowExecutionCompletionRow | null;
}
