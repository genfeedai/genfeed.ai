import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const TURBO_PROJECT_IDEA_DISPATCH_WORKFLOW_ID =
  'turbo-project.idea.dispatch';
export const TURBO_PROJECT_IDEA_DISPATCH_FAILURE_WORKFLOW_ID =
  'turbo-project.idea.dispatch.failure';

export const TURBO_PROJECT_IDEA_DISPATCH_ACTION_IDS = {
  DISPATCH: 'turbo-project.idea.dispatch-item',
  FAIL: 'turbo-project.idea.fail-item',
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
          label: 'Turbo project idea dispatch',
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

/** Generates one idea item of a Studio Turbo project server-side (#5463). */
export function buildTurboProjectIdeaDispatchWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    ...singleActionWorkflow({
      actionId: TURBO_PROJECT_IDEA_DISPATCH_ACTION_IDS.DISPATCH,
      canonicalId: TURBO_PROJECT_IDEA_DISPATCH_WORKFLOW_ID,
      description:
        'Reserves one accepted quote line and starts generation of one Turbo idea.',
      label: 'Turbo Idea Generation',
      nodeId: 'dispatch-idea',
    }),
    organizationModule: 'turbo',
  };
}

/** Marks an idea item failed when its dispatch job exhausts its attempts. */
export function buildTurboProjectIdeaDispatchFailureWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return singleActionWorkflow({
    actionId: TURBO_PROJECT_IDEA_DISPATCH_ACTION_IDS.FAIL,
    canonicalId: TURBO_PROJECT_IDEA_DISPATCH_FAILURE_WORKFLOW_ID,
    description:
      'Fails one Turbo idea whose generation could not start and releases its hold.',
    label: 'Fail Turbo Idea Generation',
    nodeId: 'fail-idea',
  });
}
