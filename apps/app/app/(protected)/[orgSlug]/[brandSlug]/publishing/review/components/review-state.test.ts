import { BatchItemStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { isPendingReview, isReadyToReview } from './review-state';

describe('review-state', () => {
  it('derives review readiness from batch status', () => {
    expect(
      isReadyToReview({ status: BatchItemStatus.COMPLETED } as never),
    ).toBe(true);
    expect(isPendingReview({ status: BatchItemStatus.PENDING } as never)).toBe(
      true,
    );
    expect(
      isPendingReview({ status: BatchItemStatus.PROCESSING } as never),
    ).toBe(true);
  });
});
