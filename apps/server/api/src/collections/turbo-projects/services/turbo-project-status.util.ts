import {
  TurboProjectItemStatus,
  TurboProjectStatus,
} from '@genfeedai/contracts';
import type { ITurboProjectItemCounts } from '@genfeedai/contracts/interfaces';

/** Accepts the contracts enum and the persisted Prisma label alike. */
export type TurboProjectItemStatusValue = `${TurboProjectItemStatus}`;
export type TurboProjectStatusValue = `${TurboProjectStatus}`;

export type TurboProjectStatusItem = {
  scheduledAt?: Date | string | null;
  status: TurboProjectItemStatusValue;
};

export function countTurboProjectItems(
  items: readonly TurboProjectStatusItem[],
): ITurboProjectItemCounts {
  const counts: ITurboProjectItemCounts = {
    approved: 0,
    failed: 0,
    generating: 0,
    pending: 0,
    ready: 0,
    rejected: 0,
    scheduled: 0,
    total: items.length,
  };
  for (const item of items) {
    switch (item.status) {
      case TurboProjectItemStatus.PENDING:
        counts.pending += 1;
        break;
      case TurboProjectItemStatus.GENERATING:
        counts.generating += 1;
        break;
      case TurboProjectItemStatus.READY:
        counts.ready += 1;
        break;
      case TurboProjectItemStatus.FAILED:
        counts.failed += 1;
        break;
      case TurboProjectItemStatus.APPROVED:
        counts.approved += 1;
        break;
      case TurboProjectItemStatus.REJECTED:
        counts.rejected += 1;
        break;
    }
    if (item.scheduledAt) {
      counts.scheduled += 1;
    }
  }
  return counts;
}

/**
 * The project state its items imply. Generation in flight wins; untouched
 * inputs are a draft; anything still to review or schedule keeps the project
 * in review. Once every item is settled, a failure makes it a partial failure,
 * a scheduled approval makes it scheduled, and an all-rejected run completes.
 * A cancelled project stays cancelled unless generation restarts.
 */
export function deriveTurboProjectStatus(
  items: readonly TurboProjectStatusItem[],
  current: TurboProjectStatusValue,
): TurboProjectStatus {
  const counts = countTurboProjectItems(items);
  if (counts.generating > 0) {
    return TurboProjectStatus.GENERATING;
  }
  if (current === TurboProjectStatus.CANCELLED) {
    return TurboProjectStatus.CANCELLED;
  }
  if (counts.total === 0 || counts.pending === counts.total) {
    return TurboProjectStatus.DRAFT;
  }
  const unscheduledApprovals = items.filter(
    (item) =>
      item.status === TurboProjectItemStatus.APPROVED && !item.scheduledAt,
  ).length;
  if (counts.ready > 0 || counts.pending > 0 || unscheduledApprovals > 0) {
    return TurboProjectStatus.REVIEWING;
  }
  if (counts.failed > 0) {
    return TurboProjectStatus.PARTIAL_FAILURE;
  }
  if (counts.scheduled > 0) {
    return TurboProjectStatus.SCHEDULED;
  }
  return TurboProjectStatus.COMPLETED;
}
