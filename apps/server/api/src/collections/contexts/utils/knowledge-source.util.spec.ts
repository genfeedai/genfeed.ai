import {
  findKnowledgeSource,
  parseKnowledgeSources,
  sourceNeedsIngest,
  upsertKnowledgeSource,
  writeKnowledgeSources,
} from '@api/collections/contexts/utils/knowledge-source.util';
import { KnowledgeBaseCategory, KnowledgeBaseStatus } from '@genfeedai/enums';

describe('knowledge-source.util', () => {
  const source = {
    category: KnowledgeBaseCategory.URL,
    id: 'src_1',
    label: 'Docs',
    referenceUrl: 'https://docs.example.com',
    status: KnowledgeBaseStatus.DRAFT,
  };

  it('parses valid sources and drops malformed rows', () => {
    expect(
      parseKnowledgeSources({
        sources: [source, { id: 'bad' }, 'nope'],
      }),
    ).toEqual([source]);
  });

  it('writes sources onto the context payload with the knowledge-base purpose', () => {
    expect(writeKnowledgeSources({ label: 'Voice' }, [source])).toEqual({
      label: 'Voice',
      purpose: 'knowledge-base',
      sources: [source],
    });
  });

  it('upserts by id and finds a source', () => {
    const updated = upsertKnowledgeSource([source], {
      ...source,
      status: KnowledgeBaseStatus.COMPLETED,
    });

    expect(findKnowledgeSource(updated, 'src_1')?.status).toBe(
      KnowledgeBaseStatus.COMPLETED,
    );
    expect(upsertKnowledgeSource([], source)).toEqual([source]);
  });

  it('flags draft, failed, and processing sources for ingest', () => {
    expect(sourceNeedsIngest(source)).toBe(true);
    expect(
      sourceNeedsIngest({ ...source, status: KnowledgeBaseStatus.FAILED }),
    ).toBe(true);
    expect(sourceNeedsIngest({ ...source, isDeleted: true })).toBe(false);
    expect(
      sourceNeedsIngest({
        ...source,
        status: KnowledgeBaseStatus.COMPLETED,
      }),
    ).toBe(false);
  });
});
