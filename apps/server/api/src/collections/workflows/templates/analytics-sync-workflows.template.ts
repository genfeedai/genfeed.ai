import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type AnalyticsSyncWorkflowTemplate = WorkflowTemplate & {
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
}): AnalyticsSyncWorkflowTemplate {
  return {
    category: 'analytics',
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

export const ANALYTICS_SYNC_WORKFLOW_TEMPLATES = [
  actionTemplate({
    description:
      'Hourly per-organization Facebook post analytics queue dispatch for published posts.',
    icon: 'bar-chart-3',
    id: 'analytics-facebook-sync',
    name: 'Facebook Analytics Sync',
    nodeLabel: 'Sync Facebook Analytics',
    nodeType: 'analyticsFacebookSync',
    schedule: '0 * * * *',
  }),
  actionTemplate({
    description:
      'Hourly per-organization social analytics queue dispatch for published Instagram, LinkedIn, Mastodon, TikTok, and Pinterest posts.',
    icon: 'bar-chart-3',
    id: 'analytics-social-sync',
    name: 'Social Analytics Sync',
    nodeLabel: 'Sync Social Analytics',
    nodeType: 'analyticsSocialSync',
    schedule: '0 * * * *',
  }),
  actionTemplate({
    description:
      'Hourly per-organization Threads analytics queue dispatch for published Threads posts.',
    icon: 'bar-chart-3',
    id: 'analytics-threads-sync',
    name: 'Threads Analytics Sync',
    nodeLabel: 'Sync Threads Analytics',
    nodeType: 'analyticsThreadsSync',
    schedule: '0 * * * *',
  }),
  actionTemplate({
    description:
      'Per-organization Twitter/X analytics queue dispatch for published posts with Twitter credentials.',
    icon: 'bar-chart-3',
    id: 'analytics-twitter-sync',
    name: 'Twitter Analytics Sync',
    nodeLabel: 'Sync Twitter Analytics',
    nodeType: 'analyticsTwitterSync',
    schedule: '*/30 * * * *',
  }),
  actionTemplate({
    description:
      'Six-hour per-organization incremental analytics sync queue dispatch.',
    icon: 'refresh-cw',
    id: 'analytics-sync',
    name: 'Analytics Sync',
    nodeLabel: 'Run Analytics Sync',
    nodeType: 'analyticsGenericSync',
    schedule: '0 */6 * * *',
  }),
  actionTemplate({
    description:
      'Hourly per-organization YouTube analytics queue dispatch for published videos grouped by brand.',
    icon: 'youtube',
    id: 'youtube-analytics-sync',
    name: 'YouTube Analytics Sync',
    nodeLabel: 'Sync YouTube Analytics',
    nodeType: 'youtubeAnalyticsSync',
    schedule: '0 * * * *',
  }),
] satisfies AnalyticsSyncWorkflowTemplate[];
