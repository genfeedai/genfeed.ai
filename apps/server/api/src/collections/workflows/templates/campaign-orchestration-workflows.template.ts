import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type CampaignOrchestrationWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

function actionTemplate(params: {
  description: string;
  icon: string;
  id: string;
  name: string;
  nodeLabel: string;
  nodeType: string;
  schedule: string;
}): CampaignOrchestrationWorkflowTemplate {
  return {
    category: 'campaigns',
    description: params.description,
    icon: params.icon,
    id: params.id,
    name: params.name,
    nodes: [
      {
        data: {
          config: {},
          label: params.nodeLabel,
        },
        id: params.nodeType,
        position: { x: 0, y: 120 },
        type: params.nodeType,
      },
    ],
    schedule: params.schedule,
    steps: [],
  };
}

export const CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES = [
  actionTemplate({
    description:
      'Per-organization campaign orchestration scanner that queues due active campaigns.',
    icon: 'send',
    id: 'agent-campaign-orchestration',
    name: 'Agent Campaign Orchestration',
    nodeLabel: 'Process Due Campaigns',
    nodeType: 'agentCampaignOrchestration',
    schedule: '*/1 * * * *',
  }),
  actionTemplate({
    description:
      'Per-organization campaign trigger evaluation scanner for active campaigns with agents.',
    icon: 'radar',
    id: 'agent-campaign-trigger-evaluation',
    name: 'Agent Campaign Trigger Evaluation',
    nodeLabel: 'Evaluate Campaign Triggers',
    nodeType: 'agentCampaignTriggerEvaluation',
    schedule: '*/15 * * * *',
  }),
] satisfies CampaignOrchestrationWorkflowTemplate[];
