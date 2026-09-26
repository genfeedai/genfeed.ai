import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import type { ReviewInboxItemSummary } from '@api/services/batch-generation/batch-generation.types';

/**
 * Attach the media-gate reasons (#4881) to review inbox items so a reviewer
 * sees why an asset was held back. Read from persisted gate results; an
 * unwired assessment leaves the items unchanged.
 */
export async function withMediaAssessmentReasons(
  items: ReviewInboxItemSummary[],
  organizationId: string,
  policy: Pick<AutonomousPublishPolicyService, 'assessPostMediaReasons'>,
): Promise<ReviewInboxItemSummary[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!item.postId) {
        return item;
      }
      const reasons = await policy.assessPostMediaReasons(
        organizationId,
        item.postId,
      );
      return reasons.length > 0
        ? { ...item, mediaAssessmentReasons: reasons }
        : item;
    }),
  );
}
