import { getTrendEngagementTotal } from './trend-engagement.util';

describe('getTrendEngagementTotal', () => {
  it('returns 0 when metrics are missing', () => {
    expect(getTrendEngagementTotal()).toBe(0);
    expect(getTrendEngagementTotal(undefined)).toBe(0);
  });

  it('treats missing metric fields as zero', () => {
    expect(getTrendEngagementTotal({ likes: 4, views: 20 })).toBe(24);
    expect(
      getTrendEngagementTotal({ comments: 0, likes: 0, shares: 0, views: 0 }),
    ).toBe(0);
  });
});
