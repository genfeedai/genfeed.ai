import type {
  MarketplaceWorkflowDocument,
  WorkflowDocument,
} from '@api/collections/workflows/schemas/workflow.schema';
import {
  toExposedEdge,
  toExposedNode,
} from '@api/collections/workflows/utils/workflow-exposed-graph.util';
import { hydrateWorkflowDefinition } from '@api/collections/workflows/workflow-version-definition';

export function toMarketplaceWorkflow(
  workflow: WorkflowDocument,
): MarketplaceWorkflowDocument {
  const definition = hydrateWorkflowDefinition(workflow);
  return {
    createdAt: workflow.createdAt,
    description: workflow.description ?? null,
    edgeStyle: definition.edgeStyle,
    edges: definition.edges.map(toExposedEdge),
    executionCount: workflow.executionCount ?? 0,
    id: workflow.id,
    inputVariables: definition.inputVariables,
    label: workflow.label ?? null,
    nodes: definition.nodes.map(toExposedNode),
    thumbnail: workflow.thumbnail ?? null,
    updatedAt: workflow.updatedAt,
  };
}
