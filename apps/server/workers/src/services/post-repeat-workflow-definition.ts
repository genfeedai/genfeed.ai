import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const EVERGREEN_EXPANSION_WORKFLOW_ID = 'evergreen.release.expand';
export const EVERGREEN_EXPANSION_ACTION_ID = 'evergreen-release-expansion';

export function buildEvergreenExpansionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: EVERGREEN_EXPANSION_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'groupId',
          label: 'Release group',
          required: true,
          type: 'string',
        },
        {
          key: 'organizationId',
          label: 'Organization',
          required: true,
          type: 'string',
        },
        {
          key: 'sourcePostId',
          label: 'Source post',
          required: true,
          type: 'string',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: EVERGREEN_EXPANSION_ACTION_ID,
          id: 'expand',
          inputVariableKeys: ['groupId', 'organizationId', 'sourcePostId'],
          parameters: {},
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: 'Materializes the next occurrence of one evergreen release.',
    label: 'Expand Evergreen Release',
    resultNodeId: 'expand',
    version: 1,
  };
}
