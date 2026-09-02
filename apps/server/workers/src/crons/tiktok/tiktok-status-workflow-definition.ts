import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const TIKTOK_STATUS_ACTION_IDS = {
  DISCOVER: 'tiktok.status.discover',
  RECONCILE: 'tiktok.status.reconcile',
} as const;

export const TIKTOK_STATUS_WORKFLOW_IDS = {
  RECONCILE: 'tiktok.status.reconcile',
  SWEEP: 'tiktok.status.sweep',
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

export function buildTiktokStatusSweepDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: TIKTOK_STATUS_WORKFLOW_IDS.SWEEP,
    definition: {
      edges: [
        {
          id: 'discover-reconcile',
          source: 'discover',
          sourceHandle: 'items',
          target: 'reconcile',
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
        node(TIKTOK_STATUS_ACTION_IDS.DISCOVER, 'discover', 0, ['request']),
        node('workflow.for-each-tenant', 'reconcile', 180, [], {
          childWorkflowId: TIKTOK_STATUS_WORKFLOW_IDS.RECONCILE,
          itemInputKey: 'request',
          maxConcurrency: 5,
          mode: 'await',
        }),
      ],
    },
    description:
      'Discovers pending TikTok publications and reconciles each status.',
    label: 'TikTok Status Sweep',
    resultNodeId: 'reconcile',
    version: 1,
  };
}

export function buildTiktokStatusReconcileDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: TIKTOK_STATUS_WORKFLOW_IDS.RECONCILE,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: 'Pending TikTok post',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        node(TIKTOK_STATUS_ACTION_IDS.RECONCILE, 'reconcile', 0, ['request']),
      ],
    },
    description: 'Polls and reconciles one pending TikTok publication.',
    label: 'Reconcile TikTok Status',
    resultNodeId: 'reconcile',
    version: 1,
  };
}
