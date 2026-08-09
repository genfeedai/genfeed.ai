import {
  BatchItemStatus,
  normalizeReviewDecision,
  ReviewDecision,
} from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';

export function isApproved(item: IBatchItem): boolean {
  return (
    normalizeReviewDecision(item.reviewDecision) === ReviewDecision.APPROVED
  );
}

export function isChangesRequested(item: IBatchItem): boolean {
  return (
    normalizeReviewDecision(item.reviewDecision) ===
    ReviewDecision.REQUEST_CHANGES
  );
}

export function isRejected(item: IBatchItem): boolean {
  return (
    normalizeReviewDecision(item.reviewDecision) === ReviewDecision.REJECTED ||
    item.status === BatchItemStatus.SKIPPED
  );
}

export function isReadyToReview(item: IBatchItem): boolean {
  return (
    item.status === BatchItemStatus.COMPLETED &&
    normalizeReviewDecision(item.reviewDecision) === ReviewDecision.UNSET
  );
}

export function isPendingReview(item: IBatchItem): boolean {
  return (
    item.status === BatchItemStatus.PENDING ||
    item.status === BatchItemStatus.PROCESSING
  );
}
