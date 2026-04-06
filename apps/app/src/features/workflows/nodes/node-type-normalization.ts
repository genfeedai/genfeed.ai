import { extendedNodeDefinitions, saasNodeDefinitions } from './definitions';
import {
  normalizeNodeTypeForApi,
  normalizeNodeTypeForEditor,
} from './node-type-aliases';

export const FALLBACK_WORKFLOW_NODE_TYPE = 'unknown' as const;
const ORIGINAL_NODE_TYPE_KEY = 'originalType' as const;

const cloudNodeDefinitions: Readonly<Record<string, { label?: string }>> = {
  ...saasNodeDefinitions,
  ...extendedNodeDefinitions,
};

export interface WorkflowNodeLike {
  data?: Record<string, unknown>;
  id?: unknown;
  position?: {
    x?: number;
    y?: number;
  };
  type?: string;
  [key: string]: unknown;
}

export interface WorkflowNodeRepair {
  index: number;
  kind: 'duplicate-id' | 'dropped-malformed-node' | 'missing-id';
  nextId: string;
  originalId: string | null;
  type: string;
}

export interface NormalizedWorkflowNodesResult {
  nodes: WorkflowNodeLike[];
  repairs: WorkflowNodeRepair[];
}

function isNodeDataRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null;
}

function resolveNodeLabel(
  nodeType: string,
  data: Record<string, unknown>,
): string {
  if (typeof data.label === 'string') {
    return data.label;
  }

  const definition = cloudNodeDefinitions[nodeType];
  if (typeof definition?.label === 'string') {
    return definition.label;
  }

  return nodeType;
}

function resolveNodeType(rawType: unknown): string | null {
  if (typeof rawType !== 'string') {
    return null;
  }

  const trimmedType = rawType.trim();
  return trimmedType.length > 0
    ? normalizeNodeTypeForEditor(trimmedType)
    : null;
}

function normalizeNodePosition(node: WorkflowNodeLike): {
  x: number;
  y: number;
} {
  const position = node.position;

  return {
    x: typeof position?.x === 'number' ? position.x : 0,
    y: typeof position?.y === 'number' ? position.y : 0,
  };
}

function resolveNodeId(rawId: unknown): string | null {
  if (typeof rawId !== 'string') {
    return null;
  }

  const trimmedId = rawId.trim();
  return trimmedId.length > 0 ? trimmedId : null;
}

function buildUniqueNodeId(
  originalId: string | null,
  nodeType: string,
  index: number,
  seenIds: Set<string>,
): {
  nextId: string;
  repaired: boolean;
  repairKind: WorkflowNodeRepair['kind'];
} {
  const baseId =
    originalId ?? `${nodeType || FALLBACK_WORKFLOW_NODE_TYPE}-${index + 1}`;
  const initialKind: WorkflowNodeRepair['kind'] = originalId
    ? 'duplicate-id'
    : 'missing-id';

  if (!seenIds.has(baseId)) {
    seenIds.add(baseId);
    return {
      nextId: baseId,
      repaired: originalId === null,
      repairKind: initialKind,
    };
  }

  let suffix = 2;
  let nextId = `${baseId}-${suffix}`;

  while (seenIds.has(nextId)) {
    suffix += 1;
    nextId = `${baseId}-${suffix}`;
  }

  seenIds.add(nextId);

  return {
    nextId,
    repaired: true,
    repairKind: initialKind,
  };
}

export function normalizeWorkflowNodeCollection(
  nodes: readonly WorkflowNodeLike[],
  supportedNodeTypes: ReadonlySet<string>,
): NormalizedWorkflowNodesResult {
  const seenIds = new Set<string>();
  const repairs: WorkflowNodeRepair[] = [];
  const normalizedNodes: WorkflowNodeLike[] = [];

  nodes.forEach((node, index) => {
    const data = isNodeDataRecord(node.data) ? node.data : {};
    const resolvedType = resolveNodeType(node.type);
    const originalType =
      typeof data[ORIGINAL_NODE_TYPE_KEY] === 'string'
        ? data[ORIGINAL_NODE_TYPE_KEY]
        : null;

    if (
      (resolvedType === null ||
        (resolvedType === FALLBACK_WORKFLOW_NODE_TYPE &&
          originalType === null)) &&
      typeof data.label !== 'string'
    ) {
      repairs.push({
        index,
        kind: 'dropped-malformed-node',
        nextId: '',
        originalId: resolveNodeId(node.id),
        type: resolvedType ?? FALLBACK_WORKFLOW_NODE_TYPE,
      });
      return;
    }

    const nodeType = resolvedType ?? FALLBACK_WORKFLOW_NODE_TYPE;
    const normalizedData = {
      ...data,
      label: resolveNodeLabel(nodeType, data),
    };
    const originalId = resolveNodeId(node.id);
    const { nextId, repairKind, repaired } = buildUniqueNodeId(
      originalId,
      nodeType,
      index,
      seenIds,
    );

    if (repaired) {
      repairs.push({
        index,
        kind: repairKind,
        nextId,
        originalId,
        type: nodeType,
      });
    }

    if (supportedNodeTypes.has(nodeType)) {
      normalizedNodes.push({
        ...node,
        data: normalizedData,
        id: nextId,
        position: normalizeNodePosition(node),
        type: nodeType,
      });
      return;
    }

    normalizedNodes.push({
      ...node,
      data: {
        ...normalizedData,
        [ORIGINAL_NODE_TYPE_KEY]: nodeType,
      },
      id: nextId,
      position: normalizeNodePosition(node),
      type: FALLBACK_WORKFLOW_NODE_TYPE,
    });
  });

  return { nodes: normalizedNodes, repairs };
}

export function normalizeWorkflowNodeTypes(
  nodes: readonly WorkflowNodeLike[],
  supportedNodeTypes: ReadonlySet<string>,
): WorkflowNodeLike[] {
  return normalizeWorkflowNodeCollection(nodes, supportedNodeTypes).nodes;
}

export function restoreWorkflowNodeTypes(
  nodes: readonly WorkflowNodeLike[],
): WorkflowNodeLike[] {
  return nodes.map((node) => {
    if (node.type !== FALLBACK_WORKFLOW_NODE_TYPE) {
      return {
        ...node,
        type:
          typeof node.type === 'string'
            ? normalizeNodeTypeForApi(node.type)
            : node.type,
      };
    }

    const data = isNodeDataRecord(node.data) ? node.data : {};
    const originalType = data[ORIGINAL_NODE_TYPE_KEY];

    if (typeof originalType !== 'string' || originalType.length === 0) {
      return node;
    }

    const { [ORIGINAL_NODE_TYPE_KEY]: _ignored, ...restData } = data;

    return {
      ...node,
      data: restData,
      type: normalizeNodeTypeForApi(originalType),
    };
  });
}
