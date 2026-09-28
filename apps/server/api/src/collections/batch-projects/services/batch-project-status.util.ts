import {
  BatchProjectItemStatus,
  BatchProjectStatus,
} from '@genfeedai/contracts';
import type { IBatchProjectItemCounts } from '@genfeedai/contracts/interfaces';

/** Accepts the contracts enum and the persisted Prisma label alike. */
export type BatchProjectItemStatusValue = `${BatchProjectItemStatus}`;
export type BatchProjectStatusValue = `${BatchProjectStatus}`;

export type BatchProjectStatusItem = {
  scheduledAt?: Date | string | null;
  status: BatchProjectItemStatusValue;
};

export function countBatchProjectItems(
  items: readonly BatchProjectStatusItem[],
): IBatchProjectItemCounts {
  const counts: IBatchProjectItemCounts = {
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
      case BatchProjectItemStatus.PENDING:
        counts.pending += 1;
        break;
      case BatchProjectItemStatus.GENERATING:
        counts.generating += 1;
        break;
      case BatchProjectItemStatus.READY:
        counts.ready += 1;
        break;
      case BatchProjectItemStatus.FAILED:
        counts.failed += 1;
        break;
      case BatchProjectItemStatus.APPROVED:
        counts.approved += 1;
        break;
      case BatchProjectItemStatus.REJECTED:
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
export function deriveBatchProjectStatus(
  items: readonly BatchProjectStatusItem[],
  current: BatchProjectStatusValue,
): BatchProjectStatus {
  const counts = countBatchProjectItems(items);
  if (counts.generating > 0) {
    return BatchProjectStatus.GENERATING;
  }
  if (current === BatchProjectStatus.CANCELLED) {
    return BatchProjectStatus.CANCELLED;
  }
  if (counts.total === 0 || counts.pending === counts.total) {
    return BatchProjectStatus.DRAFT;
  }
  const unscheduledApprovals = items.filter(
    (item) =>
      item.status === BatchProjectItemStatus.APPROVED && !item.scheduledAt,
  ).length;
  if (counts.ready > 0 || counts.pending > 0 || unscheduledApprovals > 0) {
    return BatchProjectStatus.REVIEWING;
  }
  if (counts.failed > 0) {
    return BatchProjectStatus.PARTIAL_FAILURE;
  }
  if (counts.scheduled > 0) {
    return BatchProjectStatus.SCHEDULED;
  }
  return BatchProjectStatus.COMPLETED;
}
