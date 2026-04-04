import type { IBatchItem } from '@cloud/interfaces';
import { BatchItemStatus } from '@genfeedai/enums';

export function isApproved(item: IBatchItem): boolean {
  return item.reviewDecision === 'approved';
}

export function isChangesRequested(item: IBatchItem): boolean {
  return item.reviewDecision === 'request_changes';
}

export function isRejected(item: IBatchItem): boolean {
  return (
    item.reviewDecision === 'rejected' ||
    item.status === BatchItemStatus.SKIPPED
  );
}

export function isReadyToReview(item: IBatchItem): boolean {
  return item.status === BatchItemStatus.COMPLETED && !item.reviewDecision;
}

export function isPendingReview(item: IBatchItem): boolean {
  return (
    item.status === BatchItemStatus.PENDING ||
    item.status === BatchItemStatus.GENERATING
  );
}
