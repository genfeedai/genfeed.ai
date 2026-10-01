import type { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';

type RetrievalProvider = Pick<
  KnowledgeContentRetrievalService,
  'retrieveBrandContentMemory'
>;
type RetrievalInput = Parameters<
  RetrievalProvider['retrieveBrandContentMemory']
>[0];
type RetrievalHits = Awaited<
  ReturnType<RetrievalProvider['retrieveBrandContentMemory']>
>;
export const SELECTED_KNOWLEDGE_PASSAGE_BUDGET = 8;

export async function retrieveSelectedKnowledge(
  provider: RetrievalProvider,
  input: RetrievalInput,
  sourceIds: readonly string[],
): Promise<RetrievalHits> {
  if (
    !sourceIds.length ||
    sourceIds.length > SELECTED_KNOWLEDGE_PASSAGE_BUDGET
  ) {
    throw new Error('knowledge_unavailable');
  }
  const hits: RetrievalHits = [];
  const baseQuota = Math.floor(
    SELECTED_KNOWLEDGE_PASSAGE_BUDGET / sourceIds.length,
  );
  const remainder = SELECTED_KNOWLEDGE_PASSAGE_BUDGET % sourceIds.length;
  for (const [index, sourceId] of sourceIds.entries()) {
    const quota = baseQuota + (index < remainder ? 1 : 0);
    const selectedHits = await provider.retrieveBrandContentMemory({
      ...input,
      knowledgeSourceIds: [sourceId],
      isKnowledgeOnly: true,
      minRelevance: 0,
      limit: quota,
    });
    if (
      !Array.isArray(selectedHits) ||
      !selectedHits.length ||
      selectedHits.length > quota ||
      selectedHits.some((hit) => hit.citation?.sourceId !== sourceId)
    ) {
      throw new Error('knowledge_unavailable');
    }
    hits.push(...selectedHits);
  }
  return hits;
}
