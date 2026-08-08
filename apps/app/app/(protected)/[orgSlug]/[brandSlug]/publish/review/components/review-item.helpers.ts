import { BatchItemStatus } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';

import {
  isApproved,
  isChangesRequested,
  isReadyToReview,
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
      return 'Skipped';
    default:
      return String(item.status).replaceAll('_', ' ').toLowerCase();
  }
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
