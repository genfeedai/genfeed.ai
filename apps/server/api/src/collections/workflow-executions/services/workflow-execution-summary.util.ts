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
  const executions = await prisma.workflowExecution.findMany({
    select: { durationMs: true, status: true },
    where: scopedWhere(
      organizationId,
      buildCustomerExecutionWhere(organizationId, { workflowId }),
    ),
  });
  const total = executions.length;
  const completed = executions.filter(
    (execution) => execution.status === WorkflowExecutionStatus.COMPLETED,
  ).length;
  const failed = executions.filter(
    (execution) => execution.status === WorkflowExecutionStatus.FAILED,
  ).length;
  const durationsWithValue = executions
    .map((execution) => execution.durationMs)
    .filter((duration): duration is number => {
      return typeof duration === 'number' && duration > 0;
    });
  const avgDurationMs =
    durationsWithValue.length > 0
      ? durationsWithValue.reduce((sum, duration) => sum + duration, 0) /
        durationsWithValue.length
      : 0;

  return { avgDurationMs, completed, failed, total };
}
