import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import { learningContractIdSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type {
  KnowledgeReceipt,
  KnowledgeRetrievalCitation,
} from '@genfeedai/contracts/interfaces';
import type {
  HarnessRecordKind,
  HarnessSourceRecord,
} from '@genfeedai/harness';

export type BrandMemoryHit = {
  citation?: KnowledgeRetrievalCitation;
  content: string;
  kind?: string | null;
  metadata?: Record<string, unknown> | null;
  relevance: number;
  source?: string | null;
};

/** Metadata stamped on every entry the winner promotion writes. */
export const PERFORMANCE_WINNER_KIND = 'performance_winner';
export const PERFORMANCE_WINNER_SOURCE = 'harness-winner-promotion';

export type PerformanceWinnerHit = {
  content: string;
  engagementRate?: number;
  /** Stable layer identity for the snapshot brief receipt. */
  id: string;
  platform?: string;
  postId: string;
};

const HARNESS_KIND_BY_PURPOSE: Record<
  KnowledgeSourcePurpose,
  HarnessRecordKind
> = {
  [KnowledgeSourcePurpose.BRAND_TRUTH]: 'brand_voice',
  [KnowledgeSourcePurpose.INSPIRATION]: 'brand_example',
  [KnowledgeSourcePurpose.RESEARCH]: 'audience_signal',
};

const PURPOSE_LABEL: Record<KnowledgeSourcePurpose, string> = {
  [KnowledgeSourcePurpose.BRAND_TRUTH]: 'Brand Truth',
  [KnowledgeSourcePurpose.INSPIRATION]: 'Inspiration',
  [KnowledgeSourcePurpose.RESEARCH]: 'Research',
};

/**
 * Map brand-scoped similarity hits into harness source records for brief compose.
 * Caps length and normalizes kinds so generation always sees a stable vocabulary.
 */
export function brandMemoryHitsToHarnessSources(
  hits: BrandMemoryHit[],
  options?: { limit?: number; minRelevance?: number },
): HarnessSourceRecord[] {
  const limit = options?.limit ?? 5;
  const minRelevance = options?.minRelevance ?? 0.65;

  return hits
    .filter(
      (hit) =>
        hit.content.trim().length > 0 &&
        Number.isFinite(hit.relevance) &&
        hit.relevance >= minRelevance,
    )
    .slice(0, limit)
    .map((hit, index) => {
      if (hit.citation) {
        return knowledgeHitToHarnessSource(hit, hit.citation, index);
      }
      const kind = normalizeHarnessKind(hit.kind);
      return {
        content: hit.content.trim().slice(0, 500),
        id: `brand-memory-${index}-${kind}`,
        kind,
        metadata: {
          ...(hit.metadata ?? {}),
          relevance: hit.relevance,
        },
        source: hit.source ?? 'brand-content-memory',
        weight: hit.relevance,
      };
    });
}

/**
 * A cited Knowledge passage keeps its purpose visible in the brief and carries
 * the exact source version so downstream receipts can point back to it.
 */
function knowledgeHitToHarnessSource(
  hit: BrandMemoryHit,
  citation: KnowledgeRetrievalCitation,
  index: number,
): HarnessSourceRecord {
  return {
    content: hit.content.trim().slice(0, 500),
    id: `knowledge-${citation.sourceId}-${citation.versionId}-${index}`,
    kind: HARNESS_KIND_BY_PURPOSE[citation.purpose],
    metadata: {
      ...(hit.metadata ?? {}),
      citation,
      relevance: hit.relevance,
    },
    source: `${citation.title} · ${PURPOSE_LABEL[citation.purpose]}`,
    weight: hit.relevance,
  };
}

function normalizeHarnessKind(
  raw: string | null | undefined,
): HarnessRecordKind {
  switch (raw) {
    case 'anti_example':
    case 'audience_signal':
    case 'brand_example':
    case 'brand_voice':
    case 'evaluation_rubric':
    case PERFORMANCE_WINNER_KIND:
    case 'persona_signal':
      return raw;
    default:
      return PERFORMANCE_WINNER_KIND;
  }
}

/**
 * A promoted performance winner carries no Knowledge citation — its evidence
 * is the measured post it came from. Only entries the winner promotion wrote
 * (kind, source and post id all present) qualify; any other uncited memory
 * stays excluded from the immutable snapshot brief.
 */
export function readPerformanceWinnerHit(
  hit: BrandMemoryHit,
): PerformanceWinnerHit | null {
  const metadata = hit.metadata ?? {};
  const kind = hit.kind ?? metadata.kind;
  const postId = typeof metadata.postId === 'string' ? metadata.postId : '';
  const content = hit.content.trim();
  const id = `performance-winner:${postId}`;
  if (
    hit.citation ||
    kind !== PERFORMANCE_WINNER_KIND ||
    metadata.source !== PERFORMANCE_WINNER_SOURCE ||
    !content ||
    !postId.trim() ||
    !learningContractIdSchema.safeParse(id).success
  ) {
    return null;
  }
  return {
    content: content.slice(0, 500),
    ...(typeof metadata.engagementRate === 'number' &&
    Number.isFinite(metadata.engagementRate)
      ? { engagementRate: metadata.engagementRate }
      : {}),
    id,
    ...(typeof metadata.platform === 'string'
      ? { platform: metadata.platform }
      : {}),
    postId,
  };
}

function isCitation(value: unknown): value is KnowledgeRetrievalCitation {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as KnowledgeRetrievalCitation).sourceId === 'string' &&
    typeof (value as KnowledgeRetrievalCitation).versionId === 'string'
  );
}

/**
 * Receipts for every cited passage that reached the brief, so a generated
 * output can point back to the exact source versions that shaped it.
 */
export function collectKnowledgeReceipts(
  sources: readonly HarnessSourceRecord[] | undefined,
): KnowledgeReceipt[] {
  const receipts: KnowledgeReceipt[] = [];
  const seen = new Set<string>();
  for (const source of sources ?? []) {
    const citation = source.metadata?.citation;
    if (!isCitation(citation)) {
      continue;
    }
    const key = `${citation.versionId}:${source.content}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const relevance =
      typeof source.metadata?.relevance === 'number'
        ? source.metadata.relevance
        : (source.weight ?? 0);
    receipts.push({ ...citation, excerpt: source.content, relevance });
  }
  return receipts;
}
