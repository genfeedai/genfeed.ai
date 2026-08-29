import { createGenfeedActionNode } from '@genfeedai/actions';
import type { SystemWorkflowGraphDefinition } from '@server/collections/workflows/system-workflow-definition';

export const BATCH_CONTENT_WORKFLOW_ID = 'content.batch.generate';
export const BATCH_CONTENT_ITEM_WORKFLOW_ID = 'content.batch.generate-item';

export const BATCH_CONTENT_ACTION_IDS = {
  GENERATE_ITEM: 'content.batch.item.generate',
  PLAN: 'content.batch.plan',
  RANK: 'content.batch.rank',
} as const;

export function buildBatchContentWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: BATCH_CONTENT_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'plan-to-generate',
          source: 'plan-batch',
          sourceHandle: 'items',
          target: 'generate-items',
          targetHandle: 'items',
        },
        {
          id: 'plan-to-rank',
          source: 'plan-batch',
          target: 'rank-drafts',
          targetHandle: 'plan',
        },
        {
          id: 'generate-to-rank',
          source: 'generate-items',
          target: 'rank-drafts',
          targetHandle: 'batch',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Batch content request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: BATCH_CONTENT_ACTION_IDS.PLAN,
          id: 'plan-batch',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'generate-items',
          parameters: {
            childWorkflowId: BATCH_CONTENT_ITEM_WORKFLOW_ID,
            itemInputKey: 'item',
            maxConcurrency: 10,
            mode: 'await',
          },
          position: { x: 0, y: 220 },
        }),
        createGenfeedActionNode({
          actionId: BATCH_CONTENT_ACTION_IDS.RANK,
          id: 'rank-drafts',
          position: { x: 0, y: 440 },
        }),
      ],
    },
    description:
      'Plans, generates, and ranks a bounded set of content drafts through action-backed child workflows.',
    label: 'Generate Batch Content',
    resultNodeId: 'rank-drafts',
    version: 1,
  };
}

export function buildBatchContentItemWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: BATCH_CONTENT_ITEM_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'item',
          label: 'Batch content item',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: BATCH_CONTENT_ACTION_IDS.GENERATE_ITEM,
          id: 'generate-item',
          inputVariableKeys: ['item'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: 'Generates one content draft with the selected skill.',
    label: 'Generate Batch Content Item',
    resultNodeId: 'generate-item',
    version: 1,
  };
}
