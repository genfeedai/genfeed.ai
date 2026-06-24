import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type ContentProductionWorkflowTemplate = WorkflowTemplate & {
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
}): ContentProductionWorkflowTemplate {
  return {
    category: 'content',
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

export const CONTENT_PRODUCTION_WORKFLOW_TEMPLATES = [
  actionTemplate({
    description:
      'Per-organization content engine cycle for brands with active auto-publish strategy.',
    icon: 'sparkles',
    id: 'content-engine-production',
    name: 'Content Engine Production',
    nodeLabel: 'Run Content Engine',
    nodeType: 'contentEngineProduction',
    schedule: '*/30 * * * *',
  }),
  actionTemplate({
    description:
      'Per-organization persona autopilot content pipeline dispatch for due personas.',
    icon: 'bot',
    id: 'content-pipeline-autopilot',
    name: 'Content Pipeline Autopilot',
    nodeLabel: 'Run Content Pipeline Autopilot',
    nodeType: 'contentPipelineAutopilot',
    schedule: '*/30 * * * *',
  }),
] satisfies ContentProductionWorkflowTemplate[];

export const CONTENT_SCHEDULE_WORKFLOW_TEMPLATE_ID = 'content-schedule';
