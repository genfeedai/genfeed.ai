import type { Prisma } from '@genfeedai/prisma';

/** Maximum number of nodes per execution to prevent infinite loops. */
export const MAX_EXECUTION_NODES = 500;

/**
 * A synchronous node claim older than the longest in-process provider poll
 * (20 minutes) plus a recovery buffer is treated as abandoned. Provider-
 * callback actions use their dedicated continuation leases instead.
 */
export const WORKFLOW_NODE_CLAIM_LEASE_MS = 30 * 60 * 1000;

/** Map from trigger event types to executor node types. */
export const EVENT_TYPE_TO_NODE_TYPE: Record<string, string> = {
  comment: 'commentTrigger',
  commentTrigger: 'commentTrigger',
  mention: 'mentionTrigger',
  mentionTrigger: 'mentionTrigger',
  newFollower: 'newFollowerTrigger',
  newFollowerTrigger: 'newFollowerTrigger',
  newLike: 'newLikeTrigger',
  newLikeTrigger: 'newLikeTrigger',
  newRepost: 'newRepostTrigger',
  newRepostTrigger: 'newRepostTrigger',
  keyword: 'keywordTrigger',
  keywordTrigger: 'keywordTrigger',
  engagement: 'engagementTrigger',
  engagementTrigger: 'engagementTrigger',
  'post-published': 'postPublishTrigger',
  postPublishTrigger: 'postPublishTrigger',
  trend: 'trendTrigger',
  trendTrigger: 'trendTrigger',
};

/** Visual-builder trigger node types mapped to executor node types. */
export const VISUAL_TRIGGER_NODE_TYPE_TO_EXECUTOR: Record<string, string> = {
  'trigger-comment': 'commentTrigger',
  'trigger-mention': 'mentionTrigger',
  'trigger-new-follower': 'newFollowerTrigger',
  'trigger-new-like': 'newLikeTrigger',
  'trigger-new-repost': 'newRepostTrigger',
};

export const EXECUTABLE_WORKFLOW_IDENTITY_SELECT = {
  brandId: true,
  config: true,
  description: true,
  id: true,
  label: true,
  metadata: true,
  organizationId: true,
  userId: true,
} satisfies Prisma.WorkflowSelect;

export const EXECUTABLE_WORKFLOW_SELECT = {
  ...EXECUTABLE_WORKFLOW_IDENTITY_SELECT,
  currentVersion: {
    select: {
      graph: true,
      id: true,
      inputSchema: true,
      version: true,
    },
  },
} satisfies Prisma.WorkflowSelect;

export type ExecutableWorkflowRow = Prisma.WorkflowGetPayload<{
  select: typeof EXECUTABLE_WORKFLOW_SELECT;
}>;
