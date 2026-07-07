import {
  buildPublicPlatformReferenceClassification,
  normalizeTrendSourceClassification,
} from '@api/collections/trends/utils/trend-source-classification.util';

describe('trend source classification utils', () => {
  it('builds the normalized public platform source contract', () => {
    expect(
      buildPublicPlatformReferenceClassification({
        capturedAt: new Date('2026-06-09T00:00:00.000Z'),
        confidence: 'low',
        platform: 'linkedin',
        sourceAuthor: 'openai',
        sourceLabel: 'LinkedIn',
        sourceTimestamp: '2026-06-08T12:30:00.000Z',
        sourceTopic: '#openai',
      }),
    ).toEqual({
      capturedAt: '2026-06-09T00:00:00.000Z',
      confidence: 'low',
      freshnessWindowDays: 7,
      intendedUse: 'organic_trend_discovery',
      platform: 'linkedin',
      sourceAuthor: 'openai',
      sourceKind: 'public_platform_reference',
      sourceLabel: 'LinkedIn',
      sourceTimestamp: '2026-06-08T12:30:00.000Z',
      sourceTopic: '#openai',
    });
  });

  it('preserves paid creative metadata while defaulting freshness by source kind', () => {
    expect(
      normalizeTrendSourceClassification({
        value: {
          capturedAt: '2026-06-09T00:00:00.000Z',
          confidence: 'high',
          intendedUse: 'paid_creative_analysis',
          paidCreative: {
            collectedAt: '2026-06-09T00:00:00.000Z',
            creativeType: 'video',
            provider: 'meta_ads_library',
          },
          sourceKind: 'paid_creative_reference',
          sourceLabel: 'Meta Ads Library',
          sourceTopic: 'paid creative',
        },
      }),
    ).toMatchObject({
      confidence: 'high',
      freshnessWindowDays: 14,
      intendedUse: 'paid_creative_analysis',
      paidCreative: {
        creativeType: 'video',
        provider: 'meta_ads_library',
      },
      sourceKind: 'paid_creative_reference',
    });
  });

  it('rejects records without a recognized kind and intended use', () => {
    expect(
      normalizeTrendSourceClassification({
        value: {
          capturedAt: '2026-06-09T00:00:00.000Z',
          sourceKind: 'linkedin_curated_topic',
        },
      }),
    ).toBeUndefined();
  });
});
