import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { WorkflowExecutionStats } from '@genfeedai/contracts/types';
import { type Prisma, WorkflowExecutionStatus } from '@genfeedai/prisma';

export async function readWorkflowExecutionSummary(
  prisma: PrismaService,
  where: Prisma.WorkflowExecutionWhereInput,
  dayStart: Date,
  dayEnd: Date,
): Promise<WorkflowExecutionStats> {
  const [totals, today] = await Promise.all([
    prisma.workflowExecution.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { creditsUsed: true },
    }),
    prisma.workflowExecution.groupBy({
      by: ['status'],
      where: { ...where, completedAt: { gte: dayStart, lt: dayEnd } },
      _count: { _all: true },
    }),
  ]);
  const stats: WorkflowExecutionStats = {
    active: 0,
    completed: 0,
    completedToday: 0,
    failed: 0,
    failedToday: 0,
    total: 0,
    totalCredits: 0,
  };
  for (const group of totals) {
    const count = group._count._all;
    stats.total += count;
    stats.totalCredits += group._sum.creditsUsed ?? 0;
    if (group.status === WorkflowExecutionStatus.COMPLETED)
      stats.completed += count;
    if (group.status === WorkflowExecutionStatus.FAILED) stats.failed += count;
    if (
      group.status === WorkflowExecutionStatus.PENDING ||
      group.status === WorkflowExecutionStatus.RUNNING
    )
      stats.active += count;
  }
  for (const group of today) {
    if (group.status === WorkflowExecutionStatus.COMPLETED)
      stats.completedToday += group._count._all;
    if (group.status === WorkflowExecutionStatus.FAILED)
      stats.failedToday += group._count._all;
  }
  return stats;
}
