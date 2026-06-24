import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type AdAutomationWorkflowTemplate = WorkflowTemplate & {
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
}): AdAutomationWorkflowTemplate {
  return {
    category: 'ads',
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

export const AD_AUTOMATION_WORKFLOW_TEMPLATES = [
  actionTemplate({
    description:
      'Daily per-organization ad optimization queue dispatch for enabled optimization configs.',
    icon: 'target',
    id: 'ad-optimization',
    name: 'Ad Optimization',
    nodeLabel: 'Run Ad Optimization',
    nodeType: 'adOptimization',
    schedule: '0 4 * * *',
  }),
  actionTemplate({
    description:
      'Daily Google Ads performance sync dispatch for connected Google Ads credentials.',
    icon: 'refresh-cw',
    id: 'ad-sync-google',
    name: 'Google Ads Sync',
    nodeLabel: 'Sync Google Ads',
    nodeType: 'adSyncGoogle',
    schedule: '30 3 * * *',
  }),
  actionTemplate({
    description:
      'Daily Meta Ads performance sync dispatch for connected Facebook/Meta credentials.',
    icon: 'refresh-cw',
    id: 'ad-sync-meta',
    name: 'Meta Ads Sync',
    nodeLabel: 'Sync Meta Ads',
    nodeType: 'adSyncMeta',
    schedule: '0 3 * * *',
  }),
  actionTemplate({
    description:
      'Daily TikTok Ads performance sync dispatch for connected TikTok credentials.',
    icon: 'refresh-cw',
    id: 'ad-sync-tiktok',
    name: 'TikTok Ads Sync',
    nodeLabel: 'Sync TikTok Ads',
    nodeType: 'adSyncTikTok',
    schedule: '0 4 * * *',
  }),
] satisfies AdAutomationWorkflowTemplate[];
