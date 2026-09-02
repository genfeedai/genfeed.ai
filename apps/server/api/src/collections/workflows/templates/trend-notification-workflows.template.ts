import { buildTrendNotificationWorkflowDefinition } from '@api/collections/workflows/services/automation-workflow-definitions';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type TrendNotificationCadence = 'daily' | 'hourly' | 'weekly';

export type TrendNotificationWorkflowTemplate = WorkflowTemplate & {
  cadence: TrendNotificationCadence;
  schedule: string;
};

function notificationTemplate(options: {
  cadence: TrendNotificationCadence;
  id: string;
  schedule: string;
}): TrendNotificationWorkflowTemplate {
  const workflow = buildTrendNotificationWorkflowDefinition(options.cadence);
  return {
    cadence: options.cadence,
    category: 'trends',
    description: workflow.description,
    edges: workflow.definition.edges,
    icon: 'trending-up',
    id: options.id,
    inputVariables: workflow.definition.inputVariables,
    name: `${options.cadence[0].toUpperCase()}${options.cadence.slice(1)} ${workflow.label}`,
    nodes: workflow.definition.nodes,
    schedule: options.schedule,
  };
}

export const TREND_NOTIFICATION_WORKFLOW_TEMPLATES = [
  notificationTemplate({
    cadence: 'hourly',
    id: 'trend-summary-notifications-hourly',
    schedule: '0 * * * *',
  }),
  notificationTemplate({
    cadence: 'daily',
    id: 'trend-summary-notifications-daily',
    schedule: '0 9 * * *',
  }),
  notificationTemplate({
    cadence: 'weekly',
    id: 'trend-summary-notifications-weekly',
    schedule: '0 9 * * 1',
  }),
] satisfies TrendNotificationWorkflowTemplate[];
