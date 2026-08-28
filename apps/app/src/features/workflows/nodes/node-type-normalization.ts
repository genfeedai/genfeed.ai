import {
  getWorkflowActionIdForNodeType,
  getWorkflowPresentationNodeType,
} from '@genfeedai/workflows/nodes';
import { extendedNodeDefinitions, saasNodeDefinitions } from './definitions';

export const FALLBACK_WORKFLOW_NODE_TYPE = 'unknown' as const;
const ORIGINAL_NODE_TYPE_KEY = 'originalType' as const;
const WORKFLOW_ACTION_ID_KEY = 'actionId' as const;
const WORKFLOW_ACTION_PARAMETERS_KEY = 'parameters' as const;

const ENGINE_NATIVE_EDITOR_NODE_TYPES = new Set([
  'commentTrigger',
  'condition',
  'control-branch',
  'control-delay',
  'control-loop',
  'delay',
  'engagementTrigger',
  'input-image',
  'input-video',
  'keywordTrigger',
  'mentionTrigger',
  'newFollowerTrigger',
  'newLikeTrigger',
  'newRepostTrigger',
  'postPublishTrigger',
  'reviewGate',
  'trigger-comment',
  'trigger-mention',
  'trigger-new-follower',
  'trigger-new-like',
  'trigger-new-repost',
  'workflowInput',
]);

const MEDIA_INPUT_NODE_TYPES = {
  audioInput: 'audio',
  imageInput: 'image',
  videoInput: 'video',
} as const satisfies Readonly<Record<string, string>>;

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
  WORKFLOW_ACTION_ID_KEY,
  WORKFLOW_ACTION_PARAMETERS_KEY,
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

function readRecord(value: unknown): Record<string, unknown> {
  return isNodeDataRecord(value) ? value : {};
}

function readPersistedActionId(
  nodeType: string | undefined,
  data: Record<string, unknown>,
): string | null {
  if (nodeType !== 'genfeedAction') {
    return null;
  }

  const actionId = readRecord(data.config).actionId;
  return typeof actionId === 'string' && actionId.length > 0 ? actionId : null;
}

function toEditorActionNodeData(
  data: Record<string, unknown>,
  actionId: string,
): Record<string, unknown> {
  const config = readRecord(data.config);
  const parameters = readRecord(config.parameters);
  const inputVariableKeys = readInputVariableKeys(data);

  return {
    ...parameters,
    ...(inputVariableKeys ? { inputVariableKeys } : {}),
    [WORKFLOW_ACTION_ID_KEY]: actionId,
    label: typeof data.label === 'string' ? data.label : actionId,
    [WORKFLOW_ACTION_PARAMETERS_KEY]: parameters,
  };
}

function toPersistedActionNodeData(
  data: unknown,
  actionId: string,
): Record<string, unknown> {
  const record = isNodeDataRecord(data) ? data : {};
  const existingParameters = readRecord(record[WORKFLOW_ACTION_PARAMETERS_KEY]);
  const existingConfig = readRecord(record.config);
  const extracted = extractEditorConfigFields(record);
  const inputVariableKeys = readInputVariableKeys(record);

  return {
    ...(inputVariableKeys ? { inputVariableKeys } : {}),
    config: {
      actionId,
      parameters: {
        ...existingParameters,
        ...existingConfig,
        ...extracted,
      },
    },
    label: typeof record.label === 'string' ? record.label : actionId,
  };
}

function toPersistedMediaInputNode(
  node: WorkflowNodeLike,
  inputType: string,
): WorkflowNodeLike {
  const record = isNodeDataRecord(node.data) ? node.data : {};
  const configured = readRecord(record.config);
  const defaultValue =
    record[inputType] ?? configured.defaultValue ?? configured.value;

  return {
    ...node,
    data: {
      config: {
        ...(defaultValue !== undefined ? { defaultValue } : {}),
        inputName:
          typeof configured.inputName === 'string'
            ? configured.inputName
            : String(node.id ?? `${inputType}Input`),
        inputType,
        required: configured.required === true,
      },
      label:
        typeof record.label === 'string' ? record.label : `${inputType} input`,
    },
    type: 'workflowInput',
  };
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
  return trimmedType.length > 0 ? trimmedType : null;
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
    const persistedActionId = readPersistedActionId(node.type, data);
    const actionPresentationType = persistedActionId
      ? getWorkflowPresentationNodeType(persistedActionId)
      : null;
    const resolvedType = actionPresentationType ?? resolveNodeType(node.type);
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

    const nodeType =
      persistedActionId &&
      resolvedType !== null &&
      !supportedNodeTypes.has(resolvedType) &&
      supportedNodeTypes.has('genfeedAction')
        ? 'genfeedAction'
        : (resolvedType ?? FALLBACK_WORKFLOW_NODE_TYPE);
    const editorData = persistedActionId
      ? toEditorActionNodeData(data, persistedActionId)
      : toEditorWorkflowNodeData(data);
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
      const nodeType = node.type;
      if (typeof nodeType === 'string') {
        const mediaInputType = (
          MEDIA_INPUT_NODE_TYPES as Readonly<Record<string, string>>
        )[nodeType];
        if (mediaInputType) {
          return toPersistedMediaInputNode(node, mediaInputType);
        }

        const record = isNodeDataRecord(node.data) ? node.data : {};
        const explicitActionId = record[WORKFLOW_ACTION_ID_KEY];
        const actionId =
          typeof explicitActionId === 'string' && explicitActionId.length > 0
            ? getWorkflowActionIdForNodeType(explicitActionId)
            : ENGINE_NATIVE_EDITOR_NODE_TYPES.has(nodeType)
              ? undefined
              : getWorkflowActionIdForNodeType(nodeType);

        if (actionId) {
          return {
            ...node,
            data: toPersistedActionNodeData(node.data, actionId),
            type: 'genfeedAction',
          };
        }

        if (!ENGINE_NATIVE_EDITOR_NODE_TYPES.has(nodeType)) {
          throw new Error(
            `Workflow node ${String(node.id)} uses unsupported product node type ${nodeType}`,
          );
        }
      }

      return {
        ...node,
        data: toPersistedWorkflowNodeData(node.data),
        type: nodeType,
      };
    }

    const data = isNodeDataRecord(node.data) ? node.data : {};
    const originalType = data[ORIGINAL_NODE_TYPE_KEY];

    if (typeof originalType !== 'string' || originalType.length === 0) {
      throw new Error(
        `Workflow node ${String(node.id)} has no executable type`,
      );
    }

    const { [ORIGINAL_NODE_TYPE_KEY]: _ignored, ...restData } = data;

    const restoredType = originalType;
    const actionId = getWorkflowActionIdForNodeType(restoredType);

    if (!actionId) {
      throw new Error(
        `Workflow node ${String(node.id)} uses unsupported product node type ${restoredType}`,
      );
    }

    return {
      ...node,
      data: toPersistedActionNodeData(restData, actionId),
      type: 'genfeedAction',
    };
  });
}
