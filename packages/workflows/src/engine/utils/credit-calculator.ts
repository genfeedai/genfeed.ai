import { ALL_ACTIONS } from '@genfeedai/actions';
import { topologicalSort } from '../execution/topological-sort';
import type {
  CreditCostConfig,
  CreditEstimate,
  ExecutableNode,
} from '../types';
import { getExecutableNodeOperationId } from './action-node';

/** Engine-native graph primitives are free; product-operation costs live on actions. */
const ENGINE_NATIVE_CREDIT_COSTS: CreditCostConfig = {
  commentTrigger: 0,
  engagementTrigger: 0,
  'input-image': 0,
  'input-video': 0,
  'control-branch': 0,
  'control-delay': 0,
  condition: 0,
  delay: 0,
  keywordTrigger: 0,
  mentionTrigger: 0,
  newFollowerTrigger: 0,
  newLikeTrigger: 0,
  newRepostTrigger: 0,
  postPublishTrigger: 0,
  reviewGate: 0,
  workflowInput: 0,
};

/**
 * Engine billing view generated from the action catalog. Dynamic actions bill
 * inside their executor and therefore have no flat estimate here.
 */
export const DEFAULT_CREDIT_COSTS: CreditCostConfig = {
  ...Object.fromEntries(
    ALL_ACTIONS.flatMap((action) =>
      action.credits.mode === 'fixed'
        ? [[action.id, action.credits.amount] as const]
        : [],
    ),
  ),
  ...ENGINE_NATIVE_CREDIT_COSTS,
};

export function calculateCreditEstimate(
  nodes: ExecutableNode[],
  availableCredits: number,
  customCosts: Partial<CreditCostConfig> = {},
): CreditEstimate {
  const costs = { ...DEFAULT_CREDIT_COSTS, ...customCosts };

  const breakdown: CreditEstimate['breakdown'] = [];
  let totalCredits = 0;

  for (const node of nodes) {
    const operationId = getExecutableNodeOperationId(node);
    const credits = costs[operationId] ?? 0;
    breakdown.push({
      credits,
      nodeId: node.id,
      nodeType: operationId,
    });
    totalCredits += credits;
  }

  return {
    availableCredits,
    breakdown,
    hasInsufficientCredits: totalCredits > availableCredits,
    totalCredits,
  };
}

export function getNodeCreditCost(
  nodeType: string,
  customCosts: Partial<CreditCostConfig> = {},
): number {
  const costs = { ...DEFAULT_CREDIT_COSTS, ...customCosts };
  return costs[nodeType] ?? 0;
}

export function hasInsufficientCredits(
  nodes: ExecutableNode[],
  availableCredits: number,
  customCosts: Partial<CreditCostConfig> = {},
): boolean {
  const estimate = calculateCreditEstimate(
    nodes,
    availableCredits,
    customCosts,
  );
  return estimate.hasInsufficientCredits;
}

export function filterByBudget(
  nodes: ExecutableNode[],
  edges: Array<{ source: string; target: string }>,
  availableCredits: number,
  customCosts: Partial<CreditCostConfig> = {},
): ExecutableNode[] {
  const costs = { ...DEFAULT_CREDIT_COSTS, ...customCosts };
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const parents = new Map<string, string[]>();
  for (const node of nodes) {
    parents.set(node.id, []);
  }
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      continue;
    }
    const list = parents.get(edge.target) ?? [];
    list.push(edge.source);
    parents.set(edge.target, list);
  }

  const result: ExecutableNode[] = [];
  const included = new Set<string>();
  let remainingCredits = availableCredits;

  for (const nodeId of topologicalSort(nodes, edges)) {
    const node = nodeById.get(nodeId);
    if (!node) {
      continue;
    }
    if (
      (parents.get(nodeId) ?? []).some((parentId) => !included.has(parentId))
    ) {
      continue;
    }
    const cost = costs[getExecutableNodeOperationId(node)] ?? 0;
    if (cost > remainingCredits) {
      continue;
    }
    result.push(node);
    included.add(node.id);
    remainingCredits -= cost;
  }

  return result;
}
