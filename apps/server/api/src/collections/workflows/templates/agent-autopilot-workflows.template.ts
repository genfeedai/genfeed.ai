import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type AgentAutopilotWorkflowTemplate = WorkflowTemplate & {
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
}): AgentAutopilotWorkflowTemplate {
  return {
    category: 'agents',
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

export const AGENT_AUTOPILOT_WORKFLOW_TEMPLATES = [
  actionTemplate({
    description:
      'Per-organization proactive agent scanner that queues due active strategies.',
    icon: 'bot',
    id: 'proactive-agent-strategies',
    name: 'Proactive Agent Strategies',
    nodeLabel: 'Process Due Strategies',
    nodeType: 'proactiveAgentStrategies',
    schedule: '*/1 * * * *',
  }),
  actionTemplate({
    description:
      'Per-organization AI influencer autopilot scanner for enabled darkroom personas.',
    icon: 'sparkles',
    id: 'ai-influencer-daily-posts',
    name: 'AI Influencer Daily Posts',
    nodeLabel: 'Generate Daily Influencer Posts',
    nodeType: 'aiInfluencerDailyPosts',
    schedule: '0 */6 * * *',
  }),
] satisfies AgentAutopilotWorkflowTemplate[];
