import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type ReplyPollingWorkflowTemplate = WorkflowTemplate & {
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
}): ReplyPollingWorkflowTemplate {
  return {
    category: 'automation',
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

export const REPLY_POLLING_WORKFLOW_TEMPLATES = [
  actionTemplate({
    description:
      'Ten-minute per-organization reply bot polling for active reply configurations and credentials.',
    icon: 'message-circle-reply',
    id: 'reply-bot-polling',
    name: 'Reply Bot Polling',
    nodeLabel: 'Poll Reply Bots',
    nodeType: 'replyBotPolling',
    schedule: '*/10 * * * *',
  }),
  actionTemplate({
    description:
      'Five-minute per-organization social trigger polling for workflow trigger nodes.',
    icon: 'radio',
    id: 'social-trigger-polling',
    name: 'Social Trigger Polling',
    nodeLabel: 'Poll Social Triggers',
    nodeType: 'socialTriggerPolling',
    schedule: '*/5 * * * *',
  }),
] satisfies ReplyPollingWorkflowTemplate[];
