import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { Platform, SocialConversationType } from '@genfeedai/enums';

export type SocialInboxSyncPlatform =
  | Platform.INSTAGRAM
  | Platform.LINKEDIN
  | Platform.TWITTER
  | Platform.YOUTUBE;

export type SocialInboxSyncConversationType =
  | SocialConversationType.COMMENT
  | SocialConversationType.DM;

export interface SocialInboxSyncInput {
  brandId?: string;
  conversationType?: SocialInboxSyncConversationType;
  credentialId?: string;
  limit?: number;
  organizationId: string;
  platform?: SocialInboxSyncPlatform;
  userId?: string;
}

export interface SocialInboxSyncResult {
  conversationsCreated: number;
  messagesCreated: number;
}

export const SOCIAL_INBOX_SYNC_ACTION_IDS = {
  INSTAGRAM_COMMENTS: 'social.inbox.sync.instagram-comments',
  INSTAGRAM_DMS: 'social.inbox.sync.instagram-dms',
  LINKEDIN_COMMENTS: 'social.inbox.sync.linkedin-comments',
  LINKEDIN_DMS: 'social.inbox.sync.linkedin-dms',
  VALIDATE: 'social.inbox.sync.validate',
  X_COMMENTS: 'social.inbox.sync.x-comments',
  X_DMS: 'social.inbox.sync.x-dms',
  YOUTUBE_COMMENTS: 'social.inbox.sync.youtube-comments',
} as const;

export const SOCIAL_INBOX_SYNC_WORKFLOW_IDS = {
  INSTAGRAM_COMMENTS: 'social.inbox.sync.instagram-comments',
  INSTAGRAM_DMS: 'social.inbox.sync.instagram-dms',
  LINKEDIN_COMMENTS: 'social.inbox.sync.linkedin-comments',
  LINKEDIN_DMS: 'social.inbox.sync.linkedin-dms',
  X_COMMENTS: 'social.inbox.sync.x-comments',
  X_DMS: 'social.inbox.sync.x-dms',
  YOUTUBE_COMMENTS: 'social.inbox.sync.youtube-comments',
} as const;

function actionNode(
  actionId: (typeof SOCIAL_INBOX_SYNC_ACTION_IDS)[keyof typeof SOCIAL_INBOX_SYNC_ACTION_IDS],
  id: string,
  y: number,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys: ['request'],
    position: { x: 0, y },
  });
}

export function buildSocialInboxSyncWorkflowDefinition(
  platform: SocialInboxSyncPlatform = Platform.YOUTUBE,
  conversationType: SocialInboxSyncConversationType = SocialConversationType.COMMENT,
): SystemWorkflowGraphDefinition {
  const surface = resolveSyncSurface(platform, conversationType);
  const validate = actionNode(
    SOCIAL_INBOX_SYNC_ACTION_IDS.VALIDATE,
    'validate-sync',
    0,
  );
  const ingest = actionNode(surface.actionId, 'ingest-sync', 160);
  const edges: WorkflowEdge[] = [
    {
      id: 'validate-to-ingest',
      source: validate.id,
      target: ingest.id,
      targetHandle: 'state',
    },
  ];
  return {
    canonicalId: surface.workflowId,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Social inbox sync request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [validate, ingest],
    },
    description:
      'Validates one tenant-scoped inbox sync request and executes its platform ingestion action.',
    label: surface.label,
    resultNodeId: ingest.id,
  };
}

function resolveSyncSurface(
  platform: SocialInboxSyncPlatform,
  conversationType: SocialInboxSyncConversationType,
): {
  actionId: (typeof SOCIAL_INBOX_SYNC_ACTION_IDS)[keyof typeof SOCIAL_INBOX_SYNC_ACTION_IDS];
  label: string;
  workflowId: (typeof SOCIAL_INBOX_SYNC_WORKFLOW_IDS)[keyof typeof SOCIAL_INBOX_SYNC_WORKFLOW_IDS];
} {
  if (platform === Platform.INSTAGRAM) {
    return conversationType === SocialConversationType.DM
      ? {
          actionId: SOCIAL_INBOX_SYNC_ACTION_IDS.INSTAGRAM_DMS,
          label: 'Sync Instagram DMs',
          workflowId: SOCIAL_INBOX_SYNC_WORKFLOW_IDS.INSTAGRAM_DMS,
        }
      : {
          actionId: SOCIAL_INBOX_SYNC_ACTION_IDS.INSTAGRAM_COMMENTS,
          label: 'Sync Instagram Comments',
          workflowId: SOCIAL_INBOX_SYNC_WORKFLOW_IDS.INSTAGRAM_COMMENTS,
        };
  }
  if (platform === Platform.TWITTER) {
    return conversationType === SocialConversationType.DM
      ? {
          actionId: SOCIAL_INBOX_SYNC_ACTION_IDS.X_DMS,
          label: 'Sync X DMs',
          workflowId: SOCIAL_INBOX_SYNC_WORKFLOW_IDS.X_DMS,
        }
      : {
          actionId: SOCIAL_INBOX_SYNC_ACTION_IDS.X_COMMENTS,
          label: 'Sync X Comments',
          workflowId: SOCIAL_INBOX_SYNC_WORKFLOW_IDS.X_COMMENTS,
        };
  }
  if (platform === Platform.LINKEDIN) {
    return conversationType === SocialConversationType.DM
      ? {
          actionId: SOCIAL_INBOX_SYNC_ACTION_IDS.LINKEDIN_DMS,
          label: 'Sync LinkedIn DMs',
          workflowId: SOCIAL_INBOX_SYNC_WORKFLOW_IDS.LINKEDIN_DMS,
        }
      : {
          actionId: SOCIAL_INBOX_SYNC_ACTION_IDS.LINKEDIN_COMMENTS,
          label: 'Sync LinkedIn Comments',
          workflowId: SOCIAL_INBOX_SYNC_WORKFLOW_IDS.LINKEDIN_COMMENTS,
        };
  }
  return {
    actionId: SOCIAL_INBOX_SYNC_ACTION_IDS.YOUTUBE_COMMENTS,
    label: 'Sync YouTube Comments',
    workflowId: SOCIAL_INBOX_SYNC_WORKFLOW_IDS.YOUTUBE_COMMENTS,
  };
}
