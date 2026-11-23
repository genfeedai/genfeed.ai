import type { YoutubeInboxPostFailure } from '@api/collections/social-inbox/services/social-inbox.types';
import type { WorkflowEdge } from '@api/collections/workflows/schemas/workflow.schema';
import { requestActionNode } from '@api/collections/workflows/services/workflow-definition-nodes';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRetention } from '@api/collections/workflows/workflow-execution-retention.contract';
import { Platform, SocialConversationType } from '@genfeedai/contracts';

export type SocialInboxSyncPlatform =
  | Platform.FACEBOOK
  | Platform.INSTAGRAM
  | Platform.LINKEDIN
  | Platform.THREADS
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
  /** YouTube comment sync: comments the listing returned (new or already stored). */
  commentsSeen?: number;
  /** YouTube comment sync: connected credentials considered. */
  credentialsScanned?: number;
  /** Present on YouTube comment sync. Empty when every owned post was listed. */
  postFailures?: YoutubeInboxPostFailure[];
  /** YouTube comment sync: eligible owned videos listed. Zero means none qualified. */
  postsScanned?: number;
}

export const SOCIAL_INBOX_SYNC_ACTION_IDS = {
  FACEBOOK_INBOX: 'social.inbox.sync.facebook-inbox',
  INSTAGRAM_COMMENTS: 'social.inbox.sync.instagram-comments',
  INSTAGRAM_DMS: 'social.inbox.sync.instagram-dms',
  LINKEDIN_COMMENTS: 'social.inbox.sync.linkedin-comments',
  THREADS_REPLIES: 'social.inbox.sync.threads-replies',
  LINKEDIN_DMS: 'social.inbox.sync.linkedin-dms',
  VALIDATE: 'social.inbox.sync.validate',
  X_COMMENTS: 'social.inbox.sync.x-comments',
  X_DMS: 'social.inbox.sync.x-dms',
  YOUTUBE_COMMENTS: 'social.inbox.sync.youtube-comments',
} as const;

export const SOCIAL_INBOX_SYNC_WORKFLOW_IDS = {
  FACEBOOK_INBOX: 'social.inbox.sync.facebook-inbox',
  INSTAGRAM_COMMENTS: 'social.inbox.sync.instagram-comments',
  INSTAGRAM_DMS: 'social.inbox.sync.instagram-dms',
  LINKEDIN_COMMENTS: 'social.inbox.sync.linkedin-comments',
  THREADS_REPLIES: 'social.inbox.sync.threads-replies',
  LINKEDIN_DMS: 'social.inbox.sync.linkedin-dms',
  X_COMMENTS: 'social.inbox.sync.x-comments',
  X_DMS: 'social.inbox.sync.x-dms',
  YOUTUBE_COMMENTS: 'social.inbox.sync.youtube-comments',
} as const;

export function buildSocialInboxSyncWorkflowDefinition(
  platform: SocialInboxSyncPlatform = Platform.YOUTUBE,
  conversationType: SocialInboxSyncConversationType = SocialConversationType.COMMENT,
): SystemWorkflowGraphDefinition {
  const surface = resolveSyncSurface(platform, conversationType);
  const validate = requestActionNode(
    SOCIAL_INBOX_SYNC_ACTION_IDS.VALIDATE,
    'validate-sync',
    0,
  );
  const ingest = requestActionNode(surface.actionId, 'ingest-sync', 160);
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
    organizationModule: 'messages',
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
    retention: SystemWorkflowRetention.BACKGROUND,
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
  if (platform === Platform.FACEBOOK) {
    return {
      actionId: SOCIAL_INBOX_SYNC_ACTION_IDS.FACEBOOK_INBOX,
      label: 'Sync Facebook Inbox',
      workflowId: SOCIAL_INBOX_SYNC_WORKFLOW_IDS.FACEBOOK_INBOX,
    };
  }
  if (platform === Platform.THREADS) {
    return {
      actionId: SOCIAL_INBOX_SYNC_ACTION_IDS.THREADS_REPLIES,
      label: 'Sync Threads Replies',
      workflowId: SOCIAL_INBOX_SYNC_WORKFLOW_IDS.THREADS_REPLIES,
    };
  }
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
