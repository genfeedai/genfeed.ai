import { TwitterResponseMapper } from '@api/services/integrations/twitter/services/twitter-response.mapper';

describe('X post-specific breakout evidence', () => {
  const mapper = new TwitterResponseMapper();
  it('preserves observed organic zero even when public impressions are large', () => {
    const result = mapper.mapAnalytics({
      data: [
        {
          organic_metrics: { impression_count: 0 },
          public_metrics: { impression_count: 100_000 },
        },
      ],
    });
    expect(result.breakoutExposures?.impressions).toEqual({
      availability: 'observed',
      value: 0,
      scope: 'organic',
      source: 'twitter:post:organic_metrics.impression_count',
    });
    expect(result.learningMetrics?.metrics.impressions?.value).toBe(0);
  });
  it('does not describe aggregate public or non-public counts as organic', () => {
    for (const group of ['public_metrics', 'non_public_metrics'] as const) {
      const result = mapper.mapAnalytics({
        data: [{ [group]: { impression_count: 1000 } }],
      });
      expect(result.breakoutExposures?.impressions).toEqual({
        availability: 'observed',
        value: 1000,
        scope: 'aggregate',
        source: `twitter:post:${group}.impression_count`,
      });
    }
  });
  it('keeps missing exposure distinct from the existing display zero', () => {
    const result = mapper.mapAnalytics({});
    expect(result.views).toBe(0);
    expect(result.breakoutExposures?.impressions).toMatchObject({
      availability: 'unavailable',
      value: null,
      scope: 'unknown',
    });
  });
  it('does not turn views shared across posts using one video into a post-specific signal', () => {
    const result = mapper.mapAnalytics({
      data: [{ organic_metrics: { impression_count: 1000 } }],
      includes: {
        media: [{ type: 'video', public_metrics: { view_count: 50_000 } }],
      },
    });
    expect(result.views).toBe(50_000);
    expect(result.learningMetrics?.metrics.views?.value).toBe(50_000);
    expect(result.breakoutExposures?.views).toMatchObject({
      availability: 'unavailable',
      value: null,
    });
    expect(result.breakoutExposures?.impressions).toMatchObject({
      value: 1000,
      scope: 'organic',
    });
  });
  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    'holds invalid organic count %s without falling back to public exposure',
    (value) => {
      const result = mapper.mapAnalytics({
        data: [
          {
            organic_metrics: { impression_count: value },
            public_metrics: { impression_count: 1000 },
          },
        ],
      });
      expect(result.breakoutExposures?.impressions).toMatchObject({
        availability: 'unavailable',
        value: null,
        scope: 'organic',
      });
    },
  );
});
