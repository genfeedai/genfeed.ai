import { buildAgentProactiveWorkflowDefinition } from '@api/collections/workflows/services/automation-workflow-definitions';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import { buildAiInfluencerDailyPostsWorkflowDefinition } from '@api/services/ai-influencer/ai-influencer-workflow-definition';

const AI_INFLUENCER_DAILY_POSTS_TEMPLATE_ID = 'ai-influencer-daily-posts';

export type AgentAutopilotWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

export const AGENT_AUTOPILOT_WORKFLOW_TEMPLATES = [
  (() => {
    const workflow = buildAgentProactiveWorkflowDefinition();
    return {
      category: 'agents',
      description: workflow.description,
      edges: workflow.definition.edges,
      icon: 'bot',
      id: 'proactive-agent-strategies',
      inputVariables: workflow.definition.inputVariables,
      name: workflow.label,
      nodes: workflow.definition.nodes,
      schedule: '*/1 * * * *',
    };
  })(),
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
