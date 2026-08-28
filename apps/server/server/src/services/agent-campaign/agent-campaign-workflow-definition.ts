import { createGenfeedActionNode } from '@genfeedai/actions';
import type { SystemWorkflowGraphDefinition } from '@server/collections/workflows/system-workflow-definition';

export const AGENT_CAMPAIGN_WORKFLOW_IDS = {
  EXTRACT_MEMORY: 'agent-campaign.extract-memory',
  ORCHESTRATE: 'agent-campaign.orchestrate',
  EVALUATE_TRIGGERS: 'agent-campaign.evaluate-triggers',
} as const;

export const AGENT_CAMPAIGN_ACTION_IDS = {
  EXTRACT_MEMORY: 'agent-campaign.memory.extract',
  ORCHESTRATE: 'agent-campaign.orchestration.run',
  EVALUATE_TRIGGERS: 'agent-campaign.triggers.evaluate',
} as const;

function definition(
  canonicalId: string,
  actionId: string,
  label: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: `${label} request`,
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId,
          id: 'execute',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: label,
    label,
    resultNodeId: 'execute',
    version: 1,
  };
}

export const AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS = [
  definition(
    AGENT_CAMPAIGN_WORKFLOW_IDS.ORCHESTRATE,
    AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATE,
    'Run Agent Campaign Orchestration',
  ),
  definition(
    AGENT_CAMPAIGN_WORKFLOW_IDS.EXTRACT_MEMORY,
    AGENT_CAMPAIGN_ACTION_IDS.EXTRACT_MEMORY,
    'Extract Agent Campaign Winner Memory',
  ),
  definition(
    AGENT_CAMPAIGN_WORKFLOW_IDS.EVALUATE_TRIGGERS,
    AGENT_CAMPAIGN_ACTION_IDS.EVALUATE_TRIGGERS,
    'Evaluate Agent Campaign Triggers',
  ),
] satisfies SystemWorkflowGraphDefinition[];

export function findAgentCampaignWorkflowDefinition(
  canonicalId: string,
): SystemWorkflowGraphDefinition {
  const definition = AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS.find(
    (candidate) => candidate.canonicalId === canonicalId,
  );
  if (!definition) {
    throw new Error(`Unknown agent campaign workflow: ${canonicalId}`);
  }
  return definition;
}
