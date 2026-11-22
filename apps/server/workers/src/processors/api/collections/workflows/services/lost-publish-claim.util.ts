import { SCHEDULED_POST_WORKFLOW_ID } from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { PUBLISH_APPROVAL_CLAIMED_BY_ANOTHER_RUN_MESSAGE } from '@api/publish-approvals/publish-claim-held.util';

const CLAIM_NODE_ID = 'claim-publish';

/**
 * Whether a failed system run is a scheduled publish that lost its claim to
 * another run. The sweeps of two worker tasks that overlap at a deploy can
 * queue the same approval twice; the claim swaps queued to executing exactly
 * once, so the run that lost has nothing to publish and the winner owns the
 * post. A graph run flattens node errors into `Nodes failed: <node>:
 * <message>`; only a run whose single failed node is the claim counts.
 */
export function isLostPublishClaim(
  canonicalId: string,
  message: string | undefined,
): boolean {
  return (
    canonicalId === SCHEDULED_POST_WORKFLOW_ID &&
    message ===
      `Nodes failed: ${CLAIM_NODE_ID}: ${PUBLISH_APPROVAL_CLAIMED_BY_ANOTHER_RUN_MESSAGE}`
  );
}
