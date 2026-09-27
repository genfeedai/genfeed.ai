import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  StalePendingSystemExecutionCandidate,
  StalePendingSystemExecutionCursor,
  StalePendingSystemExecutionQueryOptions,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
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
 *
 * Both cohorts below page with a `(createdAt, id)` keyset `cursor` instead of
 * `skip`, so a caller can resume a sweep exactly where the previous page (or
 * the previous tick) left off without re-scanning or missing rows as the
 * underlying `PENDING` set shrinks and grows out from under a multi-page
 * traversal. An optional `upperBoundary` additionally caps a multi-tick lap
 * to the finite set of rows that matched when that lap started, via
 * `findUpperBoundary`/`findUpperBoundaryAncient` below (#5319).
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
   * The current last row (by `[createdAt, id]` ascending) of the recent
   * cohort — i.e. its upper edge right now. `PendingWorkflowExecutionReconcileService`
   * captures this once when it starts a new lap and passes it back as
   * `upperBoundary` on every page of that lap, so the lap has a finite,
   * fixed end regardless of how many more rows enter the cohort's moving
   * `[createdAfter, staleBefore)` window on later ticks (#5319).
   */
  async findUpperBoundary(
    staleBefore: Date,
    createdAfter: Date,
  ): Promise<StalePendingSystemExecutionCursor | undefined> {
    return this.queryUpperBoundary({ gte: createdAfter, lt: staleBefore });
  }

  /** The ancient cohort's mirror of `findUpperBoundary` (#5319). */
  async findUpperBoundaryAncient(
    createdBefore: Date,
  ): Promise<StalePendingSystemExecutionCursor | undefined> {
    return this.queryUpperBoundary({ lt: createdBefore });
  }

  private buildBaseWhere(
    createdAt: Prisma.WorkflowExecutionWhereInput['createdAt'],
  ): Prisma.WorkflowExecutionWhereInput {
    return {
      createdAt,
      isDeleted: false,
      result: { path: ['metadata', 'isSystemAction'], equals: true },
      status: PrismaWorkflowExecutionStatus.PENDING,
    };
  }

  private async queryUpperBoundary(
    createdAt: Prisma.WorkflowExecutionWhereInput['createdAt'],
  ): Promise<StalePendingSystemExecutionCursor | undefined> {
    // tenant-scope-ignore: this reconcile runs once per platform sweep tick across every organization, mirroring the other global reconcile jobs in apps/server/workers/src/scheduling
    const [last] = await this.prisma.workflowExecution.findMany({
      select: { createdAt: true, id: true },
      take: 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: this.buildBaseWhere(createdAt),
    });
    return last;
  }

  /**
   * Shared query shape for both cohorts, ordered `[createdAt asc, id asc]`
   * so `cursor` (see the type doc on `StalePendingSystemExecutionCursor`)
   * resumes exactly past every row already examined on a prior page —
   * including a row that was examined and left `PENDING` because its BullMQ
   * job was still claimable. Without a stable resume point, a cohort with
   * more "still claimable" rows than a single page could starve every
   * candidate past the first page forever (#5319, following up on #5252's
   * review of #5162).
   *
   * `upperBoundary`, when supplied, additionally caps the scan to rows at or
   * before that snapshot tuple — see the type doc for why a lap needs this
   * on top of `cursor` alone.
   */
  private async queryPage(
    createdAt: Prisma.WorkflowExecutionWhereInput['createdAt'],
    {
      limit = 200,
      cursor,
      upperBoundary,
    }: StalePendingSystemExecutionQueryOptions,
  ): Promise<StalePendingSystemExecutionCandidate[]> {
    const conditions: Prisma.WorkflowExecutionWhereInput[] = [
      this.buildBaseWhere(createdAt),
    ];
    if (cursor) {
      conditions.push({
        OR: [
          { createdAt: { gt: cursor.createdAt } },
          {
            AND: [{ createdAt: cursor.createdAt }, { id: { gt: cursor.id } }],
          },
        ],
      });
    }
    if (upperBoundary) {
      conditions.push({
        OR: [
          { createdAt: { lt: upperBoundary.createdAt } },
          {
            AND: [
              { createdAt: upperBoundary.createdAt },
              { id: { lte: upperBoundary.id } },
            ],
          },
        ],
      });
    }

    // tenant-scope-ignore: this reconcile runs once per platform sweep tick across every organization, mirroring the other global reconcile jobs in apps/server/workers/src/scheduling
    return this.prisma.workflowExecution.findMany({
      select: { createdAt: true, id: true, organizationId: true },
      take: limit,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: conditions.length === 1 ? conditions[0] : { AND: conditions },
    });
  }
}
