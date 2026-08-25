import {
  normalizeMetaAdLibraryReach,
  normalizeMetaAdLibraryRecord,
} from './meta-ad-library';

describe('meta ad library mappers', () => {
  it('keeps every undisclosed delivery metric absent and marks the creative unscored', () => {
    const record = normalizeMetaAdLibraryRecord({
      adArchiveId: 'archive_1',
      bodyText: 'Shop the new drop',
      creativeMediaUrls: ['https://cdn.example.com/creative.mp4'],
      endDate: '2026-02-01',
      pageId: 'page_1',
      pageName: 'competitor',
      reachEstimateMax: 20000,
      reachEstimateMin: 10000,
      startDate: '2026-01-01',
    });

    expect(record).toMatchObject({
      creativeType: 'video',
      dataConfidence: 0.3,
      date: '2026-01-01',
      estimatedReach: 15000,
      externalAccountId: 'page_1',
      externalAdId: 'archive_1',
      granularity: 'ad',
      performanceScore: null,
      platform: 'meta',
      usagePolicy: 'remix_allowed',
    });
    expect(record.clicks).toBeUndefined();
    expect(record.cpc).toBeUndefined();
    expect(record.cpm).toBeUndefined();
    expect(record.ctr).toBeUndefined();
    expect(record.currency).toBeUndefined();
    expect(record.impressions).toBeUndefined();
    expect(record.spend).toBeUndefined();
  });

  it('marks an inactive archive row halted and leaves an active one unset', () => {
    expect(
      normalizeMetaAdLibraryRecord({
        adArchiveId: 'archive_1',
        isActive: false,
        pageName: 'competitor',
      }),
    ).toMatchObject({ campaignStatus: 'HALTED', isHalted: true });

    expect(
      normalizeMetaAdLibraryRecord({
        adArchiveId: 'archive_1',
        isActive: true,
        pageName: 'competitor',
      }),
    ).toMatchObject({ campaignStatus: undefined, isHalted: false });
  });

  it('falls back to the page name when the archive row omits the page id', () => {
    expect(
      normalizeMetaAdLibraryRecord({
        adArchiveId: 'archive_1',
        pageName: 'competitor',
      }).externalAccountId,
    ).toBe('competitor');
  });

  it('carries the publisher platforms as targeting criteria rather than inventing targeting', () => {
    expect(
      normalizeMetaAdLibraryRecord({
        adArchiveId: 'archive_1',
        pageName: 'competitor',
        publisherPlatforms: ['facebook', 'instagram'],
      }).targetingCriteria,
    ).toEqual(['facebook', 'instagram']);
  });

  describe('normalizeMetaAdLibraryReach', () => {
    it('uses the bucket midpoint and falls back to the only known bound', () => {
      expect(
        normalizeMetaAdLibraryReach({
          reachEstimateMax: 20000,
          reachEstimateMin: 10000,
        }),
      ).toBe(15000);
      expect(normalizeMetaAdLibraryReach({ reachEstimateMin: 10000 })).toBe(
        10000,
      );
      expect(normalizeMetaAdLibraryReach({ reachEstimateMax: 20000 })).toBe(
        20000,
      );
      expect(normalizeMetaAdLibraryReach({})).toBe(0);
    });
  });
});
