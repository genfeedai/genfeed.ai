import {
  buildContentEngineWorkflowDefinition,
  buildContentPipelineWorkflowDefinition,
} from '@api/collections/workflows/services/automation-workflow-definitions';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type ContentProductionWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

function toTemplate(
  workflow: ReturnType<typeof buildContentEngineWorkflowDefinition>,
  id: string,
  icon: string,
): ContentProductionWorkflowTemplate {
  return {
    category: 'content',
    description: workflow.description,
    edges: workflow.definition.edges,
    icon,
    id,
    inputVariables: workflow.definition.inputVariables,
    name: workflow.label,
    nodes: workflow.definition.nodes,
    schedule: '*/30 * * * *',
  };
}

export const CONTENT_PRODUCTION_WORKFLOW_TEMPLATES = [
  toTemplate(
    buildContentEngineWorkflowDefinition(),
    'content-engine-production',
    'sparkles',
  ),
  toTemplate(
    buildContentPipelineWorkflowDefinition(),
    'content-pipeline-autopilot',
    'bot',
  ),
] satisfies ContentProductionWorkflowTemplate[];
