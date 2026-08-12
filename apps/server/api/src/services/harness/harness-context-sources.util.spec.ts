import { brandMemoryHitsToHarnessSources } from '@api/services/harness/harness-context-sources.util';
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
});
