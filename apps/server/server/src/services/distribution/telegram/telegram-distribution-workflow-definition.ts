import { createGenfeedActionNode } from '@genfeedai/actions';
import type { SystemWorkflowGraphDefinition } from '@server/collections/workflows/system-workflow-runner.service';

export const TELEGRAM_DISTRIBUTION_ACTION_ID = 'telegram.distribution.deliver';
export const TELEGRAM_DISTRIBUTION_WORKFLOW_ID =
  'telegram.distribution.delivery';

export function buildTelegramDistributionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: TELEGRAM_DISTRIBUTION_WORKFLOW_ID,
    definition: {
      edges: [],
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
          actionId: TELEGRAM_DISTRIBUTION_ACTION_ID,
          id: 'deliver-telegram',
          inputVariableKeys: ['request'],
        }),
      ],
    },
    description: 'Delivers one scheduled Telegram distribution.',
    label: 'Telegram Distribution Delivery',
    resultNodeId: 'deliver-telegram',
    version: 1,
  };
}
