import {
  KnowledgeMemoryScope,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';

/** `data.purpose` of every context base that stores Knowledge chunks. */
export const KNOWLEDGE_BASE_PURPOSE = 'knowledge-base';
export const KNOWLEDGE_SOURCE_CHUNK_KIND = 'knowledge-source-chunk';

/**
 * Similarity floor for a retrieval. Sources the user explicitly chose are
 * ranked, not thresholded: the context embedding model scores relevant
 * query/passage pairs below the generic floor, which silently dropped every
 * selected passage and its receipt.
 */
export function resolveKnowledgeMinRelevance(
  knowledgeSourceIds: readonly string[] | undefined,
  floor: number,
): number {
  return knowledgeSourceIds?.length ? 0 : floor;
}

export function isKnowledgeMemoryScope(
  value: unknown,
): value is KnowledgeMemoryScope {
  return (
    typeof value === 'string' &&
    Object.values(KnowledgeMemoryScope).includes(value as KnowledgeMemoryScope)
  );
}

export function isKnowledgeSourceKind(
  value: unknown,
): value is KnowledgeSourceKind {
  return (
    typeof value === 'string' &&
    Object.values(KnowledgeSourceKind).includes(value as KnowledgeSourceKind)
  );
}

export function isKnowledgeSourcePurpose(
  value: unknown,
): value is KnowledgeSourcePurpose {
  return (
    typeof value === 'string' &&
    Object.values(KnowledgeSourcePurpose).includes(
      value as KnowledgeSourcePurpose,
    )
  );
}
