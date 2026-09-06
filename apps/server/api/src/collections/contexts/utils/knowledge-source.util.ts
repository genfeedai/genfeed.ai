import {
  KnowledgeBaseCategory,
  KnowledgeBaseStatus,
  KnowledgeMemoryScope,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';

/** `data.purpose` of every context base that stores Knowledge chunks. */
export const KNOWLEDGE_BASE_PURPOSE = 'knowledge-base';
export const KNOWLEDGE_SOURCE_CHUNK_KIND = 'knowledge-source-chunk';

/**
 * Legacy source metadata persisted on `ContextBase.data.sources` before
 * canonical Knowledge records existed. Read-only: the #4123 migration moves
 * these rows into `knowledge_sources`; nothing writes this shape any more.
 */
export interface PersistedKnowledgeSource {
  category: KnowledgeBaseCategory;
  chunkCount?: number;
  error?: string;
  id: string;
  isDeleted?: boolean;
  label: string;
  lastIngestedAt?: string;
  referenceUrl?: string;
  status: KnowledgeBaseStatus;
  summary?: string;
  tags?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isKnowledgeBaseCategory(
  value: unknown,
): value is KnowledgeBaseCategory {
  return (
    typeof value === 'string' &&
    Object.values(KnowledgeBaseCategory).includes(
      value as KnowledgeBaseCategory,
    )
  );
}

function isKnowledgeBaseStatus(value: unknown): value is KnowledgeBaseStatus {
  return (
    typeof value === 'string' &&
    Object.values(KnowledgeBaseStatus).includes(value as KnowledgeBaseStatus)
  );
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

export function getContextDataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

export function parseKnowledgeSources(
  data: unknown,
): PersistedKnowledgeSource[] {
  const record = getContextDataRecord(data);
  if (!Array.isArray(record.sources)) {
    return [];
  }

  return record.sources.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id) {
      return [];
    }
    if (typeof entry.label !== 'string' || !entry.label.trim()) {
      return [];
    }
    if (!isKnowledgeBaseCategory(entry.category)) {
      return [];
    }

    const source: PersistedKnowledgeSource = {
      category: entry.category,
      id: entry.id,
      label: entry.label.trim(),
      status: isKnowledgeBaseStatus(entry.status)
        ? entry.status
        : KnowledgeBaseStatus.DRAFT,
    };

    if (typeof entry.chunkCount === 'number') {
      source.chunkCount = entry.chunkCount;
    }
    if (typeof entry.error === 'string') {
      source.error = entry.error;
    }
    if (entry.isDeleted === true) {
      source.isDeleted = true;
    }
    if (typeof entry.lastIngestedAt === 'string') {
      source.lastIngestedAt = entry.lastIngestedAt;
    }
    if (typeof entry.referenceUrl === 'string') {
      source.referenceUrl = entry.referenceUrl;
    }
    if (typeof entry.summary === 'string') {
      source.summary = entry.summary;
    }
    if (
      Array.isArray(entry.tags) &&
      entry.tags.every((tag) => typeof tag === 'string')
    ) {
      source.tags = entry.tags;
    }

    return [source];
  });
}
