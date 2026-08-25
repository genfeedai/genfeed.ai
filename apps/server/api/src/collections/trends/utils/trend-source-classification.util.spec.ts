import {
  buildPaidCreativeReferenceClassification,
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

  it('builds the paid creative reference contract from an archive snapshot (#3537)', () => {
    expect(
      buildPaidCreativeReferenceClassification({
        adFormat: 'VIDEO',
        capturedAt: new Date('2026-08-25T00:00:00.000Z'),
        creativeType: 'video',
        platform: 'meta',
        provider: 'meta_ads_library',
        sourceAuthor: 'nike',
        sourceTimestamp: '2026-08-20T12:00:00.000Z',
        sourceTopic: 'winter running',
      }),
    ).toEqual({
      capturedAt: '2026-08-25T00:00:00.000Z',
      // Archives publish what is running, not who performed: a snapshot is a
      // confident observation of the creative and nothing more.
      confidence: 'high',
      freshnessWindowDays: 14,
      intendedUse: 'paid_creative_analysis',
      paidCreative: {
        adFormat: 'VIDEO',
        collectedAt: '2026-08-25T00:00:00.000Z',
        creativeType: 'video',
        provider: 'meta_ads_library',
      },
      platform: 'meta',
      sourceAuthor: 'nike',
      sourceKind: 'paid_creative_reference',
      sourceLabel: 'Meta Ad Library',
      sourceTimestamp: '2026-08-20T12:00:00.000Z',
      sourceTopic: 'winter running',
    });
  });

  it('labels every watched archive from the shared paid-creative contract (#3537)', () => {
    expect(
      buildPaidCreativeReferenceClassification({
        capturedAt: '2026-08-25T00:00:00.000Z',
        platform: 'youtube',
        // YouTube video ads are Google Ads creatives, so the archive — and
        // therefore the label — is the Google Transparency Center.
        provider: 'google_ads_transparency_center',
        sourceTopic: 'gymwear',
      }).sourceLabel,
    ).toBe('Google Ads Transparency Center');
    expect(
      buildPaidCreativeReferenceClassification({
        capturedAt: '2026-08-25T00:00:00.000Z',
        platform: 'tiktok',
        provider: 'tiktok_creative_center',
        sourceTopic: 'gymwear',
      }).sourceLabel,
    ).toBe('TikTok Creative Center');
  });

  it('drops paid creative metadata attributed to an archive we do not ingest (#3537)', () => {
    const normalized = normalizeTrendSourceClassification({
      value: {
        capturedAt: '2026-08-25T00:00:00.000Z',
        intendedUse: 'paid_creative_analysis',
        paidCreative: {
          collectedAt: '2026-08-25T00:00:00.000Z',
          provider: 'youtube_ads_library',
        },
        sourceKind: 'paid_creative_reference',
      },
    });

    expect(normalized).toBeDefined();
    expect(normalized?.paidCreative).toBeUndefined();
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
