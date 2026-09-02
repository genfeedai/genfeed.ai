import { FLOW_NODE_DEFINITIONS } from '@api/collections/workflows/registry/node-registry.flow-definitions';
import { GENERATION_NODE_DEFINITIONS } from '@api/collections/workflows/registry/node-registry.generation-definitions';
import { IO_NODE_DEFINITIONS } from '@api/collections/workflows/registry/node-registry.io-definitions';

/**
 * Node Registry - Function Library for Visual Workflow Builder
 *
 * Defines all available node types that users can drag onto the workflow canvas.
 * Each product node resolves to a registered Genfeed action at persistence time.
 */

// =============================================================================
// TYPES
// =============================================================================

export type NodeInputType =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'number'
  | 'boolean'
  | 'any';

export interface NodePort {
  type: NodeInputType;
  label: string;
  required?: boolean;
  multiple?: boolean;
}

export interface NodeConfigField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'asset' | 'variable';
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  min?: number;
  max?: number;
}

export interface NodeDefinition {
  label: string;
  description: string;
  category: 'input' | 'processing' | 'effects' | 'ai' | 'output' | 'control';
  icon: string;
  inputs: Record<string, NodePort>;
  outputs: Record<string, NodePort>;
  configSchema: Record<string, NodeConfigField>;
  isPremium?: boolean;
  isEnabled?: boolean;
  type?: string;
}

export { SOURCE_CORPUS_CONFIG_LIMITS } from '@api/collections/workflows/registry/node-registry.generation-definitions';

// =============================================================================
// NODE REGISTRY
// =============================================================================

export const NODE_REGISTRY: Record<string, NodeDefinition> = {
  ...GENERATION_NODE_DEFINITIONS,
  ...FLOW_NODE_DEFINITIONS,
  ...IO_NODE_DEFINITIONS,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all nodes grouped by category
 */
export function getNodesByCategory(): Record<string, NodeDefinition[]> {
  const categories: Record<string, NodeDefinition[]> = {
    ai: [],
    control: [],
    effects: [],
    input: [],
    output: [],
    processing: [],
  };

  for (const [key, node] of Object.entries(NODE_REGISTRY)) {
    if (node.isEnabled !== false) {
      categories[node.category].push({ ...node, type: key });
    }
  }

  return categories;
}

/**
 * Get node definition by type
 */
export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return NODE_REGISTRY[type];
}

/**
 * Validate node connections
 */
export function validateConnection(
  sourceType: string,
  sourceHandle: string,
  targetType: string,
  targetHandle: string,
): boolean {
  const sourceNode = NODE_REGISTRY[sourceType];
  const targetNode = NODE_REGISTRY[targetType];

  if (!sourceNode || !targetNode) {
    return false;
  }

  const sourceOutput = sourceNode.outputs[sourceHandle];
  const targetInput = targetNode.inputs[targetHandle];

  if (!sourceOutput || !targetInput) {
    return false;
  }

  // "any" type can connect to anything
  if (sourceOutput.type === 'any' || targetInput.type === 'any') {
    return true;
  }

  // Types must match
  return sourceOutput.type === targetInput.type;
}

/**
 * Get nodes that can connect to a specific input
 */
export function getCompatibleNodes(
  targetType: string,
  targetHandle: string,
): string[] {
  const targetNode = NODE_REGISTRY[targetType];
  if (!targetNode) {
    return [];
  }

  const targetInput = targetNode.inputs[targetHandle];
  if (!targetInput) {
    return [];
  }

  const compatible: string[] = [];

  for (const [key, node] of Object.entries(NODE_REGISTRY)) {
    for (const [_outputKey, output] of Object.entries(node.outputs)) {
      if (
        output.type === 'any' ||
        targetInput.type === 'any' ||
        output.type === targetInput.type
      ) {
        compatible.push(key);
        break;
      }
    }
  }

  return compatible;
}
