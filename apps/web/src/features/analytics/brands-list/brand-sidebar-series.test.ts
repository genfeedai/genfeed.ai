import { describe, expect, it } from 'vitest';
import {
  toEngagementSeries,
  toPlatformShares,
} from '@/features/analytics/brands-list/brand-sidebar-series';

const rows = [
  {
    date: '2026-11-01',
    instagram: { comments: 2, likes: 10, saves: 1, shares: 2, views: 900 },
    tiktok: { comments: 0, likes: 5, saves: 0, shares: 0, views: 100 },
  },
  {
    date: '2026-11-02',
    instagram: { comments: 0, likes: 0, saves: 0, shares: 0, views: 0 },
    tiktok: { comments: 1, likes: 19, saves: 0, shares: 0, views: 300 },
  },
];

describe('toEngagementSeries', () => {
  it('sums likes, comments, shares and saves of every platform per day', () => {
    expect(toEngagementSeries(rows)).toEqual([20, 20]);
  });

  it('reads a bare number as the platform total and ignores junk', () => {
    expect(
      toEngagementSeries([
        { date: '2026-11-01', instagram: 7, tiktok: 'n/a' },
        null,
      ]),
    ).toEqual([7, 0]);
  });
});

describe('toPlatformShares', () => {
  it('ranks platforms by engagement over the range with their share', () => {
    expect(toPlatformShares(rows)).toEqual([
      { engagement: 25, platform: 'tiktok', share: 62.5 },
      { engagement: 15, platform: 'instagram', share: 37.5 },
    ]);
  });

  it('drops platforms without engagement', () => {
    expect(
      toPlatformShares([
        { date: '2026-11-01', instagram: { likes: 3 }, youtube: { likes: 0 } },
      ]),
    ).toEqual([{ engagement: 3, platform: 'instagram', share: 100 }]);
  });

  it('is empty when nothing was engaged with', () => {
    expect(toPlatformShares([])).toEqual([]);
  });
});
