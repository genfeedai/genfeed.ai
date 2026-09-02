import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import {
  buildAgentCampaignDueOrchestrationWorkflowDefinition,
  buildAgentCampaignTriggerSweepWorkflowDefinition,
} from '@api/services/agent-campaign/agent-campaign-workflow-definition';

export type CampaignOrchestrationWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

function workflowTemplate(params: {
  description: string;
  definition: ReturnType<
    typeof buildAgentCampaignDueOrchestrationWorkflowDefinition
  >;
  icon: string;
  id: string;
  name: string;
  schedule: string;
}): CampaignOrchestrationWorkflowTemplate {
  return {
    category: 'campaigns',
    description: params.description,
    icon: params.icon,
    id: params.id,
    name: params.name,
    edges: params.definition.definition.edges,
    inputVariables: params.definition.definition.inputVariables,
    nodes: params.definition.definition.nodes,
    schedule: params.schedule,
  };
}

export const CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES = [
  workflowTemplate({
    description:
      'Per-organization campaign orchestration graph that discovers and executes due active campaigns.',
    definition: buildAgentCampaignDueOrchestrationWorkflowDefinition(),
    icon: 'send',
    id: 'agent-campaign-orchestration',
    name: 'Agent Campaign Orchestration',
    schedule: '*/1 * * * *',
  }),
  workflowTemplate({
    description:
      'Per-organization campaign trigger graph that discovers and evaluates active campaigns with agents.',
    definition: buildAgentCampaignTriggerSweepWorkflowDefinition(),
    icon: 'radar',
    id: 'agent-campaign-trigger-evaluation',
    name: 'Agent Campaign Trigger Evaluation',
    schedule: '*/15 * * * *',
  }),
] satisfies CampaignOrchestrationWorkflowTemplate[];
