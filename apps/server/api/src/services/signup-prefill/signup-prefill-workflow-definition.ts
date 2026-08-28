import { createGenfeedActionNode } from '@genfeedai/actions';
import type { SystemWorkflowGraphDefinition } from '@server/collections/workflows/system-workflow-runner.service';

export const SIGNUP_PREFILL_ACTION_IDS = {
  EXECUTE: 'signup.prefill.execute',
  FAIL: 'signup.prefill.fail',
} as const;

export const SIGNUP_PREFILL_WORKFLOW_ID = 'signup.prefill';

export function buildSignupPrefillWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: SIGNUP_PREFILL_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'prefill-failure',
          source: 'prefill-brand',
          sourceHandle: 'failure',
          target: 'mark-failed',
          targetHandle: 'failure',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Signup prefill',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: SIGNUP_PREFILL_ACTION_IDS.EXECUTE,
          id: 'prefill-brand',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: SIGNUP_PREFILL_ACTION_IDS.FAIL,
          id: 'mark-failed',
          inputVariableKeys: ['request'],
        }),
      ],
    },
    description: 'Enriches the placeholder brand created during signup.',
    label: 'Signup Brand Prefill',
    resultNodeId: 'prefill-brand',
    version: 1,
  };
}
