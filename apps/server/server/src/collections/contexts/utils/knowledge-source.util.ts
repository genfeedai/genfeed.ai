import { KnowledgeBaseCategory, KnowledgeBaseStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';

export const KNOWLEDGE_BASE_PURPOSE = 'knowledge-base';
export const KNOWLEDGE_SOURCE_CHUNK_KIND = 'knowledge-source-chunk';

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

export function writeKnowledgeSources(
  data: unknown,
  sources: PersistedKnowledgeSource[],
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify({
      ...getContextDataRecord(data),
      purpose: KNOWLEDGE_BASE_PURPOSE,
      sources,
    }),
  ) as Prisma.InputJsonValue;
}

export function findKnowledgeSource(
  sources: PersistedKnowledgeSource[],
  sourceId: string,
): PersistedKnowledgeSource | undefined {
  return sources.find((source) => source.id === sourceId);
}

export function upsertKnowledgeSource(
  sources: PersistedKnowledgeSource[],
  next: PersistedKnowledgeSource,
): PersistedKnowledgeSource[] {
  const index = sources.findIndex((source) => source.id === next.id);
  if (index === -1) {
    return [...sources, next];
  }

  const copy = [...sources];
  copy[index] = { ...copy[index], ...next };
  return copy;
}

export function sourceNeedsIngest(source: PersistedKnowledgeSource): boolean {
  if (source.isDeleted) {
    return false;
  }
  if (!source.referenceUrl) {
    return false;
  }
  return (
    source.status === KnowledgeBaseStatus.DRAFT ||
    source.status === KnowledgeBaseStatus.FAILED ||
    source.status === KnowledgeBaseStatus.PROCESSING
  );
}
