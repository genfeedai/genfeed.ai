import {
  buildLivestreamSessionWorkflowDefinition,
  buildRestreamChatWorkflowDefinition,
} from '@api/collections/workflows/services/automation-workflow-definitions';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type LivestreamBotWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

function toTemplate(
  workflow: ReturnType<typeof buildLivestreamSessionWorkflowDefinition>,
  id: string,
  icon: string,
  schedule: string,
): LivestreamBotWorkflowTemplate {
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

export const LIVESTREAM_BOT_WORKFLOW_TEMPLATES = [
  toTemplate(
    buildLivestreamSessionWorkflowDefinition(),
    'livestream-bot-session-processing',
    'radio',
    '*/1 * * * *',
  ),
  toTemplate(
    buildRestreamChatWorkflowDefinition(),
    'restream-chat-context-ingest',
    'message-circle',
    '*/2 * * * *',
  ),
] satisfies LivestreamBotWorkflowTemplate[];
