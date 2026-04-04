import {
  normalizeWorkflowNodeTypeToCanonical,
  normalizeWorkflowNodeTypeToLegacy,
} from '@api/collections/workflows/node-type-aliases';
import {
  NODE_REGISTRY as LEGACY_NODE_REGISTRY,
  type NodePort,
  type NodeDefinition as RegistryNodeDefinition,
} from '@api/collections/workflows/registry/node-registry';
import type {
  HandleDefinition,
  NodeDefinition as ModernNodeDefinition,
} from '@genfeedai/types/nodes';
import {
  NODE_DEFINITIONS as MERGED_DEFINITIONS,
  type SaaSNodeDefinition,
} from '@genfeedai/workflow-saas';

export type { RegistryNodeDefinition as NodeDefinition };

// =============================================================================
// ADAPTER: Convert modern NodeDefinition → registry NodeDefinition format
// =============================================================================

/**
 * Maps a modern HandleDefinition to a registry NodePort
 */
function handleToPort(handle: HandleDefinition): NodePort {
  return {
    label: handle.label,
    multiple: handle.multiple,
    required: handle.required,
    type:
      handle.type === 'brand' || handle.type === 'object'
        ? 'any'
        : (handle.type as NodePort['type']),
  };
}

/**
 * Converts a modern NodeDefinition or SaaSNodeDefinition to registry format
 */
function modernToRegistryDefinition(
  type: string,
  def: ModernNodeDefinition | SaaSNodeDefinition,
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
    unified[type] = modernToRegistryDefinition(
      type,
      def as ModernNodeDefinition | SaaSNodeDefinition,
    );
  }

  for (const [type, def] of Object.entries(LEGACY_NODE_REGISTRY)) {
    const canonicalType = normalizeWorkflowNodeTypeToCanonical(type);

    if (
      !(type in unified) ||
      type === 'ai-avatar-video' ||
      type === 'workflow-input' ||
      type === 'workflow-output'
    ) {
      unified[type] = def;
    }

    if (!(canonicalType in unified)) {
      unified[canonicalType] = { ...def, type: canonicalType };
    }
  }

  return unified;
}

/**
 * Unified node registry — single source of truth for workflow nodes.
 */
export const UNIFIED_NODE_REGISTRY = buildUnifiedRegistry();

/**
 * Check if a node type exists in the unified registry
 */
export function isValidNodeType(type: string): boolean {
  return (
    type in UNIFIED_NODE_REGISTRY ||
    normalizeWorkflowNodeTypeToCanonical(type) in UNIFIED_NODE_REGISTRY ||
    normalizeWorkflowNodeTypeToLegacy(type) in UNIFIED_NODE_REGISTRY
  );
}

/**
 * Get a node definition from the unified registry
 */
export function getNodeDefinition(
  type: string,
): RegistryNodeDefinition | undefined {
  return (
    UNIFIED_NODE_REGISTRY[type] ??
    UNIFIED_NODE_REGISTRY[normalizeWorkflowNodeTypeToCanonical(type)] ??
    UNIFIED_NODE_REGISTRY[normalizeWorkflowNodeTypeToLegacy(type)]
  );
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
