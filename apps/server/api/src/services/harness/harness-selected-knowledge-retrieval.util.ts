import {
  type KnowledgeContentRetrievalService,
  SELECTED_KNOWLEDGE_PASSAGE_BUDGET,
} from '@api/collections/contexts/services/knowledge-content-retrieval.service';

export { SELECTED_KNOWLEDGE_PASSAGE_BUDGET } from '@api/collections/contexts/services/knowledge-content-retrieval.service';

type RetrievalProvider = Pick<
  KnowledgeContentRetrievalService,
  'retrieveSelectedBrandContentMemory'
>;
type RetrievalInput = Parameters<
  RetrievalProvider['retrieveSelectedBrandContentMemory']
>[0];
type RetrievalHits = Awaited<
  ReturnType<RetrievalProvider['retrieveSelectedBrandContentMemory']>
>;

export async function retrieveSelectedKnowledge(
  provider: RetrievalProvider,
  input: RetrievalInput,
  sourceIds: readonly string[],
): Promise<RetrievalHits> {
  const hits = await provider.retrieveSelectedBrandContentMemory(
    input,
    sourceIds,
  );
  if (hits.length > SELECTED_KNOWLEDGE_PASSAGE_BUDGET) {
    throw new Error('knowledge_unavailable');
  }
  return hits;
}
