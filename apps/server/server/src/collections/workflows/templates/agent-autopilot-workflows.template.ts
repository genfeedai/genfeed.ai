import type { WorkflowTemplate } from '@server/collections/workflows/templates/workflow-templates';
import { buildAiInfluencerDailyPostsWorkflowDefinition } from '@server/services/ai-influencer/ai-influencer-workflow-definition';

const AI_INFLUENCER_DAILY_POSTS_TEMPLATE_ID = 'ai-influencer-daily-posts';

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
  (() => {
    const workflow = buildAiInfluencerDailyPostsWorkflowDefinition();
    return {
      category: 'agents',
      description: workflow.description,
      edges: workflow.definition.edges,
      icon: 'sparkles',
      id: AI_INFLUENCER_DAILY_POSTS_TEMPLATE_ID,
      inputVariables: workflow.definition.inputVariables,
      name: workflow.label,
      nodes: workflow.definition.nodes,
      schedule: '0 */6 * * *',
    };
  })(),
] satisfies AgentAutopilotWorkflowTemplate[];
