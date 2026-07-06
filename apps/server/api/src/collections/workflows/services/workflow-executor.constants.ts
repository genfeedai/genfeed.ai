import type { Prisma } from '@genfeedai/prisma';

/** Maximum number of nodes per execution to prevent infinite loops. */
export const MAX_EXECUTION_NODES = 500;

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

export const EXECUTABLE_WORKFLOW_SELECT = {
  config: true,
  description: true,
  edges: true,
  id: true,
  inputVariables: true,
  label: true,
  metadata: true,
  mongoId: true,
  nodes: true,
  organizationId: true,
  steps: true,
  userId: true,
} satisfies Prisma.WorkflowSelect;

export type ExecutableWorkflowRow = Prisma.WorkflowGetPayload<{
  select: typeof EXECUTABLE_WORKFLOW_SELECT;
}>;
