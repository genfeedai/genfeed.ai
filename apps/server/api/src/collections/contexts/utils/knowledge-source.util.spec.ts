import {
  KNOWLEDGE_BASE_PURPOSE,
  KNOWLEDGE_SOURCE_CHUNK_KIND,
} from '@api/collections/contexts/utils/knowledge-source.util';

describe('knowledge-source.util', () => {
  it('keeps the chunk vocabulary stable for retrieval consumers', () => {
    expect(KNOWLEDGE_BASE_PURPOSE).toBe('knowledge-base');
    expect(KNOWLEDGE_SOURCE_CHUNK_KIND).toBe('knowledge-source-chunk');
  });
});
