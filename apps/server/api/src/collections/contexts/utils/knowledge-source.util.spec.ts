import {
  KNOWLEDGE_BASE_PURPOSE,
  KNOWLEDGE_SOURCE_CHUNK_KIND,
  parseKnowledgeSources,
} from '@api/collections/contexts/utils/knowledge-source.util';
import {
  KnowledgeBaseCategory,
  KnowledgeBaseStatus,
} from '@genfeedai/contracts';

describe('knowledge-source.util', () => {
  const source = {
    category: KnowledgeBaseCategory.URL,
    id: 'src_1',
    label: 'Docs',
    referenceUrl: 'https://docs.example.com',
    status: KnowledgeBaseStatus.DRAFT,
  };

  it('parses legacy sources and drops malformed rows', () => {
    expect(
      parseKnowledgeSources({
        sources: [source, { id: 'bad' }, 'nope'],
      }),
    ).toEqual([source]);
    expect(parseKnowledgeSources(null)).toEqual([]);
  });

  it('keeps the chunk vocabulary stable for retrieval consumers', () => {
    expect(KNOWLEDGE_BASE_PURPOSE).toBe('knowledge-base');
    expect(KNOWLEDGE_SOURCE_CHUNK_KIND).toBe('knowledge-source-chunk');
  });
});
