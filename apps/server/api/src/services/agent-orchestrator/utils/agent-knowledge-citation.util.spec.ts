import {
  annotateKnowledgeSearchData,
  applyVerifiedCitations,
  readCitedPassageIds,
  type TurnKnowledgePassages,
} from '@api/services/agent-orchestrator/utils/agent-knowledge-citation.util';
import {
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { KnowledgeReceipt } from '@genfeedai/contracts/interfaces';
import { readKnowledgeSearchReceipts } from '@genfeedai/utils/knowledge/knowledge-receipt.util';
import { describe, expect, it } from 'vitest';

function passage(sourceId: string, content: string) {
  return {
    citation: {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      sourceId,
      title: `Source ${sourceId}`,
      version: 1,
      versionId: `v-${sourceId}`,
    },
    content,
    relevance: 0.8,
  };
}

function receipt(sourceId: string): KnowledgeReceipt {
  const { citation, content, relevance } = passage(
    sourceId,
    `text ${sourceId}`,
  );
  return { ...citation, excerpt: content, relevance };
}

describe('annotateKnowledgeSearchData', () => {
  it('records the same receipts an MCP client receives for the same result', () => {
    const turn: { knowledgePassages?: TurnKnowledgePassages } = {};
    const data = {
      passages: [passage('a', 'one'), passage('b', 'two')],
      query: 'q',
    };
    annotateKnowledgeSearchData(turn, data, 'brand-1');
    expect(
      [...(turn.knowledgePassages?.values() ?? [])].map(
        (entry) => entry.receipt,
      ),
    ).toEqual(readKnowledgeSearchReceipts(data));
  });

  it('gives every passage a distinct id and records it for the turn', () => {
    const turn: { knowledgePassages?: TurnKnowledgePassages } = {};
    const annotated = annotateKnowledgeSearchData(
      turn,
      { passages: [passage('a', 'one'), passage('b', 'two')], query: 'q' },
      'brand-1',
    );
    expect(annotated?.ids).toEqual(['p1', 'p2']);
    const shown = annotated?.data.passages as Array<{ passageId: string }>;
    expect(shown.map((item) => item.passageId)).toEqual(['p1', 'p2']);
    expect(String(annotated?.data.citationInstruction)).toContain(
      '[[cite:<passageId>]]',
    );
    expect(turn.knowledgePassages?.get('p2')).toEqual({
      brandId: 'brand-1',
      receipt: expect.objectContaining({
        excerpt: 'two',
        relevance: 0.8,
        sourceId: 'b',
      }),
    });
  });

  it('keeps ids unique across searches and after a withheld result is dropped', () => {
    const turn: { knowledgePassages?: TurnKnowledgePassages } = {};
    annotateKnowledgeSearchData(
      turn,
      { passages: [passage('a', 'one')] },
      undefined,
    );
    const second = annotateKnowledgeSearchData(
      turn,
      { passages: [passage('b', 'two')] },
      undefined,
    );
    turn.knowledgePassages?.delete('p1');
    const third = annotateKnowledgeSearchData(
      turn,
      { passages: [passage('c', 'three')] },
      undefined,
    );
    expect(second?.ids).toEqual(['p2']);
    expect(third?.ids).toEqual(['p3']);
  });

  it('leaves results without citable passages untouched', () => {
    const turn: { knowledgePassages?: TurnKnowledgePassages } = {};
    expect(annotateKnowledgeSearchData(turn, { passages: [] }, 'b')).toBeNull();
    expect(
      annotateKnowledgeSearchData(turn, { passages: [{ content: 'x' }] }, 'b'),
    ).toBeNull();
    expect(turn.knowledgePassages).toBeUndefined();
  });
});

describe('applyVerifiedCitations', () => {
  const text =
    'Plans start at $29 [[cite:p1]]. Enterprise is custom [[cite:p2]], billed yearly [[cite:p1]].';

  it('numbers verified sources by first use and reuses a number for a repeat', () => {
    const applied = applyVerifiedCitations(
      text,
      new Map([
        ['p1', receipt('a')],
        ['p2', receipt('b')],
      ]),
    );
    expect(applied.content).toBe(
      'Plans start at $29 [1]. Enterprise is custom [2], billed yearly [1].',
    );
    expect(
      applied.citations.map((c) => [c.marker, c.receipt.sourceId]),
    ).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
    expect(applied.unsupportedCount).toBe(0);
  });

  it('removes a marker it could not verify and counts it instead of showing it', () => {
    const applied = applyVerifiedCitations(
      text,
      new Map([
        ['p1', receipt('a')],
        ['p2', null],
      ]),
    );
    expect(applied.content).toBe(
      'Plans start at $29 [1]. Enterprise is custom, billed yearly [1].',
    );
    expect(applied.unsupportedCount).toBe(1);
  });

  it('treats an id the server never issued as unsupported', () => {
    const applied = applyVerifiedCitations('Claim [[cite:p99]].', new Map());
    expect(applied).toEqual({
      citations: [],
      content: 'Claim.',
      unsupportedCount: 1,
    });
  });
});

describe('readCitedPassageIds', () => {
  it('reads only well-formed markers, in order', () => {
    expect(
      readCitedPassageIds(
        'a [[cite:p2]] b [[cite:p1]] [[cite:]] [[cite:bad id]]',
      ),
    ).toEqual(['p2', 'p1']);
  });
});
