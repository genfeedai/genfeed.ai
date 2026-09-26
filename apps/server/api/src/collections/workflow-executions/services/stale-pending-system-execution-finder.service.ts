import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

/**
 * Finds system-workflow executions (`agent.turn.execute` and friends carry a
 * deterministic `system-workflow-${id}` BullMQ jobId) that have sat
 * `PENDING` past a staleness threshold — candidates for
 * `PendingWorkflowExecutionReconcileService` to check for a live BullMQ job
 * and, if none exists, fail loudly instead of leaving the caller polling a
 * run that will never be claimed (#5162).
 *
 * Split out of `WorkflowExecutionsService` (already ~1000 lines) rather than
 * growing it further; this query has no other relationship to that service's
 * CRUD/lifecycle surface.
 */
@Injectable()
export class StalePendingSystemExecutionFinderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `createdAfter` bounds the scan to recent rows only (#5252 review). A
   * `PENDING` row from before this bound is left alone rather than failed —
   * it either predates every deploy this reconcile has run in, or is
   * genuinely ancient for reasons unrelated to #5162, and blindly failing it
   * would fire a fresh failure notification/webhook for something the user
   * has long since stopped waiting on.
   */
  async findMany(
    staleBefore: Date,
    createdAfter: Date,
    limit = 200,
  ): Promise<Array<{ id: string; organizationId: string }>> {
    // tenant-scope-ignore: this reconcile runs once per platform sweep tick across every organization, mirroring the other global reconcile jobs in apps/server/workers/src/scheduling
    return this.prisma.workflowExecution.findMany({
      select: { id: true, organizationId: true },
      take: limit,
      where: {
        createdAt: { gte: createdAfter, lt: staleBefore },
        isDeleted: false,
        result: { path: ['metadata', 'isSystemAction'], equals: true },
        status: PrismaWorkflowExecutionStatus.PENDING,
      },
    });
  }
}
