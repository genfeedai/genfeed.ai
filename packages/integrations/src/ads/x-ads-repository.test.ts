import {
  normalizeXAdsRepositoryExportRecord,
  normalizeXAdsRepositoryImpressions,
} from './x-ads-repository';

describe('x ads repository mappers', () => {
  it('preserves provider-disclosed creative content without inventing a headline or CTA', () => {
    const record = normalizeXAdsRepositoryExportRecord({
      adId: 'ad_1',
      advertiserHandle: 'nike',
      creativeContent: 'Provider-disclosed creative',
      externalAdvertiserId: 'advertiser_1',
      presentationStartDate: '2025-01-01',
    });

    expect(record.bodyText).toBe('Provider-disclosed creative');
    expect(record.ctaText).toBeUndefined();
    expect(record.headlineText).toBeUndefined();
  });

  it('keeps unavailable performance metrics absent and marks the disclosure unscored', () => {
    expect(
      normalizeXAdsRepositoryExportRecord({
        adId: 'ad_1',
        advertiserHandle: 'nike',
        presentationEndDate: '2025-01-31',
        externalAdvertiserId: 'advertiser_1',
        presentationStartDate: '2025-01-01',
        reachEstimateMax: 20000,
        reachEstimateMin: 10000,
        landingPageUrl: 'https://example.com',
      }),
    ).toMatchObject({
      dataConfidence: 0.3,
      date: '2025-01-01',
      estimatedReach: 15000,
      externalAccountId: 'advertiser_1',
      externalAdId: 'ad_1',
      granularity: 'ad',
      performanceScore: null,
      platform: 'x_ads',
      usagePolicy: 'disclosure_only',
    });

    const record = normalizeXAdsRepositoryExportRecord({ adId: 'ad_1' });
    expect(record.clicks).toBeUndefined();
    expect(record.cpc).toBeUndefined();
    expect(record.cpm).toBeUndefined();
    expect(record.ctr).toBeUndefined();
    expect(record.currency).toBeUndefined();
    expect(record.impressions).toBeUndefined();
    expect(record.spend).toBeUndefined();
  });

  it('preserves documented disclosure metadata without inventing ad metrics', () => {
    expect(
      normalizeXAdsRepositoryExportRecord({
        adId: 'ad_1',
        creativeContent: 'Creative disclosure text',
        creativeMediaUrls: ['https://example.com/creative.jpg'],
        fundingEntity: 'Example funder',
        isHalted: true,
        presentationEndDate: '2025-01-31',
        presentationStartDate: '2025-01-01',
        reachEstimateMax: 20000,
        reachEstimateMin: 10000,
        targetingCountries: ['MT'],
        targetingCriteria: ['interest:sports'],
      }),
    ).toMatchObject({
      creativeContent: 'Creative disclosure text',
      creativeMediaUrls: ['https://example.com/creative.jpg'],
      estimatedReach: 15000,
      fundingEntity: 'Example funder',
      isHalted: true,
      presentationEndDate: '2025-01-31',
      presentationStartDate: '2025-01-01',
      targetingCountries: ['MT'],
      targetingCriteria: ['interest:sports'],
    });
  });

  it('falls back to the advertiser handle when no external advertiser id is known', () => {
    const record = normalizeXAdsRepositoryExportRecord({
      adId: 'ad_2',
      advertiserHandle: 'nike',
      presentationStartDate: '2025-01-01',
    });

    expect(record.externalAccountId).toBe('nike');
  });

  it('defaults date to an empty string when the row has no start date', () => {
    const record = normalizeXAdsRepositoryExportRecord({ adId: 'ad_3' });

    expect(record.date).toBe('');
    expect(record.externalAccountId).toBe('');
  });

  describe('normalizeXAdsRepositoryImpressions', () => {
    it('returns the midpoint of a two-sided range', () => {
      expect(
        normalizeXAdsRepositoryImpressions({
          reachEstimateMax: 20000,
          reachEstimateMin: 10000,
        }),
      ).toBe(15000);
    });

    it('returns the known bound of a one-sided range', () => {
      expect(
        normalizeXAdsRepositoryImpressions({ reachEstimateMin: 5000 }),
      ).toBe(5000);
      expect(
        normalizeXAdsRepositoryImpressions({ reachEstimateMax: 5000 }),
      ).toBe(5000);
    });

    it('returns 0 when no range is known', () => {
      expect(normalizeXAdsRepositoryImpressions({})).toBe(0);
    });
  });
});
