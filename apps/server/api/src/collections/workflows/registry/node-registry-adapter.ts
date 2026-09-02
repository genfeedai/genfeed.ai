import {
  type NodePort,
  NODE_REGISTRY as PRESENTATION_NODE_REGISTRY,
  type NodeDefinition as RegistryNodeDefinition,
} from '@api/collections/workflows/registry/node-registry';
import { isPersistableWorkflowNodeType } from '@api/collections/workflows/workflow-version-definition';
import type {
  HandleDefinition,
  NodeDefinition as ModernNodeDefinition,
} from '@genfeedai/types/nodes';
import {
  type CatalogNodeDefinition,
  getWorkflowActionIdForNodeType,
  NODE_DEFINITIONS as MERGED_DEFINITIONS,
} from '@genfeedai/workflows/nodes';

export type { RegistryNodeDefinition as NodeDefinition };

// =============================================================================
// ADAPTER: Convert modern NodeDefinition → registry NodeDefinition format
// =============================================================================

/**
 * Maps a modern HandleDefinition to a registry NodePort
 */
function handleToPort(
  handle: HandleDefinition | CatalogNodeDefinition['inputs'][number],
): NodePort {
  const handleType = String(handle.type);

  return {
    label: handle.label,
    multiple: handle.multiple,
    required: handle.required,
    type:
      handleType === 'brand' || handleType === 'object'
        ? 'any'
        : (handleType as NodePort['type']),
  };
}

/**
 * Converts a modern NodeDefinition or catalog node definition to registry format
 */
function modernToRegistryDefinition(
  type: string,
  def: ModernNodeDefinition | CatalogNodeDefinition,
): RegistryNodeDefinition {
  const inputs: Record<string, NodePort> = {};
  const outputs: Record<string, NodePort> = {};

  for (const handle of def.inputs) {
    inputs[handle.id] = handleToPort(handle);
  }

  for (const handle of def.outputs) {
    outputs[handle.id] = handleToPort(handle);
  }

  // Map modern categories to registry categories
  const categoryMap: Record<string, RegistryNodeDefinition['category']> = {
    ai: 'ai',
    automation: 'processing',
    composition: 'processing',
    distribution: 'output',
    input: 'input',
    output: 'output',
    processing: 'processing',
    saas: 'processing',
  };

  return {
    category: categoryMap[def.category] ?? 'processing',
    configSchema: {},
    description: def.description,
    icon: def.icon,
    inputs,
    isEnabled: true,
    label: def.label,
    outputs,
    type,
  };
}

// =============================================================================
// UNIFIED NODE REGISTRY
// =============================================================================

/**
 * Build the unified registry from the merged modern/SaaS definitions.
 */
function buildUnifiedRegistry(): Record<string, RegistryNodeDefinition> {
  const unified: Record<string, RegistryNodeDefinition> = {};
  for (const [type, def] of Object.entries(MERGED_DEFINITIONS)) {
    if (!isPersistablePresentationNodeType(type)) {
      continue;
    }
    unified[type] = modernToRegistryDefinition(
      type,
      def as ModernNodeDefinition | CatalogNodeDefinition,
    );
  }

  for (const [type, def] of Object.entries(PRESENTATION_NODE_REGISTRY)) {
    if (isPersistablePresentationNodeType(type) && !(type in unified)) {
      unified[type] = def;
    }
  }

  return unified;
}

const WORKFLOW_INPUT_PRESENTATION_NODE_TYPES = new Set([
  'audioInput',
  'imageInput',
  'videoInput',
]);

function isPersistablePresentationNodeType(type: string): boolean {
  return (
    WORKFLOW_INPUT_PRESENTATION_NODE_TYPES.has(type) ||
    isPersistableWorkflowNodeType(type) ||
    getWorkflowActionIdForNodeType(type) !== undefined
  );
}

/**
 * Unified node registry — single source of truth for workflow nodes.
 */
export const UNIFIED_NODE_REGISTRY = buildUnifiedRegistry();

/**
 * Check if a node type exists in the unified registry
 */
export function isValidNodeType(type: string): boolean {
  return type in UNIFIED_NODE_REGISTRY;
}

/**
 * Get a node definition from the unified registry
 */
export function getNodeDefinition(
  type: string,
): RegistryNodeDefinition | undefined {
  return UNIFIED_NODE_REGISTRY[type];
}

/**
 * Get all node types grouped by category
 */
export function getNodesByCategory(): Record<string, RegistryNodeDefinition[]> {
  const categories: Record<string, RegistryNodeDefinition[]> = {};

  for (const [type, def] of Object.entries(UNIFIED_NODE_REGISTRY)) {
    if (!categories[def.category]) {
      categories[def.category] = [];
    }
    categories[def.category].push({ ...def, type });
  }

  return categories;
}

/**
 * Validate node connections against the unified registry.
 */
export function validateConnection(
  sourceType: string,
  sourceHandle: string,
  targetType: string,
  targetHandle: string,
): boolean {
  const sourceNode = getNodeDefinition(sourceType);
  const targetNode = getNodeDefinition(targetType);

  if (!sourceNode || !targetNode) {
    return false;
  }

  const sourceOutput = sourceNode.outputs[sourceHandle];
  const targetInput = targetNode.inputs[targetHandle];

  if (!sourceOutput || !targetInput) {
    return false;
  }

  if (sourceOutput.type === 'any' || targetInput.type === 'any') {
    return true;
  }

  return sourceOutput.type === targetInput.type;
}
