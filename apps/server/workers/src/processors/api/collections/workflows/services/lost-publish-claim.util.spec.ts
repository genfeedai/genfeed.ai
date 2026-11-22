import {
  buildScheduledPostWorkflowDefinition,
  SCHEDULED_POST_ACTION_IDS,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { isLostPublishClaim } from '@workers/processors/api/collections/workflows/services/lost-publish-claim.util';
import { describe, expect, it } from 'vitest';

const CLAIMED = 'Publish approval is already claimed by another run.';

describe('isLostPublishClaim', () => {
  it.each([
    [
      'the lost claim of a scheduled publish',
      'scheduled-post.publish',
      `Nodes failed: claim-publish: ${CLAIMED}`,
      true,
    ],
    [
      'a claim that failed for another reason',
      'scheduled-post.publish',
      'Nodes failed: claim-publish: Publish approval is not queued.',
      false,
    ],
    [
      'the lost claim plus another failed node',
      'scheduled-post.publish',
      `Nodes failed: claim-publish: ${CLAIMED}, deliver-post: provider down`,
      false,
    ],
    [
      'the same message in another workflow',
      'agent.turn.execute',
      `Nodes failed: claim-publish: ${CLAIMED}`,
      false,
    ],
    ['no message', 'scheduled-post.publish', undefined, false],
  ])('treats %s as lost: %s', (_label, canonicalId, message, isLost) => {
    expect(isLostPublishClaim(canonicalId, message)).toBe(isLost);
  });

  it('names the node the scheduled publish graph runs its claim in', () => {
    const { nodes } = buildScheduledPostWorkflowDefinition().definition;

    expect(
      nodes.find((node) =>
        JSON.stringify(node.data).includes(SCHEDULED_POST_ACTION_IDS.CLAIM),
      )?.id,
    ).toBe('claim-publish');
  });
});
