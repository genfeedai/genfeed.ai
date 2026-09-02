import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const TELEGRAM_DISTRIBUTION_ACTION_IDS = {
  CLAIM: 'telegram.distribution.claim',
  FINALIZE: 'telegram.distribution.finalize',
  RESOLVE_CREDENTIAL: 'telegram.distribution.resolve-credential',
  SEND: 'telegram.distribution.send',
} as const;
export const TELEGRAM_DISTRIBUTION_WORKFLOW_ID =
  'telegram.distribution.delivery';

export function buildTelegramDistributionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: TELEGRAM_DISTRIBUTION_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'claim-to-credential',
          source: 'claim-distribution',
          target: 'resolve-credential',
          targetHandle: 'delivery',
        },
        {
          id: 'claim-to-send',
          source: 'claim-distribution',
          target: 'send-telegram',
          targetHandle: 'delivery',
        },
        {
          id: 'credential-to-send',
          source: 'resolve-credential',
          target: 'send-telegram',
          targetHandle: 'credential',
        },
        {
          id: 'send-to-finalize',
          source: 'send-telegram',
          target: 'finalize-delivery',
          targetHandle: 'result',
        },
        {
          id: 'claim-to-finalize',
          source: 'claim-distribution',
          target: 'finalize-delivery',
          targetHandle: 'delivery',
        },
        {
          id: 'credential-failure-to-finalize',
          source: 'resolve-credential',
          sourceHandle: 'failure',
          target: 'finalize-delivery',
          targetHandle: 'failure',
        },
        {
          id: 'send-failure-to-finalize',
          source: 'send-telegram',
          sourceHandle: 'failure',
          target: 'finalize-delivery',
          targetHandle: 'failure',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Telegram delivery',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: TELEGRAM_DISTRIBUTION_ACTION_IDS.CLAIM,
          id: 'claim-distribution',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: TELEGRAM_DISTRIBUTION_ACTION_IDS.RESOLVE_CREDENTIAL,
          id: 'resolve-credential',
        }),
        createGenfeedActionNode({
          actionId: TELEGRAM_DISTRIBUTION_ACTION_IDS.SEND,
          id: 'send-telegram',
        }),
        createGenfeedActionNode({
          actionId: TELEGRAM_DISTRIBUTION_ACTION_IDS.FINALIZE,
          id: 'finalize-delivery',
        }),
      ],
    },
    description: 'Delivers one scheduled Telegram distribution.',
    label: 'Telegram Distribution Delivery',
    resultNodeId: 'finalize-delivery',
    version: 1,
  };
}
