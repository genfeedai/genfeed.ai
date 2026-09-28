import { ReviewDecision } from '@genfeedai/contracts';
import {
  hasPostReviewLineage,
  isPostAwaitingReview,
} from '@helpers/content/post-review.helper';
import { describe, expect, it } from 'vitest';

describe('hasPostReviewLineage', () => {
  it('is false for a post with neither a review batch nor a review item', () => {
    expect(hasPostReviewLineage({})).toBe(false);
  });

  it('is true once a review batch id is present', () => {
    expect(hasPostReviewLineage({ reviewBatchId: 'batch-1' })).toBe(true);
  });

  it('is true once a review item id is present', () => {
    expect(hasPostReviewLineage({ reviewItemId: 'item-1' })).toBe(true);
  });
});

describe('isPostAwaitingReview', () => {
  it('is false for an ordinary draft with no review lineage', () => {
    expect(isPostAwaitingReview({ reviewDecision: ReviewDecision.UNSET })).toBe(
      false,
    );
  });

  it('is false for a rejected post even with review lineage', () => {
    expect(
      isPostAwaitingReview({
        reviewBatchId: 'batch-1',
        reviewDecision: ReviewDecision.REJECTED,
      }),
    ).toBe(false);
  });

  it('is false for an approved post even with review lineage', () => {
    expect(
      isPostAwaitingReview({
        reviewBatchId: 'batch-1',
        reviewDecision: ReviewDecision.APPROVED,
      }),
    ).toBe(false);
  });

  it('is true only for a post with review lineage and an unset decision', () => {
    expect(
      isPostAwaitingReview({
        reviewDecision: ReviewDecision.UNSET,
        reviewItemId: 'item-1',
      }),
    ).toBe(true);
  });
});
