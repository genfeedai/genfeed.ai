import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { LibraryReviewState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** The persisted `Task.reviewState` values a review request moves through. */
const PENDING = 'pending_approval';
const APPROVED = 'approved';
const CHANGES_REQUESTED = 'changes_requested';

/** A review request on an asset: assigned to a reviewer and not dismissed. */
const OPEN_REQUEST = { assigneeUserId: { not: null }, isDeleted: false };

function taskIn(reviewState: string): Prisma.TaskWhereInput {
  return { ...OPEN_REQUEST, reviewState };
}

/**
 * Library review state (#9948): the summed state of every review request on an
 * asset, as a list filter and as a badge on each row. See `LibraryReviewState`
 * for the precedence; the filter and the badge use the same rule so an asset
 * never shows one state under another state's filter.
 */
@Traced()
@Injectable()
export class IngredientReviewStateService {
  constructor(private readonly prisma: PrismaService) {}

  /** The Prisma fragment for `?review=`; empty when no state is asked for. */
  buildFilter(
    review: LibraryReviewState | undefined,
  ): Prisma.IngredientWhereInput {
    switch (review) {
      case LibraryReviewState.CHANGES_REQUESTED:
        return { taskLinkedOutputs: { some: taskIn(CHANGES_REQUESTED) } };
      case LibraryReviewState.IN_REVIEW:
        return {
          AND: [
            { taskLinkedOutputs: { some: taskIn(PENDING) } },
            { taskLinkedOutputs: { none: taskIn(CHANGES_REQUESTED) } },
          ],
        };
      case LibraryReviewState.APPROVED:
        return {
          AND: [
            { taskLinkedOutputs: { some: taskIn(APPROVED) } },
            { taskLinkedOutputs: { none: taskIn(PENDING) } },
            { taskLinkedOutputs: { none: taskIn(CHANGES_REQUESTED) } },
          ],
        };
      default:
        return {};
    }
  }

  /** Puts `reviewState` on every asset of a list page. */
  async attachToPage<T extends { id: string; organizationId?: string | null }>(
    page: { docs: T[] },
    organizationId: string | undefined,
  ): Promise<{ docs: (T & { reviewState: LibraryReviewState | null })[] }> {
    const ids = page.docs.map((doc) => doc.id);
    const states = await this.summarize(organizationId, ids);
    return {
      ...page,
      docs: page.docs.map((doc) => ({
        ...doc,
        reviewState: states.get(doc.id) ?? null,
      })),
    };
  }

  async summarize(
    organizationId: string | undefined,
    ingredientIds: readonly string[],
  ): Promise<Map<string, LibraryReviewState>> {
    const summary = new Map<string, LibraryReviewState>();
    if (!organizationId || ingredientIds.length === 0) {
      return summary;
    }
    const tasks = await this.prisma.task.findMany({
      select: { linkedOutputs: { select: { id: true } }, reviewState: true },
      where: scopedWhere(organizationId, {
        ...OPEN_REQUEST,
        linkedOutputs: { some: { id: { in: [...ingredientIds] } } },
        reviewState: { in: [PENDING, APPROVED, CHANGES_REQUESTED] },
      }),
    });
    const seen = new Map<string, Set<string>>();
    for (const task of tasks) {
      for (const { id } of task.linkedOutputs) {
        seen.set(id, (seen.get(id) ?? new Set()).add(task.reviewState));
      }
    }
    for (const [id, states] of seen) {
      summary.set(id, this.fold(states));
    }
    return summary;
  }

  private fold(states: ReadonlySet<string>): LibraryReviewState {
    if (states.has(CHANGES_REQUESTED)) {
      return LibraryReviewState.CHANGES_REQUESTED;
    }
    return states.has(PENDING)
      ? LibraryReviewState.IN_REVIEW
      : LibraryReviewState.APPROVED;
  }
}
