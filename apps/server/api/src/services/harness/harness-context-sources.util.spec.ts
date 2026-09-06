import { brandMemoryHitsToHarnessSources } from '@api/services/harness/harness-context-sources.util';
import {
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('brandMemoryHitsToHarnessSources', () => {
  it('keeps high-relevance hits and normalizes kinds', () => {
    const sources = brandMemoryHitsToHarnessSources(
      [
        {
          content: 'Winning angle about shipping velocity',
          kind: 'performance_winner',
          relevance: 0.91,
          source: 'winners',
        },
        {
          content: 'too weak',
          kind: 'performance_winner',
          relevance: 0.2,
        },
        {
          content: 'Generic library note',
          kind: 'unknown-kind',
          relevance: 0.8,
        },
      ],
      { limit: 5, minRelevance: 0.65 },
    );

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      kind: 'performance_winner',
      source: 'winners',
      weight: 0.91,
    });
    expect(sources[1]?.kind).toBe('performance_winner');
  });

  it('maps cited Knowledge passages by purpose and keeps the citation for receipts', () => {
    const citation = {
      kind: KnowledgeSourceKind.URL,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      sourceId: 'source-1',
      title: 'Pricing page',
      url: 'https://brand.example/pricing',
      version: 2,
      versionId: 'version-2',
    };
    const [truth, inspiration, research] = brandMemoryHitsToHarnessSources([
      { citation, content: 'Plans start at $29', relevance: 0.9 },
      {
        citation: { ...citation, purpose: KnowledgeSourcePurpose.INSPIRATION },
        content: 'A punchy competitor hook',
        relevance: 0.8,
      },
      {
        citation: { ...citation, purpose: KnowledgeSourcePurpose.RESEARCH },
        content: 'Market grew 12% last year',
        relevance: 0.7,
      },
    ]);

    expect(truth).toMatchObject({
      id: 'knowledge-source-1-version-2-0',
      kind: 'brand_voice',
      metadata: { citation, relevance: 0.9 },
      source: 'Pricing page · Brand Truth',
      weight: 0.9,
    });
    expect(inspiration?.kind).toBe('brand_example');
    expect(inspiration?.source).toBe('Pricing page · Inspiration');
    expect(research?.kind).toBe('audience_signal');
  });
});
