import { SOCIAL_INBOX_SYNC_WORKFLOW_IDS } from '@api/collections/social-inbox/services/social-inbox-sync-workflow-definition';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const YOUTUBE_MAINTENANCE_ACTION_IDS = {
  DISCOVER_CREDENTIALS: 'youtube.comments.discover-credentials',
  DISCOVER_POSTS: 'youtube.status.discover-posts',
  RECONCILE_STATUS: 'youtube.status.reconcile',
} as const;

export const YOUTUBE_MAINTENANCE_WORKFLOW_IDS = {
  COMMENTS_SWEEP: 'youtube.comments.sweep',
  STATUS_RECONCILE: 'youtube.status.reconcile',
  STATUS_SWEEP: 'youtube.status.sweep',
} as const;

function node(
  actionId: string,
  id: string,
  y: number,
  inputVariableKeys: string[] = [],
  parameters: Record<string, unknown> = {},
) {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys,
    parameters,
    position: { x: 0, y },
  });
}

function sweep(
  canonicalId: string,
  childWorkflowId: string,
  discoverActionId: string,
  label: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: [
        {
          id: 'discover-process',
          source: 'discover',
          sourceHandle: 'items',
          target: 'process',
          targetHandle: 'items',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Sweep request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        node(discoverActionId, 'discover', 0, ['request']),
        node('workflow.for-each-tenant', 'process', 180, [], {
          childWorkflowId,
          itemInputKey: 'request',
          maxConcurrency: 5,
          mode: 'await',
        }),
      ],
    },
    description: label,
    label,
    resultNodeId: 'process',
    version: 1,
  };
}

function child(
  canonicalId: string,
  actionId: string,
  label: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: [],
      inputVariables: [
        { key: 'request', label: 'Work item', required: true, type: 'json' },
      ],
      nodes: [node(actionId, 'execute', 0, ['request'])],
    },
    description: label,
    label,
    resultNodeId: 'execute',
    version: 1,
  };
}

export const buildYoutubeCommentsSweepDefinition = () =>
  sweep(
    YOUTUBE_MAINTENANCE_WORKFLOW_IDS.COMMENTS_SWEEP,
    SOCIAL_INBOX_SYNC_WORKFLOW_IDS.YOUTUBE_COMMENTS,
    YOUTUBE_MAINTENANCE_ACTION_IDS.DISCOVER_CREDENTIALS,
    'YouTube Comment Ingestion Sweep',
  );
export const buildYoutubeStatusSweepDefinition = () =>
  sweep(
    YOUTUBE_MAINTENANCE_WORKFLOW_IDS.STATUS_SWEEP,
    YOUTUBE_MAINTENANCE_WORKFLOW_IDS.STATUS_RECONCILE,
    YOUTUBE_MAINTENANCE_ACTION_IDS.DISCOVER_POSTS,
    'YouTube Status Sweep',
  );
export const buildYoutubeStatusReconcileDefinition = () =>
  child(
    YOUTUBE_MAINTENANCE_WORKFLOW_IDS.STATUS_RECONCILE,
    YOUTUBE_MAINTENANCE_ACTION_IDS.RECONCILE_STATUS,
    'Reconcile YouTube Status',
  );
