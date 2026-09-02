import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const SIGNUP_PREFILL_ACTION_IDS = {
  ANALYZE: 'signup.prefill.analyze',
  DEFAULTS: 'signup.prefill.apply-defaults',
  FAIL: 'signup.prefill.fail',
  FINALIZE: 'signup.prefill.finalize',
  HARNESS: 'signup.prefill.seed-harness',
  PREPARE: 'signup.prefill.prepare',
  PROMPT: 'signup.prefill.apply-prompt',
  SCRAPE: 'signup.prefill.scrape',
} as const;

export const SIGNUP_PREFILL_WORKFLOW_ID = 'signup.prefill';

export function buildSignupPrefillWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const stepIds = [
    'prepare-prefill',
    'scrape-brand',
    'analyze-brand',
    'apply-defaults',
    'apply-prompt',
    'seed-harness',
  ];
  return {
    canonicalId: SIGNUP_PREFILL_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'prepare-scrape',
          source: 'prepare-prefill',
          target: 'scrape-brand',
          targetHandle: 'state',
        },
        {
          id: 'scrape-analyze',
          source: 'scrape-brand',
          target: 'analyze-brand',
          targetHandle: 'state',
        },
        {
          id: 'analyze-defaults',
          source: 'analyze-brand',
          target: 'apply-defaults',
          targetHandle: 'state',
        },
        {
          id: 'defaults-prompt',
          source: 'apply-defaults',
          target: 'apply-prompt',
          targetHandle: 'state',
        },
        {
          id: 'prompt-harness',
          source: 'apply-prompt',
          target: 'seed-harness',
          targetHandle: 'state',
        },
        {
          id: 'harness-finalize',
          source: 'seed-harness',
          target: 'finalize-prefill',
          targetHandle: 'state',
        },
        ...stepIds.map((source) => ({
          id: `${source}-failure`,
          source,
          sourceHandle: 'failure',
          target: 'mark-failed',
          targetHandle: 'failure',
        })),
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
          actionId: SIGNUP_PREFILL_ACTION_IDS.PREPARE,
          id: 'prepare-prefill',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: SIGNUP_PREFILL_ACTION_IDS.SCRAPE,
          id: 'scrape-brand',
        }),
        createGenfeedActionNode({
          actionId: SIGNUP_PREFILL_ACTION_IDS.ANALYZE,
          id: 'analyze-brand',
        }),
        createGenfeedActionNode({
          actionId: SIGNUP_PREFILL_ACTION_IDS.DEFAULTS,
          id: 'apply-defaults',
        }),
        createGenfeedActionNode({
          actionId: SIGNUP_PREFILL_ACTION_IDS.PROMPT,
          id: 'apply-prompt',
        }),
        createGenfeedActionNode({
          actionId: SIGNUP_PREFILL_ACTION_IDS.HARNESS,
          id: 'seed-harness',
        }),
        createGenfeedActionNode({
          actionId: SIGNUP_PREFILL_ACTION_IDS.FINALIZE,
          id: 'finalize-prefill',
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
    resultNodeId: 'finalize-prefill',
    version: 1,
  };
}
