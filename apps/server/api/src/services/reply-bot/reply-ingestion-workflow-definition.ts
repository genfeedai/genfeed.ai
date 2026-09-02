import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { AUTHOR_REPLY_WORKFLOW_IDS } from '@api/services/reply-bot/author-reply-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';
import type { Platform } from '@genfeedai/enums';

export type ReplyInboundSource = 'manual' | 'poll' | 'post-watch' | 'xaa';

export interface ReplyInboundWorkflowInput {
  brandId?: string;
  commentAuthorId?: string;
  commentAuthorUsername: string;
  commentId: string;
  commentText: string;
  credentialId?: string;
  organizationId: string;
  parentPostId: string;
  parentPostPreview?: string;
  platform?: Platform.TWITTER | Platform.YOUTUBE;
  receivedAt: string;
  source: ReplyInboundSource;
}

export interface ReplyInboundWorkflowResult {
  commentId: string;
  error?: string;
  organizationId: string;
  skipped: boolean;
  success: boolean;
}

export interface ReplyPostWatchWorkflowInput {
  attempt: number;
  brandId: string;
  maxAttempts: number;
  organizationId: string;
  platform?: Platform.TWITTER | Platform.YOUTUBE;
  postId: string;
  postPreview?: string;
}

export interface ReplyPostWatchWorkflowResult {
  attempt: number;
  commentsFound: number;
  enqueued: number;
  organizationId: string;
  postId: string;
}

export const REPLY_INGESTION_ACTION_IDS = {
  FINALIZE_INBOUND: 'reply.inbound.finalize',
  FINALIZE_POST_WATCH: 'reply.post-watch.finalize',
  FETCH_POST_WATCH: 'reply.post-watch.fetch',
  PREPARE_INBOUND: 'reply.inbound.prepare',
} as const;

export const REPLY_INGESTION_WORKFLOW_IDS = {
  INBOUND: 'reply.inbound.process',
  POST_WATCH: 'reply.post-watch.process',
} as const;

function actionNode(
  actionId: (typeof REPLY_INGESTION_ACTION_IDS)[keyof typeof REPLY_INGESTION_ACTION_IDS],
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

function definition(
  canonicalId: string,
  label: string,
  description: string,
  nodes: WorkflowVisualNode[],
  edges: WorkflowEdge[],
  resultNodeId: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: `${label} request`,
          required: true,
          type: 'json',
        },
      ],
      nodes,
    },
    description,
    label,
    resultNodeId,
  };
}

export function buildReplyInboundWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const prepare = actionNode(
    REPLY_INGESTION_ACTION_IDS.PREPARE_INBOUND,
    'prepare-inbound',
    0,
  );
  const send = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'send-author-reply',
    inputVariableKeys: ['request'],
    parameters: {
      childWorkflowId: AUTHOR_REPLY_WORKFLOW_IDS.SEND,
      itemInputKey: 'request',
      maxConcurrency: 1,
      mode: 'await',
    },
    position: { x: 0, y: 160 },
  });
  const finalize = actionNode(
    REPLY_INGESTION_ACTION_IDS.FINALIZE_INBOUND,
    'finalize-inbound',
    320,
  );
  return definition(
    REPLY_INGESTION_WORKFLOW_IDS.INBOUND,
    'Process Inbound Reply',
    'Deduplicates and classifies one inbound comment, invokes the author-reply workflow when eligible, and finalizes the result.',
    [prepare, send, finalize],
    [
      {
        id: 'reply-items-to-send',
        source: prepare.id,
        sourceHandle: 'items',
        target: send.id,
        targetHandle: 'items',
      },
      {
        id: 'prepare-to-finalize',
        source: prepare.id,
        target: finalize.id,
        targetHandle: 'state',
      },
      {
        id: 'send-to-finalize',
        source: send.id,
        target: finalize.id,
        targetHandle: 'batch',
      },
    ],
    finalize.id,
  );
}

export function buildReplyPostWatchWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const fetch = actionNode(
    REPLY_INGESTION_ACTION_IDS.FETCH_POST_WATCH,
    'fetch-comments',
    0,
  );
  const dispatch = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'dispatch-inbound-comments',
    inputVariableKeys: ['request'],
    parameters: {
      childWorkflowId: REPLY_INGESTION_WORKFLOW_IDS.INBOUND,
      itemInputKey: 'request',
      mode: 'scheduled',
    },
    position: { x: 0, y: 160 },
  });
  const finalize = actionNode(
    REPLY_INGESTION_ACTION_IDS.FINALIZE_POST_WATCH,
    'finalize-watch',
    320,
  );
  return definition(
    REPLY_INGESTION_WORKFLOW_IDS.POST_WATCH,
    'Watch Post Replies',
    'Fetches unprocessed replies for one owned post and durably schedules one inbound child workflow per comment.',
    [fetch, dispatch, finalize],
    [
      {
        id: 'comments-to-dispatch',
        source: fetch.id,
        sourceHandle: 'items',
        target: dispatch.id,
        targetHandle: 'items',
      },
      {
        id: 'fetch-to-finalize',
        source: fetch.id,
        target: finalize.id,
        targetHandle: 'state',
      },
      {
        id: 'dispatch-to-finalize',
        source: dispatch.id,
        target: finalize.id,
        targetHandle: 'batch',
      },
    ],
    finalize.id,
  );
}
