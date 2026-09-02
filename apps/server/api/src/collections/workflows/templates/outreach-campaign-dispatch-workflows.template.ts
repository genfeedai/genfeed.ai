import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import { buildCampaignDispatchWorkflowDefinition } from '@api/services/campaign/campaign-dispatch-workflow-definition';

export type OutreachCampaignDispatchWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

const campaignDispatch = buildCampaignDispatchWorkflowDefinition();

export const OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES = [
  {
    category: 'automation',
    description: campaignDispatch.description,
    edges: campaignDispatch.definition.edges,
    icon: 'send',
    id: 'outreach-campaign-dispatch',
    inputVariables: campaignDispatch.definition.inputVariables,
    name: campaignDispatch.label,
    nodes: campaignDispatch.definition.nodes,
    schedule: '*/1 * * * *',
  },
] satisfies OutreachCampaignDispatchWorkflowTemplate[];
