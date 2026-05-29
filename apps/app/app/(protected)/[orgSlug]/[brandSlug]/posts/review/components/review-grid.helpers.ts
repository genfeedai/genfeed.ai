import { BatchItemStatus } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import {
  isApproved,
  isChangesRequested,
  isPendingReview,
  isReadyToReview,
  isRejected,
} from './review-state';

export type ReviewFilter =
  | 'ready'
  | 'approved'
  | 'changes_requested'
  | 'failed'
  | 'pending'
  | 'skipped'
  | 'all';

export interface ReviewFilterCounts {
  all: number;
  approved: number;
  changes_requested: number;
  failed: number;
  pending: number;
  ready: number;
  skipped: number;
}

export function getReviewFilterCounts(items: IBatchItem[]): ReviewFilterCounts {
  return items.reduce<ReviewFilterCounts>(
    (counts, item) => {
      counts.all += 1;

      if (isApproved(item)) {
        counts.approved += 1;
        return counts;
      }

      if (isChangesRequested(item)) {
        counts.changes_requested += 1;
        return counts;
      }

      if (isReadyToReview(item)) {
        counts.ready += 1;
        return counts;
      }

      if (item.status === BatchItemStatus.FAILED) {
        counts.failed += 1;
        return counts;
      }

      if (isRejected(item)) {
        counts.skipped += 1;
        return counts;
      }

      if (isPendingReview(item)) {
        counts.pending += 1;
      }

      return counts;
    },
    {
      all: 0,
      approved: 0,
      changes_requested: 0,
      failed: 0,
      pending: 0,
      ready: 0,
      skipped: 0,
    },
  );
}

export function getVisibleReviewItems(
  items: IBatchItem[],
  activeFilter: ReviewFilter,
): IBatchItem[] {
  if (activeFilter === 'all') {
    return items;
  }

  return items.filter((item) => {
    switch (activeFilter) {
      case 'approved':
        return isApproved(item);
      case 'changes_requested':
        return isChangesRequested(item);
      case 'failed':
        return item.status === BatchItemStatus.FAILED;
      case 'pending':
        return isPendingReview(item);
      case 'ready':
        return isReadyToReview(item);
      case 'skipped':
        return isRejected(item);
      default:
        return true;
    }
  });
}
