import { describe, expect, it } from 'vitest';
import {
  normalizePlatformComparison,
  normalizeTimeSeries,
  normalizeTopPosts,
} from './use-workspace-dashboard-data';

describe('workspace dashboard live-data normalization', () => {
  it('maps IPlatformComparison rows onto the dashboard chart keys', () => {
    const row = {
      avgViewsPerPost: 20,
      comments: 2,
      engagementRate: 20,
      likes: 5,
      platform: 'instagram',
      postCount: 2,
      saves: 0,
      shares: 1,
      totalEngagement: 8,
      views: 40,
    };

    expect(normalizePlatformComparison([row])).toEqual([
      { ...row, engagement: 8, posts: 2 },
    ]);
  });

  it('aggregates brand-scoped platform time series into chart-ready live rows', () => {
    expect(
      normalizeTimeSeries([
        {
          date: '2026-08-08',
          instagram: {
            comments: 2,
            engagementRate: 10,
            likes: 5,
            saves: 1,
            shares: 2,
            views: 50,
          },
          tiktok: {
            comments: 1,
            engagementRate: 5,
            likes: 2,
            saves: 0,
            shares: 0,
            views: 50,
          },
        },
      ]),
    ).toEqual([
      {
        date: '2026-08-08',
        engagementRate: 13,
        instagram: 50,
        tiktok: 50,
        totalEngagement: 13,
        views: 100,
      },
    ]);
  });

  it('maps the analytics top-post response to the persisted layout contract', () => {
    expect(
      normalizeTopPosts([
        {
          description: 'Fallback title',
          engagementRate: 12,
          platform: 'instagram',
          postId: 'post-1',
          thumbnailUrl: 'https://cdn.example.com/post-1.jpg',
          totalComments: 2,
          totalEngagement: 20,
          totalLikes: 15,
          totalSaves: 1,
          totalShares: 2,
          totalViews: 100,
        },
      ]),
    ).toEqual([
      {
        engagement: 20,
        id: 'post-1',
        platform: 'instagram',
        thumbnail: 'https://cdn.example.com/post-1.jpg',
        title: 'Fallback title',
        views: 100,
      },
    ]);
  });
});
