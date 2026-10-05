import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';

/**
 * Node config keys that bind a node to records of the organization that
 * authored the workflow. They are blanked on the way out, the way the code
 * templates ship them (`brandId: ''`), so a copy resolves its own brand and
 * credentials at run time instead of pointing at the source organization's.
 */
export const SOURCE_ORG_NODE_CONFIG_KEYS = [
  'brandId',
  'credentialId',
  'organizationId',
  'userId',
] as const;

export function toExposedNode(node: WorkflowVisualNode): WorkflowVisualNode {
  const config: Record<string, unknown> = { ...(node.data?.config ?? {}) };
  for (const key of SOURCE_ORG_NODE_CONFIG_KEYS) {
    if (key in config) {
      config[key] = '';
    }
  }

  return {
    data: {
      config,
      label: node.data?.label ?? '',
      ...(node.data?.inputVariableKeys
        ? { inputVariableKeys: node.data.inputVariableKeys }
        : {}),
    },
    id: node.id,
    position: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
    type: node.type,
  };
}

export function toExposedEdge(edge: WorkflowEdge): WorkflowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
  };
}
