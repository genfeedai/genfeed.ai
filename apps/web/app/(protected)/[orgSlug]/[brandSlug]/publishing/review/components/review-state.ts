import {
  normalizeReviewDecision,
  ReviewDecision,
  TurboRunItemStatus,
} from '@genfeedai/contracts';
import type { ITurboRunItem } from '@genfeedai/contracts/interfaces';

export function isApproved(item: ITurboRunItem): boolean {
  return (
    normalizeReviewDecision(item.reviewDecision) === ReviewDecision.APPROVED
  );
}

export function isChangesRequested(item: ITurboRunItem): boolean {
  return (
    normalizeReviewDecision(item.reviewDecision) ===
    ReviewDecision.REQUEST_CHANGES
  );
}

export function isRejected(item: ITurboRunItem): boolean {
  return (
    normalizeReviewDecision(item.reviewDecision) === ReviewDecision.REJECTED ||
    item.status === TurboRunItemStatus.SKIPPED
  );
}

export function isReadyToReview(item: ITurboRunItem): boolean {
  return (
    item.status === TurboRunItemStatus.COMPLETED &&
    normalizeReviewDecision(item.reviewDecision) === ReviewDecision.UNSET
  );
}

export function isPendingReview(item: ITurboRunItem): boolean {
  return (
    item.status === TurboRunItemStatus.PENDING ||
    item.status === TurboRunItemStatus.PROCESSING
  );
}
