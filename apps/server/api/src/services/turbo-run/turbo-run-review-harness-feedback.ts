import type { HarnessReviewFeedbackService } from '@api/services/harness/harness-review-feedback.service';
import type { TurboRunItemFull } from '@api/services/turbo-run/turbo-run.types';
import { ReviewDecision } from '@genfeedai/contracts';

/**
 * Feeds human review decisions on generated Turbo run items back into the
 * brand's harness profile: anti-examples for rejections and change requests,
 * positive examples for approvals. Fire-and-forget: the harness service never
 * throws, but this is still not awaited so a slow or failed feedback write
 * can never delay or fail the review action itself.
 */
export function recordTurboReviewFeedback(
  feedbackService: HarnessReviewFeedbackService | undefined,
  items: TurboRunItemFull[],
  decision: ReviewDecision,
  organizationId: string,
  brandId: string | undefined,
  options: { reason?: string; userId?: string } = {},
): void {
  if (!feedbackService) {
    return;
  }

  for (const item of items) {
    const content = item.caption ?? item.prompt;
    if (!content) {
      continue;
    }
    void feedbackService.recordReviewDecision({
      brandId,
      content,
      decision,
      organizationId,
      reason: options.reason,
      sourceId: item.id,
      sourceType: 'turbo_run_item',
      userId: options.userId,
    });
  }
}

/** A rewrite is logged as a `Content rewritten` change request on the item. */
export function hasBeenRewritten(item: TurboRunItemFull): boolean {
  return (item.reviewEvents ?? []).some(
    (event) => event.decision === ReviewDecision.REQUEST_CHANGES,
  );
}
