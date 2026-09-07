import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ACTION_IDS = {
  DISCOVER: 'social-source.own-account-resync.discover',
  RUN: 'social-source.own-account-resync.run',
} as const;

export const SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_WORKFLOW_ID =
  'social-source.own-account-resync';

export const SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ITEM_WORKFLOW_ID =
  'social-source.own-account-resync.item';

/**
 * Cross-tenant sweep: discovers due own-account sources once, then processes
 * each through a per-tenant child workflow so imported metrics keep maturing
 * long after the initial history import. Mirrors the RSS sweep shape
 * (`rss-sweep-workflow-definition.ts`) — discover -> `workflow.for-each-tenant`.
 */
export function buildSocialSourceOwnAccountResyncSweepWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'discover-sources',
          source: 'discover-sources',
          sourceHandle: 'items',
          target: 'resync-sources',
          targetHandle: 'items',
        },
      ],
      inputVariables: [],
      nodes: [
        createGenfeedActionNode({
          actionId: SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ACTION_IDS.DISCOVER,
          id: 'discover-sources',
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each-tenant',
          id: 'resync-sources',
          parameters: {
            childWorkflowId: SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ITEM_WORKFLOW_ID,
            itemInputKey: 'request',
            maxConcurrency: 3,
            mode: 'scheduled',
          },
        }),
      ],
    },
    description:
      'Discovers own-account social sources due for a metrics re-sync and processes each through a tenant-scoped child workflow.',
    label: 'Social Account Own-Account Resync Sweep',
    resultNodeId: 'resync-sources',
    version: 1,
  };
}

export function buildSocialSourceOwnAccountResyncItemWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ITEM_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: 'Resync request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ACTION_IDS.RUN,
          id: 'run-resync',
          inputVariableKeys: ['request'],
        }),
      ],
    },
    description:
      "Re-collects one connected account's recent posts so imported metrics keep maturing.",
    label: 'Social Account Own-Account Resync',
    resultNodeId: 'run-resync',
    version: 1,
  };
}
