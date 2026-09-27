import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

export interface StalePendingSystemExecutionCandidate {
  id: string;
  organizationId: string;
  createdAt: Date;
}

/**
 * Keyset cursor for stable pagination, paired with `ORDER BY createdAt ASC,
 * id ASC` below: `createdAt` alone is not unique, so the `id` tiebreaker is
 * what makes "resume strictly after this row" exact instead of merely
 * approximate (#5319 — see `PendingWorkflowExecutionReconcileService`, which
 * owns advancing this across sweep ticks).
 */
export interface StalePendingSystemExecutionCursor {
  createdAt: Date;
  id: string;
}

export interface StalePendingSystemExecutionQueryOptions {
  limit?: number;
  cursor?: StalePendingSystemExecutionCursor;
}

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
 *
 * Both cohorts below page with a `(createdAt, id)` keyset `cursor` instead of
 * `skip`, so a caller can resume a sweep exactly where the previous page (or
 * the previous tick) left off without re-scanning or missing rows as the
 * underlying `PENDING` set shrinks and grows out from under a multi-page
 * traversal (#5319).
 */
@Injectable()
export class StalePendingSystemExecutionFinderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `createdAfter` bounds this to a recent window (#5252 review): a row this
   * fresh is worth a loud failure — the caller is very likely still polling
   * for it. Older rows go through `findManyAncient` instead, which closes
   * them without a customer-facing notification.
   */
  async findMany(
    staleBefore: Date,
    createdAfter: Date,
    options: StalePendingSystemExecutionQueryOptions = {},
  ): Promise<StalePendingSystemExecutionCandidate[]> {
    return this.queryPage({ gte: createdAfter, lt: staleBefore }, options);
  }

  /**
   * Rows older than `createdBefore` — the mirror image of `findMany`'s lower
   * bound (#5252 review). A `PENDING` row this old is never a caller still
   * waiting on today's run; it is either a very old #5162-shaped bug or
   * something unrelated. Either way it must not stay `PENDING` forever, but
   * firing a *fresh* failure notification/webhook for something the user
   * stopped watching long ago would be its own bug — the caller closes these
   * silently instead (see `PendingWorkflowExecutionReconcileService`).
   */
  async findManyAncient(
    createdBefore: Date,
    options: StalePendingSystemExecutionQueryOptions = {},
  ): Promise<StalePendingSystemExecutionCandidate[]> {
    return this.queryPage({ lt: createdBefore }, options);
  }

  /**
   * Shared query shape for both cohorts, ordered `[createdAt asc, id asc]`
   * so `cursor` (see the type doc above) resumes exactly past every row
   * already examined on a prior page — including a row that was examined
   * and left `PENDING` because its BullMQ job was still claimable. Without a
   * stable resume point, a cohort with more "still claimable" rows than a
   * single page could starve every candidate past the first page forever
   * (#5319, following up on #5252's review of #5162).
   */
  private async queryPage(
    createdAt: Prisma.WorkflowExecutionWhereInput['createdAt'],
    { limit = 200, cursor }: StalePendingSystemExecutionQueryOptions,
  ): Promise<StalePendingSystemExecutionCandidate[]> {
    const baseWhere: Prisma.WorkflowExecutionWhereInput = {
      createdAt,
      isDeleted: false,
      result: { path: ['metadata', 'isSystemAction'], equals: true },
      status: PrismaWorkflowExecutionStatus.PENDING,
    };

    // tenant-scope-ignore: this reconcile runs once per platform sweep tick across every organization, mirroring the other global reconcile jobs in apps/server/workers/src/scheduling
    return this.prisma.workflowExecution.findMany({
      select: { createdAt: true, id: true, organizationId: true },
      take: limit,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: cursor
        ? {
            AND: [
              baseWhere,
              {
                OR: [
                  { createdAt: { gt: cursor.createdAt } },
                  {
                    AND: [
                      { createdAt: cursor.createdAt },
                      { id: { gt: cursor.id } },
                    ],
                  },
                ],
              },
            ],
          }
        : baseWhere,
    });
  }
}
