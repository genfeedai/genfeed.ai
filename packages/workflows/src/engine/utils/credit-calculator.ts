import type {
  CreditCostConfig,
  CreditEstimate,
  ExecutableNode,
} from '../types';
import { getExecutableNodeOperationId } from './action-node';

/**
 * Credit costs per node type execution.
 *
 * Every node type registered with the engine (via the API executor registrars)
 * must have an entry here. The coverage spec (credit-calculator-coverage.spec.ts)
 * enforces that every cost is a non-negative number.
 *
 * Costs marked [ESTIMATED] were inferred from comparable node types and should
 * be reviewed by the product team before billing goes live.
 */
export const DEFAULT_CREDIT_COSTS: CreditCostConfig = {
  // ----- context / input (free) -----
  brand: 0,
  brandAsset: 0,
  brandContext: 0,
  commentTrigger: 0,
  engagementTrigger: 0, // trigger nodes are free
  keywordTrigger: 0,
  mentionTrigger: 0,
  musicSource: 0, // resolver; cost is in the underlying generation
  // Private report delivery is free at the node level (notification/email path).
  reportDelivery: 0,
  socialRead: 1, // [ESTIMATED] on-demand X read via platform API
  newFollowerTrigger: 0,
  newLikeTrigger: 0,
  newRepostTrigger: 0,
  postPublishTrigger: 0, // trigger node — the optimization workflow it starts bills itself
  promptConstructor: 0,
  castPrompt: 0,
  trendTrigger: 0,
  // Engine-native media inputs are free.
  'input-image': 0,
  'input-video': 0,

  // ----- control flow (free) -----
  'control-branch': 0,
  'control-delay': 0,
  'control-loop': 0,
  condition: 0,
  delay: 0,
  reviewGate: 0,

  // ----- publish / output (free — billed by platform API limits, not credits) -----
  publish: 0,
  sendDm: 0,
  // sendEmail is free at the node level; the trends digest is charged explicitly
  // by the workflow adapter post-run hook after a confirmed send (see trendDigest).
  sendEmail: 0,
  // trendDigest assembles the email payload only; the credit is deducted by the
  // adapter post-run hook on a confirmed send, not via the engine accumulator.
  trendDigest: 0,
  'output-webhook': 0,

  // ----- text / content generation -----
  'effect-captions': 1,
  hookGenerator: 1, // [ESTIMATED] deterministic content generation; comparable to caption
  iterativeSeoRefine: 15, // [ESTIMATED] default maxIterations(3) x (score 2 + rewrite 3) -> ~15; the engine reads this flat value for budgeting, while executor.estimateCost scales with the configured maxIterations
  postReply: 1, // [ESTIMATED] comparable to caption
  seoRewrite: 3, // [ESTIMATED] full LLM rewrite
  seoScore: 2, // [ESTIMATED] LLM-assisted scoring pass; lighter than a full rewrite
  talkingHeadScript: 3, // Full structured script generation
  trendHashtagInspiration: 1, // [ESTIMATED] lightweight prompt synthesis from trend context
  trendSoundInspiration: 1, // [ESTIMATED] cached trend lookup / sound selection
  trendVideoInspiration: 1, // [ESTIMATED] lightweight prompt synthesis from trend context

  // ----- image generation / processing -----
  imageGen: 5,
  'process-resize': 1,
  'process-transform': 1,

  // ----- video generation / processing -----
  cinematicColorGrade: 2, // [ESTIMATED] heavier FFmpeg pass than colorGrade
  colorGrade: 1, // [ESTIMATED] FFmpeg filter pass; comparable to resize
  filmGrain: 1, // [ESTIMATED] FFmpeg noise filter; comparable to colorGrade
  lensEffects: 1, // [ESTIMATED] FFmpeg composite; comparable to colorGrade
  lipSync: 8, // [ESTIMATED] AI video synthesis
  reframe: 3, // [ESTIMATED] AI reframe; heavier than colorGrade, cheaper than full gen
  soundOverlay: 1, // [ESTIMATED] simple FFmpeg audio mux
  videoQa: 1, // FFmpeg-pass tier: ffprobe + blackdetect/freezedetect/ebur128
  videoFrameExtract: 2,
  videoStitch: 1, // FFmpeg concat pass
  upscale: 2,
  // Pilot runs reuse this videoGen cost at min duration — there is no
  // `videoPilot` key. VideoGenerationGateService scales by duration.
  videoGen: 10,

  // ----- audio / voice -----
  textToSpeech: 3, // [ESTIMATED] TTS synthesis
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

    const cost = costs[getExecutableNodeOperationId(node)] ?? 0;

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
    const operationId = getExecutableNodeOperationId(node);
    const category = getNodeCategory(operationId);
    if (!categories[category]) {
      categories[category] = { nodes: [], totalCredits: 0 };
    }
    categories[category].nodes.push(node.id);
    categories[category].totalCredits += costs[operationId] ?? 0;
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
  postPublishTrigger: 'input',
  socialRead: 'input',
  trendTrigger: 'input',
  'input-image': 'input',
  'input-video': 'input',

  // control
  'control-branch': 'control',
  'control-delay': 'control',
  'control-loop': 'control',
  condition: 'control',
  delay: 'control',
  promptConstructor: 'control',
  reviewGate: 'control',

  // output
  publish: 'output',
  reportDelivery: 'output',
  sendDm: 'output',
  'output-webhook': 'output',
  postReply: 'output',

  // ai
  hookGenerator: 'ai',
  imageGen: 'ai',
  iterativeSeoRefine: 'ai',
  lipSync: 'ai',
  seoRewrite: 'ai',
  seoScore: 'ai',
  talkingHeadScript: 'ai',
  textToSpeech: 'ai',
  trendHashtagInspiration: 'ai',
  trendSoundInspiration: 'ai',
  trendVideoInspiration: 'ai',
  videoGen: 'ai',
  voiceChange: 'ai',

  // processing
  'effect-captions': 'processing',
  cinematicColorGrade: 'processing',
  colorGrade: 'processing',
  filmGrain: 'processing',
  lensEffects: 'processing',
  reframe: 'processing',
  'process-resize': 'processing',
  'process-transform': 'processing',
  soundOverlay: 'processing',
  videoQa: 'processing',
  upscale: 'processing',
  videoFrameExtract: 'processing',
};

function getNodeCategory(nodeType: string): string {
  return NODE_CATEGORY_MAP[nodeType] ?? 'processing';
}
