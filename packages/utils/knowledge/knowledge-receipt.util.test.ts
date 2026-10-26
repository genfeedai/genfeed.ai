import type { KnowledgeRetrievalCitation } from '@genfeedai/contracts/interfaces';
import {
  readKnowledgeSearchReceipts,
  toKnowledgeReceipt,
} from '@genfeedai/utils/knowledge/knowledge-receipt.util';
import { describe, expect, it } from 'vitest';

const citation = {
  kind: 'TEXT',
  purpose: 'BRAND_TRUTH',
  sourceId: 'source-1',
  title: 'Brand facts',
  version: 2,
  versionId: 'version-2',
} as KnowledgeRetrievalCitation;

describe('knowledge receipts', () => {
  it('keeps the citation identity and adds the passage text and relevance', () => {
    expect(
      toKnowledgeReceipt({
        citation,
        content: 'We ship every Thursday.',
        relevance: 0.8,
      }),
    ).toEqual({
      ...citation,
      excerpt: 'We ship every Thursday.',
      relevance: 0.8,
    });
  });

  it('reads one receipt per well-formed passage, in order, and skips the rest', () => {
    const receipts = readKnowledgeSearchReceipts({
      passages: [
        { citation, content: 'first', relevance: 0.9 },
        { content: 'no citation', relevance: 0.5 },
        {
          citation: { ...citation, versionId: 'version-3' },
          content: 'third',
          relevance: 0.4,
        },
      ],
    });
    expect(receipts.map((receipt) => receipt.excerpt)).toEqual([
      'first',
      'third',
    ]);
    expect(receipts[1].versionId).toBe('version-3');
  });

  it.each([undefined, null, 'text', {}, { passages: 'nope' }])(
    'returns no receipts for %j',
    (data) => {
      expect(readKnowledgeSearchReceipts(data)).toEqual([]);
    },
  );
});
