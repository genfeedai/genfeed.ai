import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

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
    steps: [],
  },
] satisfies LivestreamBotWorkflowTemplate[];
