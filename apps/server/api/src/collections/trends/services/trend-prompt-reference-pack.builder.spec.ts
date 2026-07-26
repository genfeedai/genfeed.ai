import type { TrendSourceReferenceRecord } from '@api/collections/trends/interfaces/trend.interfaces';
import { TrendPromptReferencePackBuilder } from '@api/collections/trends/services/trend-prompt-reference-pack.builder';

describe('TrendPromptReferencePackBuilder', () => {
  const reference: TrendSourceReferenceRecord = {
    canonicalUrl: 'https://example.com/reference',
    contentType: 'video',
    currentEngagementTotal: 1200,
    firstSeenAt: '2026-06-01T00:00:00.000Z',
    id: 'reference_1',
    lastSeenAt: '2026-06-12T00:00:00.000Z',
    latestTrendMentions: 300,
    latestTrendViralityScore: 91,
    matchedTrendTopics: ['ai tools'],
    platform: 'tiktok',
    remixCount: 0,
    sourceClassification: {
      capturedAt: '2026-06-01T00:00:00.000Z',
      confidence: 'medium',
      freshnessWindowDays: 2,
      intendedUse: 'organic_trend_discovery',
      sourceKind: 'public_platform_reference',
      sourceLabel: 'TikTok',
      sourceTopic: 'ai tools',
    },
    sourcePreviewState: 'live',
    title: 'AI tools clip',
  };

  const builder = new TrendPromptReferencePackBuilder();

  it('keeps cache keys and projections deterministic for fixed inputs', () => {
    const input = {
      contentIntent: 'organic_trend_discovery' as const,
      generatedAt: new Date('2026-06-13T00:00:00.000Z'),
      references: [reference],
      targetPlatform: 'tiktok',
      types: ['hooks', 'references'] as const,
    };

    const first = builder.build({ ...input, types: [...input.types] });
    const second = builder.build({ ...input, types: [...input.types] });

    expect(second).toEqual(first);
    expect(first).toEqual([
      expect.objectContaining({
        freshness: expect.objectContaining({
          regenerateAfter: '2026-06-14T00:00:00.000Z',
          status: 'fresh',
        }),
        id: expect.stringMatching(/^prompt-pack:hooks:tiktok:/),
        regeneration: expect.objectContaining({
          trigger: 'cache_key_changed',
        }),
        sourceReferenceIds: ['reference_1'],
        type: 'hooks',
      }),
      expect.objectContaining({
        id: expect.stringMatching(/^prompt-pack:references:tiktok:/),
        sourceReferenceIds: ['reference_1'],
        type: 'references',
      }),
    ]);
  });

  it('derives stale and expired status from the supplied clock', () => {
    const stale = builder.build({
      contentIntent: 'organic_trend_discovery',
      generatedAt: new Date('2026-06-15T00:00:00.000Z'),
      references: [reference],
      targetPlatform: 'tiktok',
      types: ['constraints'],
    });
    const expired = builder.build({
      contentIntent: 'organic_trend_discovery',
      generatedAt: new Date('2026-06-17T00:00:00.000Z'),
      references: [reference],
      targetPlatform: 'tiktok',
      types: ['constraints'],
    });

    expect(stale[0]?.freshness).toMatchObject({
      expiredSourceIds: [],
      staleSourceIds: ['reference_1'],
      status: 'stale',
    });
    expect(stale[0]?.regeneration.trigger).toBe('source_stale');
    expect(expired[0]?.freshness).toMatchObject({
      expiredSourceIds: ['reference_1'],
      staleSourceIds: [],
      status: 'expired',
    });
    expect(expired[0]?.regeneration.trigger).toBe('source_expired');
  });
});
