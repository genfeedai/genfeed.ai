import { BatchItemStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  isApproved,
  isChangesRequested,
  isPendingReview,
  isReadyToReview,
  isRejected,
} from './review-state';

describe('review-state', () => {
  it('maps review decisions', () => {
    expect(isApproved({ reviewDecision: 'approved' } as never)).toBe(true);
    expect(
      isChangesRequested({ reviewDecision: 'request_changes' } as never),
    ).toBe(true);
  });

  it('treats skipped items as rejected', () => {
    expect(isRejected({ status: BatchItemStatus.SKIPPED } as never)).toBe(true);
  });

  it('derives review readiness from batch status', () => {
    expect(
      isReadyToReview({ status: BatchItemStatus.COMPLETED } as never),
    ).toBe(true);
    expect(isPendingReview({ status: BatchItemStatus.PENDING } as never)).toBe(
      true,
    );
    expect(
      isPendingReview({ status: BatchItemStatus.GENERATING } as never),
    ).toBe(true);
  });
});
