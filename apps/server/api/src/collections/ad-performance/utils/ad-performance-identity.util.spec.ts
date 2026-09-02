import {
  AD_PERFORMANCE_IDENTITY_KEY_VERSION,
  buildAdPerformanceIdentityKey,
  buildAdPerformanceIdentityKeyFromData,
  readAdPerformanceDate,
  resolveAdPerformanceIdentityFields,
} from './ad-performance-identity.util';

describe('ad-performance identity mapping', () => {
  it('builds a versioned pipe-delimited key from every identity scalar', () => {
    expect(
      buildAdPerformanceIdentityKey({
        adPlatform: 'meta',
        date: new Date('2026-07-01T00:00:00.000Z'),
        externalAccountId: 'acct-1',
        externalAdId: 'ad-1',
        externalAdSetId: 'adset-1',
        externalCampaignId: 'camp-1',
        granularity: 'ad',
      }),
    ).toBe(
      `${AD_PERFORMANCE_IDENTITY_KEY_VERSION}|meta|2026-07-01T00:00:00.000Z|ad|acct-1|camp-1|adset-1|ad-1`,
    );
  });

  it('keeps empty segments so missing ids stay in a stable position', () => {
    expect(
      buildAdPerformanceIdentityKey({
        adPlatform: 'meta',
        date: new Date('2026-07-01T00:00:00.000Z'),
        externalAccountId: 'acct-1',
        externalAdId: null,
        externalAdSetId: null,
        externalCampaignId: null,
        granularity: 'account',
      }),
    ).toBe(
      `${AD_PERFORMANCE_IDENTITY_KEY_VERSION}|meta|2026-07-01T00:00:00.000Z|account|acct-1|||`,
    );
  });

  it('treats equivalent date spellings as the same key', () => {
    const fromIso = buildAdPerformanceIdentityKeyFromData({
      adPlatform: 'meta',
      date: '2026-07-01T00:00:00.000Z',
      externalAccountId: 'acct-1',
      granularity: 'account',
    });
    const fromDate = buildAdPerformanceIdentityKeyFromData({
      adPlatform: 'meta',
      date: new Date('2026-07-01T00:00:00.000Z'),
      externalAccountId: 'acct-1',
      granularity: 'account',
    });
    const fromDay = buildAdPerformanceIdentityKeyFromData({
      adPlatform: 'meta',
      date: '2026-07-01',
      externalAccountId: 'acct-1',
      granularity: 'account',
    });

    expect(fromIso).toBe(fromDate);
    expect(fromDay).toBe(fromIso);
  });

  it('falls back to externalAdGroupId when the ad set id is absent', () => {
    expect(
      resolveAdPerformanceIdentityFields({
        externalAdGroupId: 'group-1',
        granularity: 'adset',
      }),
    ).toMatchObject({
      externalAdSetId: 'group-1',
    });
  });

  it('namespaces repository identities by source, brand, and stable watch key', () => {
    const brandOne = buildAdPerformanceIdentityKeyFromData({
      adPlatform: 'x',
      brandId: 'brand-1',
      externalAccountId: 'advertiser-1',
      externalAdId: 'ad-1',
      granularity: 'ad',
      researchSnapshotKey: 'watch-1',
      researchSource: 'x_ads_repository',
    });
    const brandTwo = buildAdPerformanceIdentityKeyFromData({
      adPlatform: 'x',
      brandId: 'brand-2',
      externalAccountId: 'advertiser-1',
      externalAdId: 'ad-1',
      granularity: 'ad',
      researchSnapshotKey: 'watch-2',
      researchSource: 'x_ads_repository',
    });
    const connected = buildAdPerformanceIdentityKeyFromData({
      adPlatform: 'x',
      externalAccountId: 'advertiser-1',
      externalAdId: 'ad-1',
      granularity: 'ad',
    });

    expect(brandOne).toBe(
      'v1|research|x_ads_repository|brand-1|watch-1|x||ad|advertiser-1|||ad-1',
    );
    expect(brandTwo).not.toBe(brandOne);
    expect(connected).not.toBe(brandOne);
  });

  it('keeps repository identity stable across replacement snapshot ids', () => {
    const base = {
      adPlatform: 'x',
      brandId: 'brand-1',
      externalAdId: 'ad-1',
      granularity: 'ad',
      researchSnapshotKey: 'watch-1',
      researchSource: 'x_ads_repository',
    };

    expect(
      buildAdPerformanceIdentityKeyFromData({
        ...base,
        researchSnapshotId: 'snapshot-old',
      }),
    ).toBe(
      buildAdPerformanceIdentityKeyFromData({
        ...base,
        researchSnapshotId: 'snapshot-new',
      }),
    );
  });

  it('prefers externalAdSetId over the ad-group alias', () => {
    expect(
      resolveAdPerformanceIdentityFields({
        externalAdGroupId: 'group-1',
        externalAdSetId: 'adset-1',
      }).externalAdSetId,
    ).toBe('adset-1');
  });

  it('ignores empty strings and non-string identity values', () => {
    expect(
      resolveAdPerformanceIdentityFields({
        adPlatform: '',
        externalAccountId: 42,
        granularity: 'campaign',
      }),
    ).toEqual({
      adPlatform: null,
      date: null,
      externalAccountId: null,
      externalAdId: null,
      externalAdSetId: null,
      externalCampaignId: null,
      granularity: 'campaign',
    });
  });

  it('parses unix seconds and milliseconds into dates', () => {
    const instant = new Date('2026-07-01T00:00:00.000Z');

    expect(readAdPerformanceDate(instant.getTime())).toEqual(instant);
    expect(readAdPerformanceDate(instant.getTime() / 1000)).toEqual(instant);
  });

  it('rejects unparseable dates', () => {
    expect(readAdPerformanceDate('not-a-date')).toBeNull();
    expect(readAdPerformanceDate(Number.NaN)).toBeNull();
  });
});
