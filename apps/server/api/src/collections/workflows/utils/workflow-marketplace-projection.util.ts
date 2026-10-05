import type {
  MarketplaceWorkflowProjection,
  WorkflowDocument,
} from '@api/collections/workflows/schemas/workflow.schema';
import { toExposedEdge } from '@api/collections/workflows/utils/workflow-exposed-graph.util';
import { hydrateWorkflowDefinition } from '@api/collections/workflows/workflow-version-definition';

export function toMarketplaceWorkflow(
  workflow: WorkflowDocument,
): MarketplaceWorkflowProjection {
  const definition = hydrateWorkflowDefinition(workflow);
  return {
    createdAt: workflow.createdAt,
    description: workflow.description ?? null,
    edgeStyle: definition.edgeStyle,
    edges: definition.edges.map(toExposedEdge),
    executionCount: workflow.executionCount ?? 0,
    id: workflow.id,
    inputVariables: definition.inputVariables.map((variable) => ({
      key: variable.key,
      label: variable.label,
      type: variable.type,
      required: variable.required,
      ...(variable.description !== undefined
        ? { description: variable.description }
        : {}),
    })),
    label: workflow.label ?? null,
    nodes: definition.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
      data: { label: node.data?.label ?? '' },
    })),
    thumbnail: workflow.thumbnail ?? null,
    updatedAt: workflow.updatedAt,
  };
}
