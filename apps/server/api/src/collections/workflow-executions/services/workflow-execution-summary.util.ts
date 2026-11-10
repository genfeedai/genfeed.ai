import { buildCustomerExecutionWhere } from '@api/collections/workflow-executions/services/workflow-execution-query.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { WorkflowExecutionStats } from '@genfeedai/contracts/types';
import { type Prisma, WorkflowExecutionStatus } from '@genfeedai/prisma';

export async function readWorkflowExecutionSummary(
  prisma: PrismaService,
  organizationId: string,
  where: Prisma.WorkflowExecutionWhereInput,
  dayStart: Date,
  dayEnd: Date,
): Promise<WorkflowExecutionStats> {
  const [totals, today] = await Promise.all([
    prisma.workflowExecution.groupBy({
      by: ['status'],
      where: scopedWhere(organizationId, where),
      _count: { _all: true },
      _sum: { creditsUsed: true },
    }),
    prisma.workflowExecution.groupBy({
      by: ['status'],
      where: scopedWhere(organizationId, {
        ...where,
        completedAt: { gte: dayStart, lt: dayEnd },
      }),
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

export async function readWorkflowExecutionStats(
  prisma: PrismaService,
  organizationId: string,
  workflowId: string,
): Promise<{
  total: number;
  completed: number;
  failed: number;
  avgDurationMs: number;
}> {
  const where = scopedWhere(
    organizationId,
    buildCustomerExecutionWhere(organizationId, { workflowId }),
  );
  // A workflow runs for as long as the customer keeps it, so its execution
  // history is unbounded. Count and average in SQL instead of loading every row.
  const [byStatus, duration] = await Promise.all([
    prisma.workflowExecution.groupBy({
      _count: { _all: true },
      by: ['status'],
      where,
    }),
    prisma.workflowExecution.aggregate({
      _avg: { durationMs: true },
      where: { AND: [where, { durationMs: { gt: 0 } }] },
    }),
  ]);
  const countFor = (status: WorkflowExecutionStatus): number =>
    byStatus.find((group) => group.status === status)?._count._all ?? 0;
  const total = byStatus.reduce((sum, group) => sum + group._count._all, 0);

  return {
    avgDurationMs: duration._avg.durationMs ?? 0,
    completed: countFor(WorkflowExecutionStatus.COMPLETED),
    failed: countFor(WorkflowExecutionStatus.FAILED),
    total,
  };
}
