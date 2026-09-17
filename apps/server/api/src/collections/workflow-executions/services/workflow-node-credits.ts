import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';

/**
 * Sum credits already persisted on completed node-result rows.
 *
 * Clip-chain settlement charges completed segments against the run-level
 * reservation. `execution.creditsUsed` stays 0 until `completeExecution` is
 * given a total, so throw/resume/fail paths read this sum instead.
 */
export async function sumPersistedNodeCredits(
  prisma: PrismaService,
  executionId: string,
  organizationId: string,
): Promise<number> {
  const result = await prisma.workflowExecutionNodeResult.aggregate({
    _sum: { creditsUsed: true },
    where: {
      executionId,
      organizationId,
      status: {
        in: [WorkflowExecutionStatus.COMPLETED, 'completed'],
      },
    },
  });
  const total = result._sum.creditsUsed;
  return typeof total === 'number' && Number.isFinite(total)
    ? Math.max(0, total)
    : 0;
}
