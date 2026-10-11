import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const BREAKOUT_RESPONSE_ACTION_ID = 'breakout.response.execute';
export const BREAKOUT_RESPONSE_WORKFLOW_ID = 'breakout.response.execute';
/** Queue source of the only producer allowed to pin this workflow. */
export const BREAKOUT_RESPONSE_WORKFLOW_SOURCE = 'breakout-response';

/** One hidden, system-only node. The initiating actor is never a workflow input. */
export function buildBreakoutResponseExecutionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: BREAKOUT_RESPONSE_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: 'Breakout response',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: BREAKOUT_RESPONSE_ACTION_ID,
          id: 'execute-response',
          inputVariableKeys: ['request'],
        }),
      ],
    },
    description:
      'Prices, reserves and generates the planned outputs of one detected own-account breakout while it is still hot.',
    label: 'Breakout Response Execution',
    resultNodeId: 'execute-response',
    version: 1,
  };
}
