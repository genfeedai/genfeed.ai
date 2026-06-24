import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type TrendNotificationCadence = 'daily' | 'hourly' | 'weekly';

export type TrendNotificationWorkflowTemplate = WorkflowTemplate & {
  cadence: TrendNotificationCadence;
  schedule: string;
};

function actionTemplate(params: {
  cadence: TrendNotificationCadence;
  description: string;
  id: string;
  name: string;
  nodeLabel: string;
  schedule: string;
}): TrendNotificationWorkflowTemplate {
  return {
    cadence: params.cadence,
    category: 'trends',
    description: params.description,
    icon: 'trending-up',
    id: params.id,
    name: params.name,
    nodes: [
      {
        data: {
          config: { cadence: params.cadence },
          label: params.nodeLabel,
        },
        id: 'trendSummaryNotifications',
        position: { x: 0, y: 120 },
        type: 'trendSummaryNotifications',
      },
    ],
    schedule: params.schedule,
    steps: [],
  };
}

export const TREND_NOTIFICATION_WORKFLOW_TEMPLATES = [
  actionTemplate({
    cadence: 'hourly',
    description:
      'Hourly per-organization trend summary notifications using the owner trend notification settings.',
    id: 'trend-summary-notifications-hourly',
    name: 'Hourly Trend Summary Notifications',
    nodeLabel: 'Send Hourly Trend Summary',
    schedule: '0 * * * *',
  }),
  actionTemplate({
    cadence: 'daily',
    description:
      'Daily per-organization trend summary notifications using the owner trend notification settings.',
    id: 'trend-summary-notifications-daily',
    name: 'Daily Trend Summary Notifications',
    nodeLabel: 'Send Daily Trend Summary',
    schedule: '0 9 * * *',
  }),
  actionTemplate({
    cadence: 'weekly',
    description:
      'Weekly per-organization trend summary notifications using the owner trend notification settings.',
    id: 'trend-summary-notifications-weekly',
    name: 'Weekly Trend Summary Notifications',
    nodeLabel: 'Send Weekly Trend Summary',
    schedule: '0 9 * * 1',
  }),
] satisfies TrendNotificationWorkflowTemplate[];
