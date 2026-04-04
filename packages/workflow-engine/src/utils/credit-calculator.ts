import type {
  CreditCostConfig,
  CreditEstimate,
  ExecutableNode,
} from '@workflow-engine/types';

export const DEFAULT_CREDIT_COSTS: CreditCostConfig = {
  brand: 0,
  brandAsset: 0,
  brandContext: 0,
  caption: 1,
  clip: 2,
  condition: 0,
  delay: 0,
  generateArticle: 3,
  generateImage: 5,
  generateMusic: 8,
  generateVideo: 10,
  imageGen: 5,
  loop: 0,
  publish: 0,
  resize: 1,
  rssInput: 0,
  socialPublish: 0,
  transform: 1,
  tweetInput: 0,
  tweetRemix: 1,
  upscale: 2,
  videoGen: 10,
  webhook: 0,
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
    const credits = costs[node.type] ?? 0;
    breakdown.push({
      credits,
      nodeId: node.id,
      nodeType: node.type,
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
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);
  }

  for (const edge of edges) {
    if (inDegree.has(edge.target)) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
    if (adjList.has(edge.source)) {
      adjList.get(edge.source)?.push(edge.target);
    }
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const result: ExecutableNode[] = [];
  let remainingCredits = availableCredits;
  const included = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }
    const node = nodes.find((n) => n.id === currentId);
    if (!node) {
      continue;
    }

    const cost = costs[node.type] ?? 0;

    if (cost <= remainingCredits) {
      result.push(node);
      included.add(node.id);
      remainingCredits -= cost;

      for (const neighbor of adjList.get(currentId) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
  }

  return result;
}

export function groupCostsByCategory(
  nodes: ExecutableNode[],
  customCosts: Partial<CreditCostConfig> = {},
): Record<string, { nodes: string[]; totalCredits: number }> {
  const costs = { ...DEFAULT_CREDIT_COSTS, ...customCosts };
  const categories: Record<string, { nodes: string[]; totalCredits: number }> =
    {};

  for (const node of nodes) {
    const category = getNodeCategory(node.type);
    if (!categories[category]) {
      categories[category] = { nodes: [], totalCredits: 0 };
    }
    categories[category].nodes.push(node.id);
    categories[category].totalCredits += costs[node.type] ?? 0;
  }

  return categories;
}

const NODE_CATEGORY_MAP: Record<string, string> = {
  brand: 'input',
  brandAsset: 'input',
  brandContext: 'input',
  condition: 'control',
  delay: 'control',
  generateArticle: 'ai',
  generateImage: 'ai',
  generateMusic: 'ai',
  generateVideo: 'ai',
  imageGen: 'ai',
  loop: 'control',
  publish: 'output',
  rssInput: 'input',
  socialPublish: 'output',
  tweetInput: 'input',
  videoGen: 'ai',
  webhook: 'output',
};

function getNodeCategory(nodeType: string): string {
  return NODE_CATEGORY_MAP[nodeType] ?? 'processing';
}
