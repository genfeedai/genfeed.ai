import type {
  HarnessRecordKind,
  HarnessSourceRecord,
} from '@genfeedai/harness';

export type BrandMemoryHit = {
  content: string;
  kind?: string | null;
  metadata?: Record<string, unknown> | null;
  relevance: number;
  source?: string | null;
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
