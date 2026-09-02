import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const BATCH_WORKFLOW_EXECUTION_ID = 'workflow.batch.execute';

export function buildBatchWorkflowExecutionDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: BATCH_WORKFLOW_EXECUTION_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'childWorkflowId',
          label: 'Child workflow ID',
          required: true,
          type: 'text',
        },
        {
          key: 'childWorkflowVersionId',
          label: 'Child workflow version ID',
          required: true,
          type: 'text',
        },
        {
          key: 'items',
          label: 'Ingredient IDs',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'execute-items',
          inputVariableKeys: [
            'childWorkflowId',
            'childWorkflowVersionId',
            'items',
          ],
          parameters: {
            failureMode: 'collect',
            itemInputKey: 'ingredientId',
            maxConcurrency: 2,
            mode: 'await',
          },
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description:
      'Runs one immutable tenant workflow version for each selected ingredient.',
    label: 'Execute Workflow Batch',
    resultNodeId: 'execute-items',
    version: 1,
  };
}
