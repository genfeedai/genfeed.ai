import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const ANNOUNCEMENT_BROADCAST_ACTION_IDS = {
  PERSIST: 'admin.announcement.persist',
  PUBLISH_DISCORD: 'admin.announcement.publish-discord',
  PUBLISH_TWITTER: 'admin.announcement.publish-twitter',
} as const;

export const ANNOUNCEMENT_BROADCAST_WORKFLOW_ID =
  'admin.announcement.broadcast';

export function buildAnnouncementBroadcastWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: ANNOUNCEMENT_BROADCAST_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'discord-to-persist',
          source: 'publish-discord',
          target: 'persist-announcement',
          targetHandle: 'discord',
        },
        {
          id: 'twitter-to-persist',
          source: 'publish-twitter',
          target: 'persist-announcement',
          targetHandle: 'twitter',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Announcement broadcast',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: ANNOUNCEMENT_BROADCAST_ACTION_IDS.PUBLISH_DISCORD,
          id: 'publish-discord',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: ANNOUNCEMENT_BROADCAST_ACTION_IDS.PUBLISH_TWITTER,
          id: 'publish-twitter',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: ANNOUNCEMENT_BROADCAST_ACTION_IDS.PERSIST,
          id: 'persist-announcement',
          inputVariableKeys: ['request'],
        }),
      ],
    },
    description:
      'Publishes an admin announcement to its selected channels and persists the delivery record.',
    label: 'Broadcast Admin Announcement',
    resultNodeId: 'persist-announcement',
    version: 1,
  };
}
