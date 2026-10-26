import type {
  KnowledgeReceipt,
  KnowledgeRetrievalCitation,
} from '@genfeedai/contracts/interfaces';

/** A retrieved passage as `search_knowledge` returns it. */
export interface KnowledgeSearchPassage {
  citation: KnowledgeRetrievalCitation;
  content: string;
  relevance: number;
}

export function isKnowledgeSearchPassage(
  value: unknown,
): value is KnowledgeSearchPassage {
  if (!value || typeof value !== 'object') return false;
  const { citation, content, relevance } =
    value as Partial<KnowledgeSearchPassage>;
  return (
    typeof content === 'string' &&
    typeof relevance === 'number' &&
    typeof citation?.sourceId === 'string' &&
    typeof citation.versionId === 'string'
  );
}

/**
 * The receipt for one retrieved passage: its citation identity plus the
 * passage text and relevance that reached the caller. Chat answers and MCP
 * results both build receipts here so the two surfaces stay equivalent.
 */
export function toKnowledgeReceipt(
  passage: KnowledgeSearchPassage,
): KnowledgeReceipt {
  return {
    ...passage.citation,
    excerpt: passage.content,
    relevance: passage.relevance,
  };
}

/** Receipts for every well-formed passage of a `search_knowledge` result. */
export function readKnowledgeSearchReceipts(data: unknown): KnowledgeReceipt[] {
  const passages =
    data && typeof data === 'object'
      ? (data as { passages?: unknown }).passages
      : undefined;
  return Array.isArray(passages)
    ? passages.filter(isKnowledgeSearchPassage).map(toKnowledgeReceipt)
    : [];
}
