import type {
  CreditCostConfig,
  CreditEstimate,
  ExecutableNode,
} from '@workflow-engine/types';

/**
 * Credit costs per node type execution.
 *
 * All node types registered in EXECUTOR_REGISTRY must have an entry here.
 * The coverage spec (credit-calculator-coverage.spec.ts) enforces this.
 *
 * Costs marked [ESTIMATED] were inferred from comparable node types and should
 * be reviewed by the product team before billing goes live.
 */
export const DEFAULT_CREDIT_COSTS: CreditCostConfig = {
  // ----- context / input (free) -----
  brand: 0,
  brandAsset: 0,
  brandContext: 0,
  engagementTrigger: 0, // trigger nodes are free
  keywordTrigger: 0,
  mentionTrigger: 0,
  musicSource: 0, // resolver; cost is in the underlying generation
  newFollowerTrigger: 0,
  newLikeTrigger: 0,
  newRepostTrigger: 0,
  noop: 0,
  patternContext: 0,
  promptConstructor: 0,
  rssInput: 0,
  trendTrigger: 0,
  tweetInput: 0,
  videoInput: 0,

  // ----- control flow (free) -----
  condition: 0,
  delay: 0,
  loop: 0, // legacy alias

  // ----- publish / output (free — billed by platform API limits, not credits) -----
  publish: 0,
  sendDm: 0,
  // sendEmail is free at the node level; the trends digest is charged explicitly
  // by the workflow adapter post-run hook after a confirmed send (see trendDigest).
  sendEmail: 0,
  socialPublish: 0,
  // trendDigest assembles the email payload only; the credit is deducted by the
  // adapter post-run hook on a confirmed send, not via the engine accumulator.
  trendDigest: 0,
  webhook: 0, // legacy alias

  // ----- text / content generation -----
  caption: 1, // legacy alias
  generateArticle: 3, // legacy alias
  postReply: 1, // [ESTIMATED] comparable to caption
  tweetRemix: 1,

  // ----- image generation / processing -----
  generateImage: 5, // legacy alias
  imageGen: 5,
  resize: 1, // legacy alias
  transform: 1, // legacy alias

  // ----- video generation / processing -----
  beatAnalysis: 1, // [ESTIMATED] audio analysis; similar cost to resize
  beatSyncEditor: 2, // [ESTIMATED] video edit; similar cost to clip
  cinematicColorGrade: 2, // [ESTIMATED] heavier FFmpeg pass than colorGrade
  clip: 2, // legacy alias
  colorGrade: 1, // [ESTIMATED] FFmpeg filter pass; comparable to resize
  filmGrain: 1, // [ESTIMATED] FFmpeg noise filter; comparable to colorGrade
  generateVideo: 10, // legacy alias
  lensEffects: 1, // [ESTIMATED] FFmpeg composite; comparable to colorGrade
  lipSync: 8, // [ESTIMATED] AI video synthesis; comparable to generateMusic
  reframe: 3, // [ESTIMATED] AI reframe; heavier than colorGrade, cheaper than full gen
  soundOverlay: 1, // [ESTIMATED] simple FFmpeg audio mux
  upscale: 2,
  videoGen: 10, // legacy alias

  // ----- audio / voice -----
  generateMusic: 8, // legacy alias
  textToSpeech: 3, // [ESTIMATED] TTS synthesis; comparable to generateArticle
  voiceChange: 5, // [ESTIMATED] AI voice conversion; comparable to imageGen
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
  // input / context
  brand: 'input',
  brandAsset: 'input',
  brandContext: 'input',
  engagementTrigger: 'input',
  keywordTrigger: 'input',
  mentionTrigger: 'input',
  musicSource: 'input',
  newFollowerTrigger: 'input',
  newLikeTrigger: 'input',
  newRepostTrigger: 'input',
  noop: 'input',
  patternContext: 'input',
  rssInput: 'input',
  trendTrigger: 'input',
  tweetInput: 'input',
  videoInput: 'input',

  // control
  condition: 'control',
  delay: 'control',
  loop: 'control',
  promptConstructor: 'control',

  // output
  publish: 'output',
  sendDm: 'output',
  socialPublish: 'output',
  webhook: 'output',
  postReply: 'output',

  // ai
  generateArticle: 'ai',
  generateImage: 'ai',
  generateMusic: 'ai',
  generateVideo: 'ai',
  imageGen: 'ai',
  lipSync: 'ai',
  textToSpeech: 'ai',
  videoGen: 'ai',
  voiceChange: 'ai',

  // processing
  beatAnalysis: 'processing',
  beatSyncEditor: 'processing',
  caption: 'processing',
  cinematicColorGrade: 'processing',
  clip: 'processing',
  colorGrade: 'processing',
  filmGrain: 'processing',
  lensEffects: 'processing',
  reframe: 'processing',
  resize: 'processing',
  soundOverlay: 'processing',
  transform: 'processing',
  tweetRemix: 'processing',
  upscale: 'processing',
};

function getNodeCategory(nodeType: string): string {
  return NODE_CATEGORY_MAP[nodeType] ?? 'processing';
}
