import { buildPaidCreativeResearchWorkflowDefinition } from '@api/collections/workflows/services/automation-workflow-definitions';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type PaidCreativeResearchWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

const paidCreativeResearch = buildPaidCreativeResearchWorkflowDefinition();

export const PAID_CREATIVE_RESEARCH_WORKFLOW_TEMPLATES = [
  {
    category: 'ads',
    description: paidCreativeResearch.description,
    edges: paidCreativeResearch.definition.edges,
    icon: 'megaphone',
    id: 'paid-creative-research-ingestion',
    inputVariables: paidCreativeResearch.definition.inputVariables,
    name: paidCreativeResearch.label,
    nodes: paidCreativeResearch.definition.nodes,
    schedule: '0 6 * * *',
  },
] satisfies PaidCreativeResearchWorkflowTemplate[];
