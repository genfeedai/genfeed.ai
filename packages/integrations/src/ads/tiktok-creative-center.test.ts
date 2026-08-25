import { normalizeTikTokCreativeCenterRecord } from './tiktok-creative-center';

describe('tiktok creative center mappers', () => {
  it('treats public video views as reach and never as paid impressions', () => {
    const record = normalizeTikTokCreativeCenterRecord({
      advertiserHandle: 'competitor',
      creativeMediaUrls: ['https://cdn.example.com/creative.mp4'],
      id: 'creative_1',
      startDate: '2026-01-01',
      videoViews: 480000,
    });

    expect(record).toMatchObject({
      creativeType: 'video',
      dataConfidence: 0.4,
      estimatedReach: 480000,
      externalAdId: 'creative_1',
      granularity: 'ad',
      performanceScore: null,
      platform: 'tiktok',
      usagePolicy: 'remix_allowed',
    });
    expect(record.impressions).toBeUndefined();
    expect(record.spend).toBeUndefined();
    expect(record.currency).toBeUndefined();
    expect(record.cpc).toBeUndefined();
    expect(record.cpm).toBeUndefined();
  });

  it('passes a published ctr through without deriving one from views', () => {
    expect(
      normalizeTikTokCreativeCenterRecord({ ctr: 1.8, id: 'creative_1' }).ctr,
    ).toBe(1.8);
    expect(
      normalizeTikTokCreativeCenterRecord({ id: 'creative_1', videoViews: 10 })
        .ctr,
    ).toBeUndefined();
  });

  it('reports zero reach rather than a guess when the row has no view counter', () => {
    expect(
      normalizeTikTokCreativeCenterRecord({ id: 'creative_1' }).estimatedReach,
    ).toBe(0);
  });
});
