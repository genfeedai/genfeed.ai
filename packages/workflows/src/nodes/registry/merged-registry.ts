import {
  NODE_DEFINITIONS as CORE_NODE_DEFINITIONS,
  type NodeType as CoreNodeType,
  type NodeCategory,
  type NodeDefinition,
} from '@genfeedai/contracts/types/nodes';
import { isEngineNativeNodeType } from '../../engine/utils/action-node';
import type { ExtendedNodeCategory } from '../types';
import { ACTION_NODE_DEFINITIONS } from './action-node-definitions';
import type { CatalogNodeDefinition } from './catalog-node-definition';
import { ENGINE_NATIVE_NODE_DEFINITIONS } from './engine-native-definitions';

export type {
  CatalogNodeDefinition,
  CoreNodeType,
  NodeCategory,
  NodeDefinition,
};

export type MergedNodeDefinition = NodeDefinition | CatalogNodeDefinition;

const ENGINE_NATIVE_CORE_DEFINITIONS = Object.fromEntries(
  Object.entries(CORE_NODE_DEFINITIONS).filter(([type]) =>
    isEngineNativeNodeType(type),
  ),
) as Partial<Record<CoreNodeType, NodeDefinition>>;

export { ACTION_NODE_DEFINITIONS, CORE_NODE_DEFINITIONS };

/**
 * Check if a node type is a core engine-native definition from @genfeedai/types.
 */
export function isCoreNode(type: string): type is CoreNodeType {
  return type in ENGINE_NATIVE_CORE_DEFINITIONS;
}

export function isCatalogActionNode(type: string): boolean {
  return type in ACTION_NODE_DEFINITIONS;
}

export function isEngineNativeCatalogNode(type: string): boolean {
  return type in ENGINE_NATIVE_NODE_DEFINITIONS;
}

/**
 * Check if a node type is valid (engine-native or catalog-generated).
 */
export function isValidNodeType(type: string): boolean {
  return (
    isCoreNode(type) ||
    isEngineNativeCatalogNode(type) ||
    isCatalogActionNode(type)
  );
}

export function getNodeDefinition(
  type: string,
): MergedNodeDefinition | undefined {
  if (isEngineNativeCatalogNode(type)) {
    return ENGINE_NATIVE_NODE_DEFINITIONS[type];
  }
  if (isCatalogActionNode(type)) {
    return ACTION_NODE_DEFINITIONS[type];
  }
  if (isCoreNode(type)) {
    return ENGINE_NATIVE_CORE_DEFINITIONS[type as CoreNodeType];
  }
  return undefined;
}

/**
 * Merged node definitions: engine-native hand-authored entries plus
 * action-backed nodes generated from ALL_ACTIONS.
 */
export const NODE_DEFINITIONS: Record<string, MergedNodeDefinition> = {
  ...ENGINE_NATIVE_CORE_DEFINITIONS,
  ...ENGINE_NATIVE_NODE_DEFINITIONS,
  ...ACTION_NODE_DEFINITIONS,
};

/**
 * Get all node types grouped by category
 */
export function getNodesByExtendedCategory(): Record<
  ExtendedNodeCategory,
  MergedNodeDefinition[]
> {
  const categories: Record<ExtendedNodeCategory, MergedNodeDefinition[]> = {
    ai: [],
    automation: [],
    composition: [],
    distribution: [],
    input: [],
    output: [],
    processing: [],
    repurposing: [],
    saas: [],
  };

  for (const definition of Object.values(NODE_DEFINITIONS)) {
    categories[definition.category]?.push(definition);
  }

  return categories;
}

/**
 * Get all extended node types
 */
export function getAllNodeTypes(): string[] {
  return Object.keys(NODE_DEFINITIONS);
}
