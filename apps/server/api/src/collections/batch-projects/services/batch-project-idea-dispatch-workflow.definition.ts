import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const BATCH_PROJECT_IDEA_DISPATCH_WORKFLOW_ID =
  'batch-project.idea.dispatch';
export const BATCH_PROJECT_IDEA_DISPATCH_FAILURE_WORKFLOW_ID =
  'batch-project.idea.dispatch.failure';

export const BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS = {
  DISPATCH: 'batch-project.idea.dispatch-item',
  FAIL: 'batch-project.idea.fail-item',
} as const;

function singleActionWorkflow(input: {
  actionId: string;
  canonicalId: string;
  description: string;
  label: string;
  nodeId: string;
}): SystemWorkflowGraphDefinition {
  return {
    canonicalId: input.canonicalId,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'job',
          label: 'Batch project idea dispatch',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: input.actionId,
          id: input.nodeId,
          inputVariableKeys: ['job'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: input.description,
    label: input.label,
    resultNodeId: input.nodeId,
    version: 1,
  };
}

/** Generates one idea item of a Studio Batch project server-side (#5463). */
export function buildBatchProjectIdeaDispatchWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    ...singleActionWorkflow({
      actionId: BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS.DISPATCH,
      canonicalId: BATCH_PROJECT_IDEA_DISPATCH_WORKFLOW_ID,
      description:
        'Reserves one accepted quote line and starts generation of one batch idea.',
      label: 'Batch Idea Generation',
      nodeId: 'dispatch-idea',
    }),
    organizationModule: 'batch',
  };
}

/** Marks an idea item failed when its dispatch job exhausts its attempts. */
export function buildBatchProjectIdeaDispatchFailureWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return singleActionWorkflow({
    actionId: BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS.FAIL,
    canonicalId: BATCH_PROJECT_IDEA_DISPATCH_FAILURE_WORKFLOW_ID,
    description:
      'Fails one batch idea whose generation could not start and releases its hold.',
    label: 'Fail Batch Idea Generation',
    nodeId: 'fail-idea',
  });
}
