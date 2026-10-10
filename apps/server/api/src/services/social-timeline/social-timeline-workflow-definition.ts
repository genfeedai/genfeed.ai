import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
export const SOCIAL_TIMELINE_ACTION_ID =
  'social.timeline.native-action.execute';
export const SOCIAL_TIMELINE_WORKFLOW_ID = 'social.timeline.native-action';
export function buildSocialTimelineActionWorkflow(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: SOCIAL_TIMELINE_WORKFLOW_ID,
    organizationModule: 'discovery',
    label: 'Execute Following Action',
    description:
      'Reserves one scoped idempotent native action, publishes once, and preserves its confirmation receipt.',
    resultNodeId: 'execute-action',
    definition: {
      nodes: [
        createGenfeedActionNode({
          id: 'execute-action',
          actionId: SOCIAL_TIMELINE_ACTION_ID,
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
      ],
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: 'Scoped native action request',
          required: true,
          type: 'json',
        },
      ],
    },
  };
}
