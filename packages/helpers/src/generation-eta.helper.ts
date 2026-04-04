export type EtaConfidence = 'low' | 'medium' | 'high';

export interface GenerationEtaSnapshot {
  estimatedDurationMs?: number;
  remainingDurationMs?: number;
  etaConfidence?: EtaConfidence;
  currentPhase?: string;
  startedAt?: string;
  lastEtaUpdateAt?: string;
}

export interface GenerationEtaEstimateInput {
  type:
    | 'article'
    | 'avatar'
    | 'background'
    | 'image'
    | 'music'
    | 'video'
    | 'workflow';
  model?: string;
  provider?: string;
  resolution?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  audioDurationSeconds?: number;
  outputCount?: number;
  promptText?: string;
  progress?: number;
  startedAt?: Date | string;
  currentPhase?: string;
  transformType?: string;
  extraProcessingCount?: number;
  length?: 'long' | 'medium' | 'short' | string;
}

export interface WorkflowEtaNodeLike {
  id: string;
  type: string;
  label?: string;
  config?: Record<string, unknown>;
}

export interface WorkflowEtaEdgeLike {
  source: string;
  target: string;
}

export interface WorkflowEtaEstimate extends GenerationEtaSnapshot {
  criticalPathNodeIds: string[];
}

interface DurationEstimate {
  confidence: EtaConfidence;
  durationMs: number;
}

const FIVE_SECONDS_MS = 5_000;
const ONE_MINUTE_MS = 60_000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeIsoDate(date: Date | string | undefined): string | undefined {
  if (!date) {
    return undefined;
  }

  const resolved = typeof date === 'string' ? new Date(date) : date;
  return Number.isNaN(resolved.getTime()) ? undefined : resolved.toISOString();
}

function getElapsedDurationMs(startedAt: Date | string | undefined): number {
  const isoDate = normalizeIsoDate(startedAt);
  if (!isoDate) {
    return 0;
  }

  return Math.max(0, Date.now() - new Date(isoDate).getTime());
}

function getResolutionMultiplier(input: {
  height?: number;
  resolution?: string;
  width?: number;
}): number {
  const normalizedResolution = input.resolution?.toLowerCase();
  if (normalizedResolution?.includes('4k')) {
    return 2;
  }
  if (normalizedResolution?.includes('1080')) {
    return 1.25;
  }
  if (normalizedResolution?.includes('720')) {
    return 1;
  }
  if (normalizedResolution?.includes('480')) {
    return 0.85;
  }

  const width = input.width ?? 1024;
  const height = input.height ?? 1024;
  const megaPixels = (width * height) / 1_000_000;
  return clamp(megaPixels / 1.2, 0.85, 2);
}

function estimateImageDurationMs(
  input: GenerationEtaEstimateInput,
): DurationEstimate {
  const model = input.model?.toLowerCase() ?? '';
  let durationMs = 18_000;
  let confidence: EtaConfidence = 'medium';

  if (model.includes('schnell') || model.includes('turbo')) {
    durationMs = 10_000;
    confidence = 'high';
  } else if (
    model.includes('pro') ||
    model.includes('imagen') ||
    model.includes('leonardo')
  ) {
    durationMs = 22_000;
    confidence = 'high';
  } else if (model.includes('flux') || model.includes('sdxl')) {
    durationMs = 16_000;
  } else if (!model) {
    confidence = 'low';
  }

  const outputCount = Math.max(1, input.outputCount ?? 1);
  const transformType = input.transformType?.toLowerCase() ?? '';
  const transformMultiplier =
    transformType.includes('upscale') || transformType.includes('variation')
      ? 1.15
      : 1;

  durationMs *= getResolutionMultiplier(input);
  durationMs *= 1 + (outputCount - 1) * 0.7;
  durationMs *= transformMultiplier;

  return { confidence, durationMs: Math.round(durationMs) };
}

function estimateVideoDurationMs(
  input: GenerationEtaEstimateInput,
): DurationEstimate {
  const model = input.model?.toLowerCase() ?? '';
  const provider = input.provider?.toLowerCase() ?? '';
  let durationMs = 90_000;
  let confidence: EtaConfidence = 'medium';

  if (model.includes('veo')) {
    durationMs = 150_000;
    confidence = 'high';
  } else if (model.includes('kling')) {
    durationMs = 120_000;
    confidence = 'high';
  } else if (model.includes('runway')) {
    durationMs = 110_000;
  } else if (model.includes('stable video') || model.includes('luma')) {
    durationMs = 75_000;
  } else if (!model && !provider) {
    confidence = 'low';
  }

  if (provider.includes('fal')) {
    durationMs *= 0.9;
  }

  const durationSeconds = Math.max(5, input.durationSeconds ?? 5);
  durationMs *= durationSeconds / 5;
  durationMs *= getResolutionMultiplier(input);
  durationMs += (input.extraProcessingCount ?? 0) * 15_000;

  return { confidence, durationMs: Math.round(durationMs) };
}

function estimateAvatarDurationMs(
  input: GenerationEtaEstimateInput,
): DurationEstimate {
  const provider =
    input.provider?.toLowerCase() ?? input.model?.toLowerCase() ?? '';
  const promptWordCount =
    input.promptText?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  const inferredSpeechSeconds = clamp(
    Math.round(promptWordCount / 2.5),
    20,
    120,
  );
  const speechSeconds = input.audioDurationSeconds ?? inferredSpeechSeconds;

  let durationMs = 90_000 + speechSeconds * 3_000;
  let confidence: EtaConfidence = input.audioDurationSeconds
    ? 'high'
    : 'medium';

  if (provider.includes('hedra')) {
    durationMs = 75_000 + speechSeconds * 2_500;
  } else if (!provider) {
    confidence = 'low';
  }

  return { confidence, durationMs: Math.round(durationMs) };
}

function estimateMusicDurationMs(
  input: GenerationEtaEstimateInput,
): DurationEstimate {
  const durationSeconds = Math.max(10, input.durationSeconds ?? 10);
  const model = input.model?.toLowerCase() ?? '';
  let durationMs = 25_000 + durationSeconds * 1_000;
  const confidence: EtaConfidence = model ? 'medium' : 'low';

  if (model.includes('musicgen')) {
    durationMs *= 0.9;
  }

  return { confidence, durationMs: Math.round(durationMs) };
}

function estimateArticleDurationMs(
  input: GenerationEtaEstimateInput,
): DurationEstimate {
  const length = input.length?.toLowerCase() ?? 'medium';
  let durationMs = 20_000;
  if (length === 'short') {
    durationMs = 12_000;
  } else if (length === 'long') {
    durationMs = 35_000;
  }

  return {
    confidence: input.model ? 'medium' : 'low',
    durationMs,
  };
}

function estimateBackgroundDurationMs(
  input: GenerationEtaEstimateInput,
): DurationEstimate {
  const phase = input.currentPhase?.toLowerCase() ?? '';
  const model = input.model?.toLowerCase() ?? '';
  const prompt = input.promptText?.toLowerCase() ?? '';
  const fingerprint = `${phase} ${model} ${prompt}`;

  if (fingerprint.includes('merge')) {
    return { confidence: 'medium', durationMs: 90_000 };
  }
  if (fingerprint.includes('article')) {
    return { confidence: 'medium', durationMs: 30_000 };
  }
  if (fingerprint.includes('image')) {
    return { confidence: 'medium', durationMs: 18_000 };
  }
  if (fingerprint.includes('music')) {
    return { confidence: 'medium', durationMs: 40_000 };
  }
  if (
    fingerprint.includes('avatar') ||
    fingerprint.includes('lip') ||
    fingerprint.includes('heygen')
  ) {
    return { confidence: 'low', durationMs: 180_000 };
  }
  if (fingerprint.includes('video')) {
    return { confidence: 'medium', durationMs: 120_000 };
  }

  return { confidence: 'low', durationMs: 45_000 };
}

function estimateNodeDuration(node: WorkflowEtaNodeLike): DurationEstimate {
  const type = node.type.toLowerCase();
  const config = node.config ?? {};
  const configRecord = config as Record<string, unknown>;
  const model =
    typeof configRecord.model === 'string' ? configRecord.model : undefined;
  const provider =
    typeof configRecord.provider === 'string'
      ? configRecord.provider
      : undefined;
  const resolution =
    typeof configRecord.resolution === 'string'
      ? configRecord.resolution
      : undefined;
  const durationSeconds =
    typeof configRecord.duration === 'number'
      ? configRecord.duration
      : undefined;
  const promptText =
    typeof configRecord.prompt === 'string'
      ? configRecord.prompt
      : typeof configRecord.topic === 'string'
        ? configRecord.topic
        : undefined;

  if (
    type.includes('video') ||
    type === 'ai-generate-video' ||
    type === 'persona-video-content'
  ) {
    return estimateVideoDurationMs({
      durationSeconds,
      model,
      promptText,
      provider,
      resolution,
      type: 'video',
    });
  }

  if (type.includes('avatar')) {
    return estimateAvatarDurationMs({
      audioDurationSeconds:
        typeof configRecord.audioDurationSeconds === 'number'
          ? configRecord.audioDurationSeconds
          : undefined,
      model,
      promptText,
      provider,
      type: 'avatar',
    });
  }

  if (
    type.includes('image') ||
    type === 'ai-generate-image' ||
    type === 'persona-photo-session'
  ) {
    return estimateImageDurationMs({
      height:
        typeof configRecord.height === 'number'
          ? configRecord.height
          : undefined,
      model,
      promptText,
      resolution,
      type: 'image',
      width:
        typeof configRecord.width === 'number' ? configRecord.width : undefined,
    });
  }

  if (
    type.includes('article') ||
    type.includes('newsletter') ||
    type.includes('llm') ||
    type.includes('hook-generator') ||
    type.includes('tweet-remix')
  ) {
    return estimateArticleDurationMs({
      length:
        typeof configRecord.length === 'string'
          ? configRecord.length
          : undefined,
      model,
      promptText,
      type: 'article',
    });
  }

  if (type.includes('music') || type.includes('sound-overlay')) {
    return estimateMusicDurationMs({
      durationSeconds,
      model,
      promptText,
      type: 'music',
    });
  }

  if (type.includes('delay')) {
    const delayMs =
      typeof configRecord.delayMs === 'number'
        ? configRecord.delayMs
        : typeof configRecord.delay === 'number'
          ? configRecord.delay
          : 0;
    return {
      confidence: delayMs > 0 ? 'high' : 'low',
      durationMs: Math.max(0, delayMs),
    };
  }

  if (
    type.includes('publish') ||
    type.includes('trigger') ||
    type.includes('input') ||
    type.includes('output') ||
    type.includes('brand') ||
    type.includes('context') ||
    type.includes('condition')
  ) {
    return { confidence: 'medium', durationMs: 5_000 };
  }

  return { confidence: 'low', durationMs: 10_000 };
}

function estimateGenerationDuration(
  input: GenerationEtaEstimateInput,
): DurationEstimate {
  switch (input.type) {
    case 'article':
      return estimateArticleDurationMs(input);
    case 'avatar':
      return estimateAvatarDurationMs(input);
    case 'background':
      return estimateBackgroundDurationMs(input);
    case 'image':
      return estimateImageDurationMs(input);
    case 'music':
      return estimateMusicDurationMs(input);
    case 'video':
      return estimateVideoDurationMs(input);
    case 'workflow':
      return { confidence: 'low', durationMs: 60_000 };
  }
}

export function buildGenerationEtaSnapshot(
  input: GenerationEtaEstimateInput,
): GenerationEtaSnapshot | null {
  const estimate = estimateGenerationDuration(input);
  if (estimate.durationMs <= 0) {
    return null;
  }

  const startedAt = normalizeIsoDate(input.startedAt);
  const elapsedMs = getElapsedDurationMs(input.startedAt);
  const progress = clamp(input.progress ?? 0, 0, 100);
  const progressRemainingMs =
    progress > 0
      ? Math.round(estimate.durationMs * ((100 - progress) / 100))
      : undefined;
  const elapsedRemainingMs = Math.max(0, estimate.durationMs - elapsedMs);
  const remainingDurationMs =
    progressRemainingMs !== undefined
      ? Math.max(elapsedRemainingMs, progressRemainingMs)
      : elapsedRemainingMs;

  return {
    currentPhase: input.currentPhase,
    estimatedDurationMs: estimate.durationMs,
    etaConfidence: estimate.confidence,
    lastEtaUpdateAt: new Date().toISOString(),
    remainingDurationMs,
    startedAt,
  };
}

export function estimateWorkflowCriticalPath(
  nodes: WorkflowEtaNodeLike[],
  edges: WorkflowEtaEdgeLike[],
): WorkflowEtaEstimate {
  if (nodes.length === 0) {
    return {
      criticalPathNodeIds: [],
      estimatedDurationMs: 0,
      etaConfidence: 'low',
      lastEtaUpdateAt: new Date().toISOString(),
      remainingDurationMs: 0,
    };
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const predecessor = new Map<string, string | null>();
  const distance = new Map<string, number>();
  const confidenceRank = new Map<EtaConfidence, number>([
    ['low', 1],
    ['medium', 2],
    ['high', 3],
  ]);
  let pathConfidence: EtaConfidence = 'high';

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
    distance.set(node.id, estimateNodeDuration(node).durationMs);
    predecessor.set(node.id, null);
    const nodeConfidence = estimateNodeDuration(node).confidence;
    if (
      confidenceRank.get(nodeConfidence)! < confidenceRank.get(pathConfidence)!
    ) {
      pathConfidence = nodeConfidence;
    }
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      continue;
    }

    adjacency.set(edge.source, [
      ...(adjacency.get(edge.source) ?? []),
      edge.target,
    ]);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue = Array.from(inDegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId);
  const visited: string[] = [];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId) {
      continue;
    }

    visited.push(currentNodeId);
    const currentDistance = distance.get(currentNodeId) ?? 0;

    for (const neighborId of adjacency.get(currentNodeId) ?? []) {
      const neighborNode = nodeMap.get(neighborId);
      if (!neighborNode) {
        continue;
      }

      const neighborWeight = estimateNodeDuration(neighborNode).durationMs;
      const candidateDistance = currentDistance + neighborWeight;
      if (candidateDistance > (distance.get(neighborId) ?? 0)) {
        distance.set(neighborId, candidateDistance);
        predecessor.set(neighborId, currentNodeId);
      }

      const nextInDegree = (inDegree.get(neighborId) ?? 1) - 1;
      inDegree.set(neighborId, nextInDegree);
      if (nextInDegree === 0) {
        queue.push(neighborId);
      }
    }
  }

  if (visited.length !== nodes.length) {
    const totalDurationMs = nodes.reduce(
      (sum, node) => sum + estimateNodeDuration(node).durationMs,
      0,
    );

    return {
      criticalPathNodeIds: nodes.map((node) => node.id),
      estimatedDurationMs: totalDurationMs,
      etaConfidence: 'low',
      lastEtaUpdateAt: new Date().toISOString(),
      remainingDurationMs: totalDurationMs,
    };
  }

  const [terminalNodeId, totalDurationMs] = Array.from(
    distance.entries(),
  ).reduce((currentBest, candidate) =>
    candidate[1] > currentBest[1] ? candidate : currentBest,
  );

  const criticalPathNodeIds: string[] = [];
  let cursor: string | null = terminalNodeId;
  while (cursor) {
    criticalPathNodeIds.unshift(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }

  for (const nodeId of criticalPathNodeIds) {
    const node = nodeMap.get(nodeId);
    if (!node) {
      continue;
    }

    const nodeConfidence = estimateNodeDuration(node).confidence;
    if (
      confidenceRank.get(nodeConfidence)! < confidenceRank.get(pathConfidence)!
    ) {
      pathConfidence = nodeConfidence;
    }
  }

  return {
    criticalPathNodeIds,
    estimatedDurationMs: totalDurationMs,
    etaConfidence: pathConfidence,
    lastEtaUpdateAt: new Date().toISOString(),
    remainingDurationMs: totalDurationMs,
  };
}

export function buildWorkflowEtaSnapshot(params: {
  nodes: WorkflowEtaNodeLike[];
  edges: WorkflowEtaEdgeLike[];
  completedNodeIds?: Iterable<string>;
  skippedNodeIds?: Iterable<string>;
  startedAt?: Date | string;
  currentPhase?: string;
  baselineEstimatedDurationMs?: number;
}): WorkflowEtaEstimate {
  const completedNodeIds = new Set(params.completedNodeIds ?? []);
  const skippedNodeIds = new Set(params.skippedNodeIds ?? []);
  const remainingNodes = params.nodes.filter(
    (node) => !completedNodeIds.has(node.id) && !skippedNodeIds.has(node.id),
  );
  const remainingNodeIds = new Set(remainingNodes.map((node) => node.id));
  const remainingEdges = params.edges.filter(
    (edge) =>
      remainingNodeIds.has(edge.source) && remainingNodeIds.has(edge.target),
  );

  const baseline =
    params.baselineEstimatedDurationMs ??
    estimateWorkflowCriticalPath(params.nodes, params.edges)
      .estimatedDurationMs ??
    0;
  const remainingEstimate = estimateWorkflowCriticalPath(
    remainingNodes,
    remainingEdges,
  );

  const startedAt = normalizeIsoDate(params.startedAt);
  const elapsedMs = getElapsedDurationMs(params.startedAt);
  const dynamicEstimate =
    remainingEstimate.estimatedDurationMs && elapsedMs > baseline
      ? elapsedMs + remainingEstimate.estimatedDurationMs
      : baseline;

  return {
    criticalPathNodeIds: remainingEstimate.criticalPathNodeIds,
    currentPhase: params.currentPhase,
    estimatedDurationMs: dynamicEstimate,
    etaConfidence: remainingEstimate.etaConfidence,
    lastEtaUpdateAt: new Date().toISOString(),
    remainingDurationMs: remainingEstimate.estimatedDurationMs,
    startedAt,
  };
}

export function formatEtaDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatEtaRange(durationMs: number): string {
  const lowerBound = Math.max(FIVE_SECONDS_MS, Math.round(durationMs * 0.7));
  const upperBound = Math.round(durationMs * 1.35);

  if (upperBound < ONE_MINUTE_MS) {
    return `${Math.round(lowerBound / 1000)}-${Math.round(upperBound / 1000)}s`;
  }

  return `${Math.round(lowerBound / ONE_MINUTE_MS)}-${Math.round(
    upperBound / ONE_MINUTE_MS,
  )} min`;
}

export function shouldDisplayEta(
  eta: GenerationEtaSnapshot | null | undefined,
): boolean {
  const durationMs = eta?.remainingDurationMs ?? eta?.estimatedDurationMs ?? 0;
  return durationMs >= FIVE_SECONDS_MS;
}
