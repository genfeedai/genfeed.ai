import type { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';

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
  return provider.retrieveSelectedBrandContentMemory(input, sourceIds);
}
