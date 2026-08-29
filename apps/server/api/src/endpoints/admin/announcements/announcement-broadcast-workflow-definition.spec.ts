import {
  ANNOUNCEMENT_BROADCAST_ACTION_IDS,
  ANNOUNCEMENT_BROADCAST_WORKFLOW_ID,
  buildAnnouncementBroadcastWorkflowDefinition,
} from '@api/endpoints/admin/announcements/announcement-broadcast-workflow-definition';
import { describe, expect, it } from 'vitest';

describe('announcement broadcast workflow definition', () => {
  it('publishes through bounded channel actions before persistence', () => {
    const definition = buildAnnouncementBroadcastWorkflowDefinition();

    expect(definition.canonicalId).toBe(ANNOUNCEMENT_BROADCAST_WORKFLOW_ID);
    expect(
      definition.definition.nodes.map((node) => node.data?.actionId),
    ).toEqual([
      ANNOUNCEMENT_BROADCAST_ACTION_IDS.PUBLISH_DISCORD,
      ANNOUNCEMENT_BROADCAST_ACTION_IDS.PUBLISH_TWITTER,
      ANNOUNCEMENT_BROADCAST_ACTION_IDS.PERSIST,
    ]);
    expect(definition.definition.edges).toEqual([
      expect.objectContaining({
        source: 'publish-discord',
        target: 'persist-announcement',
        targetHandle: 'discord',
      }),
      expect.objectContaining({
        source: 'publish-twitter',
        target: 'persist-announcement',
        targetHandle: 'twitter',
      }),
    ]);
  });
});
