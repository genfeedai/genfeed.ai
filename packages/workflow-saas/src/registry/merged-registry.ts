import {
  NODE_DEFINITIONS as CORE_NODE_DEFINITIONS,
  type NodeType as CoreNodeType,
  type NodeCategory,
  type NodeDefinition,
} from '@cloud/types/nodes';
import type { ExtendedNodeCategory } from '@workflow-saas/types';
import {
  isSaaSNode,
  SAAS_NODE_DEFINITIONS,
  type SaaSNodeDefinition,
  type SaaSNodeType,
} from './saas-definitions';

export type {
  CoreNodeType,
  NodeCategory,
  NodeDefinition,
  SaaSNodeDefinition,
  SaaSNodeType,
};
export { CORE_NODE_DEFINITIONS, isSaaSNode, SAAS_NODE_DEFINITIONS };

/**
 * Extended node type - union of core and SaaS node types
 */
export type ExtendedNodeType = CoreNodeType | SaaSNodeType;

/**
 * Extended node category - union of core and SaaS categories
 */
export type { ExtendedNodeCategory };

/**
 * Check if a node type is a core node
 */
export function isCoreNode(type: string): type is CoreNodeType {
  return type in CORE_NODE_DEFINITIONS;
}

/**
 * Check if a node type is valid (either core or SaaS)
 */
export function isValidNodeType(type: string): type is ExtendedNodeType {
  return isCoreNode(type) || isSaaSNode(type);
}

export function getNodeDefinition(
  type: string,
): NodeDefinition | SaaSNodeDefinition | undefined {
  if (isCoreNode(type)) {
    return CORE_NODE_DEFINITIONS[type as CoreNodeType];
  }
  if (isSaaSNode(type)) {
    return SAAS_NODE_DEFINITIONS[type];
  }
  return undefined;
}

/**
 * Merged node definitions - combines core and SaaS nodes
 */
export const NODE_DEFINITIONS = {
  ...CORE_NODE_DEFINITIONS,
  ...SAAS_NODE_DEFINITIONS,
} as const;

/** Valid extended categories */
const EXTENDED_CATEGORIES: readonly ExtendedNodeCategory[] = [
  'input',
  'ai',
  'processing',
  'output',
  'distribution',
  'composition',
  'saas',
  'automation',
  'repurposing',
] as const;

/**
 * Get all node types grouped by category
 */
export function getNodesByExtendedCategory(): Record<
  ExtendedNodeCategory,
  (NodeDefinition | SaaSNodeDefinition)[]
> {
  const categories = Object.fromEntries(
    EXTENDED_CATEGORIES.map((cat) => [cat, []]),
  ) as unknown as Record<
    ExtendedNodeCategory,
    (NodeDefinition | SaaSNodeDefinition)[]
  >;

  for (const def of Object.values(CORE_NODE_DEFINITIONS)) {
    categories[def.category as ExtendedNodeCategory]?.push(def);
  }

  for (const def of Object.values(SAAS_NODE_DEFINITIONS)) {
    categories[def.category as ExtendedNodeCategory]?.push(def);
  }

  return categories;
}

/**
 * Get all extended node types
 */
export function getAllNodeTypes(): ExtendedNodeType[] {
  return [
    ...(Object.keys(CORE_NODE_DEFINITIONS) as CoreNodeType[]),
    ...(Object.keys(SAAS_NODE_DEFINITIONS) as SaaSNodeType[]),
  ];
}
