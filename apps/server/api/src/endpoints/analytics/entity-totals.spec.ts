import { sumEntityTotals } from '@api/endpoints/analytics/entity-totals';

const stats = (totalViews: number, totalEngagement: number) => ({
  avgEngagementRate: 0,
  totalEngagement,
  totalPosts: 0,
  totalViews,
});

const ratio = (current: number, previous: number) => current / previous;

describe('sumEntityTotals', () => {
  it('sums views, engagement and posts across every entity', () => {
    const totals = sumEntityTotals(
      {
        current: new Map([
          ['a', stats(100, 10)],
          ['b', stats(500, 50)],
        ]),
        previousEngagement: new Map([
          ['a', 20],
          ['b', 10],
        ]),
        publishedPosts: new Map([
          ['a', 2],
          ['b', 4],
        ]),
      },
      ratio,
    );

    expect(totals).toEqual({
      growth: 2,
      totalEngagement: 60,
      totalPosts: 6,
      totalViews: 600,
    });
  });

  it('returns zero totals for no entities and lets the caller decide growth', () => {
    const totals = sumEntityTotals(
      {
        current: new Map(),
        previousEngagement: new Map(),
        publishedPosts: new Map(),
      },
      () => 0,
    );

    expect(totals).toEqual({
      growth: 0,
      totalEngagement: 0,
      totalPosts: 0,
      totalViews: 0,
    });
  });
});
