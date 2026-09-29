import {
  buildPaidCreativeReferenceClassification,
  normalizeTrendSourceClassification,
} from '@api/collections/trends/utils/trend-source-classification.util';

describe('trend source classification utils', () => {
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
});
