import { BatchItemStatus } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';

import {
  isApproved,
  isChangesRequested,
  isReadyToReview,
  isRejected,
} from './review-state';

export function formatReviewItemStatus(item: IBatchItem): string {
  if (isApproved(item)) {
    return 'Approved';
  }
  if (isChangesRequested(item)) {
    return 'Changes requested';
  }
  if (item.reviewDecision === 'rejected') {
    return 'Rejected';
  }
  switch (item.status) {
    case BatchItemStatus.COMPLETED:
      return 'Ready';
    case BatchItemStatus.FAILED:
      return 'Failed';
    case BatchItemStatus.PROCESSING:
      return 'Generating';
    case BatchItemStatus.PENDING:
      return 'Pending';
    case BatchItemStatus.SKIPPED:
      // Backend maps reject → SKIPPED; product language is Rejected.
      return 'Rejected';
    default:
      return String(item.status).replaceAll('_', ' ').toLowerCase();
  }
}

/** Badge status token — only when it matches the product label we show. */
export function getReviewItemBadgeStatus(
  item: IBatchItem,
): 'completed' | 'failed' | 'pending' | undefined {
  if (isApproved(item)) {
    return 'completed';
  }
  if (item.reviewDecision === 'rejected' || isRejected(item)) {
    return 'failed';
  }
  if (isChangesRequested(item)) {
    return undefined;
  }
  if (item.status === BatchItemStatus.FAILED) {
    return 'failed';
  }
  if (item.status === BatchItemStatus.PENDING) {
    return 'pending';
  }
  // COMPLETED/ready, PROCESSING, etc. — use children label, not Badge's
  // statusConfig which maps COMPLETED→"Completed" and SKIPPED→"Draft".
  return undefined;
}

export function getReviewItemTitle(item: IBatchItem): string {
  return (
    item.caption?.trim() ||
    item.prompt?.trim() ||
    (item.postId ? 'Draft post' : 'Untitled post')
  );
}

export function isReviewItemSelectable(item: IBatchItem): boolean {
  return isReadyToReview(item);
}
