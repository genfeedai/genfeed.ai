import { extendedNodeDefinitions, saasNodeDefinitions } from './definitions';
import {
  normalizeNodeTypeForApi,
  normalizeNodeTypeForEditor,
} from './node-type-aliases';

export const FALLBACK_WORKFLOW_NODE_TYPE = 'unknown' as const;
const ORIGINAL_NODE_TYPE_KEY = 'originalType' as const;

/**
 * Editor-only chrome that must not be treated as executable node config.
 * Mirrors `WorkflowFormatConverterService.extractConfig` so save/load and
 * the engine agree on which keys are metadata vs runnable config.
 */
const EDITOR_NODE_DATA_META_KEYS = new Set([
  'cachedOutput',
  'color',
  'comment',
  'config',
  'error',
  'inputVariableKeys',
  'isLocked',
  'label',
  'lockTimestamp',
  ORIGINAL_NODE_TYPE_KEY,
  'progress',
  'status',
]);

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

interface WorkflowNodeRepair {
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

function readInputVariableKeys(
  data: Record<string, unknown>,
): string[] | undefined {
  if (!Array.isArray(data.inputVariableKeys)) {
    return undefined;
  }

  const keys = data.inputVariableKeys.filter(
    (key): key is string => typeof key === 'string',
  );
  return keys.length > 0 ? keys : undefined;
}

function extractEditorConfigFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!EDITOR_NODE_DATA_META_KEYS.has(key) && value !== undefined) {
      config[key] = value;
    }
  }

  return config;
}

/**
 * Persist editor node data in the API contract (`label` + `config`).
 * Prompt/template live on the editor node as top-level fields; the DTO
 * whitelist keeps only `label`/`config`/`inputVariableKeys`, so those
 * fields must be folded into `config` before save.
 */
export function toPersistedWorkflowNodeData(
  data: unknown,
): Record<string, unknown> {
  const record = isNodeDataRecord(data) ? data : {};
  const existingConfig = isNodeDataRecord(record.config) ? record.config : {};
  const extracted = extractEditorConfigFields(record);
  const inputVariableKeys = readInputVariableKeys(record);

  return {
    ...(inputVariableKeys ? { inputVariableKeys } : {}),
    config: {
      ...existingConfig,
      ...extracted,
    },
    label: typeof record.label === 'string' ? record.label : '',
  };
}

/**
 * Hydrate persisted `data.config` back onto the editor node so Prompt and
 * Prompt Constructor can read `data.prompt` / `data.template`.
 */
export function toEditorWorkflowNodeData(
  data: unknown,
): Record<string, unknown> {
  const record = isNodeDataRecord(data) ? data : {};
  const config = isNodeDataRecord(record.config) ? record.config : {};

  return {
    ...config,
    ...record,
  };
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
    const editorData = toEditorWorkflowNodeData(data);
    const normalizedData = {
      ...editorData,
      label: resolveNodeLabel(nodeType, editorData),
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
        data: toPersistedWorkflowNodeData(node.data),
        type:
          typeof node.type === 'string'
            ? normalizeNodeTypeForApi(node.type)
            : node.type,
      };
    }

    const data = isNodeDataRecord(node.data) ? node.data : {};
    const originalType = data[ORIGINAL_NODE_TYPE_KEY];

    if (typeof originalType !== 'string' || originalType.length === 0) {
      return {
        ...node,
        data: toPersistedWorkflowNodeData(data),
      };
    }

    const { [ORIGINAL_NODE_TYPE_KEY]: _ignored, ...restData } = data;

    return {
      ...node,
      data: toPersistedWorkflowNodeData(restData),
      type: normalizeNodeTypeForApi(originalType),
    };
  });
}
