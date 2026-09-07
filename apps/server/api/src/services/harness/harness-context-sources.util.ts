import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
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
    case 'performance_winner':
    case 'persona_signal':
      return raw;
    default:
      return 'performance_winner';
  }
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
