import type { WorkflowTemplate } from '@server/collections/workflows/templates/workflow-templates';

export type LivestreamBotWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

export const LIVESTREAM_BOT_WORKFLOW_TEMPLATES = [
  {
    category: 'automation',
    description:
      'Per-organization livestream bot active-session scanner for enabled live chat bots.',
    edges: [],
    icon: 'radio',
    id: 'livestream-bot-session-processing',
    inputVariables: [],
    name: 'Livestream Bot Session Processing',
    nodes: [
      {
        data: {
          config: {},
          label: 'Process Livestream Sessions',
        },
        id: 'livestreamBotSessionProcessing',
        position: { x: 0, y: 120 },
        type: 'livestreamBotSessionProcessing',
      },
    ],
    schedule: '*/1 * * * *',
  },
  {
    category: 'automation',
    description:
      'Ingest Restream Chat (unified multistream audience messages) into livestream bot context for automation and context-aware replies.',
    edges: [],
    icon: 'message-circle',
    id: 'restream-chat-context-ingest',
    inputVariables: [
      {
        description: 'Livestream bot id that owns the Restream credential.',
        key: 'botId',
        label: 'Livestream Bot ID',
        required: true,
        type: 'text',
      },
      {
        defaultValue: 30,
        description: 'Max Restream chat frames to collect per run.',
        key: 'maxMessages',
        label: 'Max messages',
        required: false,
        type: 'number',
      },
    ],
    name: 'Restream Chat Context Ingest',
    nodes: [
      {
        data: {
          config: {},
          inputVariableKeys: ['botId', 'maxMessages'],
          label: 'Ingest Restream Chat',
        },
        id: 'restreamChatIngest',
        position: { x: 0, y: 120 },
        type: 'restreamChatIngest',
      },
    ],
    schedule: '*/2 * * * *',
  },
] satisfies LivestreamBotWorkflowTemplate[];
