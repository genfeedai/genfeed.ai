import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type OutreachCampaignDispatchWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

export const OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES = [
  {
    category: 'automation',
    description:
      'Per-organization scanner that queues processing work for active, non-deleted outreach campaigns.',
    edges: [],
    icon: 'send',
    id: 'outreach-campaign-dispatch',
    inputVariables: [],
    name: 'Outreach Campaign Dispatch',
    nodes: [
      {
        data: {
          config: {},
          label: 'Dispatch Active Outreach Campaigns',
        },
        id: 'outreachCampaignDispatch',
        position: { x: 0, y: 120 },
        type: 'outreachCampaignDispatch',
      },
    ],
    schedule: '*/1 * * * *',
    steps: [],
  },
] satisfies OutreachCampaignDispatchWorkflowTemplate[];
