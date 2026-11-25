import { withPublicPostMetricsApplied } from '@api/endpoints/public/utils/public-post-metrics.util';
import { describe, expect, it } from 'vitest';

const metrics = {
  avgEngagementRate: 0.04,
  totalComments: 3,
  totalLikes: 12,
  totalSaves: 1,
  totalShares: 2,
  totalViews: 900,
};

describe('withPublicPostMetricsApplied', () => {
  it('drops every metric of a post whose brand turned Public analytics off', () => {
    expect(
      withPublicPostMetricsApplied({
        ...metrics,
        brand: { isPublicAnalyticsEnabled: false, label: 'Studio' },
        description: 'Shipped today',
      }),
    ).toEqual({
      brand: { isPublicAnalyticsEnabled: false, label: 'Studio' },
      description: 'Shipped today',
    });
  });

  it.each([
    ['on', { isPublicAnalyticsEnabled: true }],
    ['never chosen', {}],
    ['not loaded', undefined],
  ])('keeps the metrics when the setting is %s', (_name, brand) => {
    const post = { ...metrics, brand, description: 'Shipped today' };
    expect(withPublicPostMetricsApplied(post)).toEqual(post);
  });
});
