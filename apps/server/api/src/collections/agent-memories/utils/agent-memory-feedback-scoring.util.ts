import type {
  AgentMemoryContentType,
  AgentMemoryDocument,
} from '@api/collections/agent-memories/schemas/agent-memory.schema';
import type { AgentFeedbackMemoryInfluence } from '@api/collections/agent-memories/services/agent-memories.service';

export function normalizeScore(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

export function scoreFeedbackMemory(
  memory: AgentMemoryDocument,
  context: {
    pinnedMemoryIds: Set<string>;
    queryTerms: Set<string>;
    requestedType: AgentMemoryContentType;
    requestedBrandId?: string;
    requestedPlatform?: string;
  },
): AgentFeedbackMemoryInfluence {
  let score = 0;
  const reasons: string[] = [];
  const matchedPromptTerms: string[] = [];
  const rankingFactors: Record<string, number> = {};
  const memoryId = resolveMemoryId(memory);
  const addScore = (factor: string, value: number, reason?: string) => {
    if (value <= 0) {
      return;
    }

    const normalized = roundScore(value);
    score += normalized;
    rankingFactors[factor] = roundScore(
      (rankingFactors[factor] ?? 0) + normalized,
    );
    if (reason) {
      reasons.push(reason);
    }
  };

  if (context.pinnedMemoryIds.has(memoryId)) {
    addScore('pinned', 100, 'Pinned to this thread');
  }

  if (
    context.requestedBrandId &&
    memory.brandId &&
    String(memory.brandId) === context.requestedBrandId
  ) {
    addScore('brand', 6, 'Matches the selected brand');
  }

  const memoryPlatform = normalizeText(memory.platform);
  if (
    context.requestedPlatform &&
    memoryPlatform &&
    memoryPlatform === context.requestedPlatform
  ) {
    addScore(
      'platform',
      8,
      `Matches the requested platform ${context.requestedPlatform}`,
    );
  }

  if (
    context.requestedType !== 'generic' &&
    memory.contentType === context.requestedType
  ) {
    addScore(
      'contentType',
      7,
      `Matches requested content type ${context.requestedType}`,
    );
  } else if (memory.contentType === 'generic') {
    addScore('contentType', 1, 'Generic feedback can apply broadly');
  }

  switch (memory.kind) {
    case 'winner':
      addScore('kind', 7, 'Prior winning pattern');
      break;
    case 'pattern':
      addScore('kind', 6, 'Reusable pattern feedback');
      break;
    case 'positive_example':
      addScore('kind', 5, 'Positive example feedback');
      break;
    case 'negative_example':
      addScore('kind', 5, 'Avoidance feedback');
      break;
    case 'preference':
      addScore('kind', 4, 'User preference feedback');
      break;
    case 'reference':
      addScore('kind', 4, 'Reference feedback');
      break;
    case 'instruction':
    default:
      addScore('kind', 3, 'Saved instruction feedback');
      break;
  }

  const importance = normalizeScore(memory.importance ?? undefined, 0.5);
  addScore('importance', importance * 3);

  const confidence = normalizeScore(memory.confidence ?? undefined, 0.5);
  addScore(
    'confidence',
    confidence * 4,
    confidence >= 0.7
      ? `High confidence feedback (${confidence.toFixed(2)})`
      : undefined,
  );

  const recency = scoreRecency(memory);
  addScore(
    'recency',
    recency * 3,
    recency >= 0.66 ? 'Recent feedback' : undefined,
  );

  const performance = scorePerformanceRelevance(memory);
  addScore(
    'performance',
    performance.score * 5,
    performance.reason ?? undefined,
  );

  if (context.queryTerms.size > 0) {
    const haystack = [
      memory.content,
      memory.summary,
      memory.platform,
      ...(memory.tags ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    let matches = 0;
    for (const term of context.queryTerms) {
      if (haystack.includes(term)) {
        matches += 1;
        matchedPromptTerms.push(term);
      }
    }

    addScore(
      'query',
      matches * 3,
      matches > 0
        ? `Matches prompt terms: ${matchedPromptTerms.join(', ')}`
        : undefined,
    );
  } else {
    addScore('query', 1, 'No specific prompt terms were available');
  }

  return {
    matchedPromptTerms,
    rankingFactors,
    reasons,
    score: roundScore(score),
  };
}

function scoreRecency(memory: AgentMemoryDocument): number {
  const createdAtMs = getMemoryCreatedAtMs(memory);
  if (!createdAtMs) {
    return 0.25;
  }

  const ageDays = Math.max(0, (Date.now() - createdAtMs) / 86_400_000);
  return roundScore(Math.max(0, 1 - ageDays / 90));
}

function scorePerformanceRelevance(memory: AgentMemoryDocument): {
  reason?: string;
  score: number;
} {
  const snapshot = readPerformanceSnapshot(memory);
  if (!snapshot) {
    return { score: 0 };
  }

  const outcome = normalizeText(snapshot.outcome);
  const status = normalizeText(snapshot.status);
  const isWinner =
    snapshot.isWinner === true ||
    snapshot.winner === true ||
    outcome === 'winner' ||
    status === 'winner';
  if (isWinner) {
    return {
      reason: 'Performance snapshot marks this as a winner',
      score: 1,
    };
  }

  const candidates = [
    'engagementScore',
    'performanceScore',
    'qualityScore',
    'score',
    'engagementRate',
    'conversionRate',
    'ctr',
  ];
  let best = 0;
  for (const key of candidates) {
    const value = snapshot[key];
    if (typeof value !== 'number' || Number.isNaN(value)) {
      continue;
    }
    const normalized = value > 1 ? value / 100 : value;
    best = Math.max(best, Math.max(0, Math.min(1, normalized)));
  }

  if (best >= 0.7) {
    return {
      reason: `Performance snapshot is strong (${best.toFixed(2)})`,
      score: roundScore(best),
    };
  }

  return { score: roundScore(best) };
}

function readPerformanceSnapshot(
  memory: AgentMemoryDocument,
): Record<string, unknown> | null {
  const snapshot = memory.performanceSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }

  return snapshot as Record<string, unknown>;
}

export function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

export function getMemoryCreatedAtMs(memory: AgentMemoryDocument): number {
  const createdAt = (memory as AgentMemoryDocument & { createdAt?: Date })
    .createdAt;
  if (!createdAt) {
    return 0;
  }

  return new Date(createdAt).getTime();
}

function resolveMemoryId(memory: AgentMemoryDocument): string {
  const id = memory.id;
  return typeof id === 'string' ? id : String(id ?? '');
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
