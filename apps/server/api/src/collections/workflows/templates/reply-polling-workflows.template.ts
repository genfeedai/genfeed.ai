import {
  buildReplyBotPollingWorkflowDefinition,
  buildSocialTriggerPollingWorkflowDefinition,
} from '@api/collections/workflows/services/automation-workflow-definitions';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type ReplyPollingWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

function toTemplate(
  workflow: ReturnType<typeof buildReplyBotPollingWorkflowDefinition>,
  id: string,
  icon: string,
  schedule: string,
): ReplyPollingWorkflowTemplate {
  return {
    category: 'automation',
    description: workflow.description,
    edges: workflow.definition.edges,
    icon,
    id,
    inputVariables: workflow.definition.inputVariables,
    name: workflow.label,
    nodes: workflow.definition.nodes,
    schedule,
  };
}

export const REPLY_POLLING_WORKFLOW_TEMPLATES = [
  toTemplate(
    buildReplyBotPollingWorkflowDefinition(),
    'reply-bot-polling',
    'message-circle-reply',
    '*/10 * * * *',
  ),
  toTemplate(
    buildSocialTriggerPollingWorkflowDefinition(),
    'social-trigger-polling',
    'radio',
    '*/5 * * * *',
  ),
] satisfies ReplyPollingWorkflowTemplate[];
