import { normalizeReviewDecision, ReviewDecision } from '@genfeedai/contracts';

export interface PostReviewLineageFields {
  reviewBatchId?: string | null;
  reviewItemId?: string | null;
}

export interface PostAwaitingReviewFields extends PostReviewLineageFields {
  reviewDecision?: unknown;
}

/**
 * A post only has review lineage when it actually came from a review batch
 * or item. A post created outside review flow never has either field set.
 */
export function hasPostReviewLineage(post: PostReviewLineageFields): boolean {
  return Boolean(post.reviewBatchId) || Boolean(post.reviewItemId);
}

/**
 * A post is genuinely awaiting review only when it has review lineage and no
 * decision has been recorded yet. An ordinary draft that was never submitted
 * for review, and a rejected draft that already has a decision, both fail
 * this — treating either as "awaiting review" pointed the reviewer at the
 * wrong queue and mislabeled content nobody is waiting on (#5483 fix,
 * Codex P2 finding).
 */
export function isPostAwaitingReview(post: PostAwaitingReviewFields): boolean {
  return (
    hasPostReviewLineage(post) &&
    normalizeReviewDecision(post.reviewDecision) === ReviewDecision.UNSET
  );
}
