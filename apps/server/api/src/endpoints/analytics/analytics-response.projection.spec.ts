import { AnalyticsResponseProjection } from '@api/endpoints/analytics/analytics-response.projection';
import { AnalyticsMetric, CredentialPlatform } from '@genfeedai/contracts';

const projection = new AnalyticsResponseProjection();

describe('AnalyticsResponseProjection', () => {
  it('scaffolds the fixed platform response across the complete UTC range', () => {
    const result = projection.buildTimeSeries(
      [
        {
          comments: BigInt(2),
          day: '2025-01-01',
          engagement_rate: null,
          likes: BigInt(4),
          platform: CredentialPlatform.YOUTUBE,
          saves: BigInt(1),
          shares: BigInt(3),
          views: BigInt(100),
        },
      ],
      new Date('2025-01-01T00:00:00.000Z'),
      new Date('2025-01-02T23:59:59.999Z'),
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      date: '2025-01-01',
      youtube: {
        comments: 2,
        engagementRate: 0,
        likes: 4,
        saves: 1,
        shares: 3,
        views: 100,
      },
    });
    expect(result[0]?.instagram).toEqual({
      comments: 0,
      engagementRate: 0,
      likes: 0,
      saves: 0,
      shares: 0,
      views: 0,
    });
    expect(result[1]?.youtube).toEqual(result[0]?.instagram);
  });

  it('preserves overview metric and zero-baseline growth definitions', () => {
    expect(
      projection.buildOverview(
        {
          avg_engagement_rate: 5.5,
          total_comments: BigInt(20),
          total_likes: BigInt(50),
          total_posts: BigInt(10),
          total_saves: BigInt(5),
          total_shares: BigInt(10),
          total_views: BigInt(1_000),
        },
        {
          total_engagement: BigInt(0),
          total_posts: BigInt(0),
          total_views: BigInt(0),
        },
      ),
    ).toEqual({
      avgEngagementRate: 5.5,
      growth: {
        engagement: 0,
        posts: 0,
        views: 0,
      },
      totalEngagement: 85,
      totalPosts: 10,
      totalViews: 1_000,
    });
  });

  it('projects platform shares and save-inclusive engagement breakdowns', () => {
    expect(
      projection.buildPlatformComparison([
        {
          avg_engagement_rate: 10,
          platform: CredentialPlatform.YOUTUBE,
          total_engagement: BigInt(75),
          total_posts: BigInt(3),
          total_views: BigInt(300),
        },
        {
          avg_engagement_rate: 5,
          platform: CredentialPlatform.TIKTOK,
          total_engagement: BigInt(25),
          total_posts: BigInt(1),
          total_views: BigInt(100),
        },
      ]),
    ).toEqual([
      {
        avgEngagementRate: 10,
        engagementPercentage: 75,
        platform: CredentialPlatform.YOUTUBE,
        postsPercentage: 75,
        totalEngagement: 75,
        totalPosts: 3,
        totalViews: 300,
        viewsPercentage: 75,
      },
      {
        avgEngagementRate: 5,
        engagementPercentage: 25,
        platform: CredentialPlatform.TIKTOK,
        postsPercentage: 25,
        totalEngagement: 25,
        totalPosts: 1,
        totalViews: 100,
        viewsPercentage: 25,
      },
    ]);
    expect(
      projection.buildEngagementBreakdown({
        total_comments: 20,
        total_likes: 50,
        total_saves: 10,
        total_shares: 20,
      }),
    ).toEqual({
      comments: 20,
      likes: 50,
      percentages: {
        comments: 20,
        likes: 50,
        saves: 10,
        shares: 20,
      },
      saves: 10,
      shares: 20,
      total: 100,
    });
  });

  it('preserves per-day growth metric selection and trend labels', () => {
    const current = [
      {
        day: '2025-01-01',
        engagement: BigInt(150),
        posts: BigInt(5),
        views: BigInt(80),
      },
    ];
    const previous = {
      total_comments: BigInt(10),
      total_likes: BigInt(50),
      total_posts: BigInt(10),
      total_saves: BigInt(20),
      total_shares: BigInt(20),
      total_views: BigInt(100),
    };

    expect(
      projection.buildGrowthTrends(
        current,
        previous,
        AnalyticsMetric.ENGAGEMENT,
      ),
    ).toEqual([
      {
        date: '2025-01-01',
        growth: 50,
        trend: 'up',
        value: 150,
      },
    ]);
    expect(
      projection.buildGrowthTrends(current, previous, AnalyticsMetric.POSTS),
    ).toEqual([
      {
        date: '2025-01-01',
        growth: -50,
        trend: 'down',
        value: 5,
      },
    ]);
  });

  it('normalizes hooks, ranks effectiveness, and maps platform totals', () => {
    const result = projection.buildViralHooks(
      [
        {
          description: 'Stop scrolling\nThe rest of the post',
          id: 'post_1',
          platforms: [CredentialPlatform.TIKTOK],
          title: 'First',
          total_engagement: BigInt(100),
          total_views: BigInt(1_000),
        },
        {
          description: ' stop scrolling ',
          id: 'post_2',
          platforms: [CredentialPlatform.YOUTUBE],
          title: 'Second',
          total_engagement: BigInt(200),
          total_views: BigInt(3_000),
        },
      ],
      [
        {
          platform: CredentialPlatform.TIKTOK,
          post_count: BigInt(2),
          total_engagement: BigInt(300),
          total_views: BigInt(4_000),
        },
      ],
    );

    expect(result.analysis).toEqual({
      hookEffectiveness: [
        {
          avgEngagement: 150,
          avgViews: 2_000,
          hook: 'stop scrolling',
          postCount: 2,
        },
      ],
      topHooks: [
        {
          avgEngagement: 150,
          hook: 'stop scrolling',
          postCount: 2,
        },
      ],
      topPlatforms: [
        {
          platform: CredentialPlatform.TIKTOK,
          postCount: 2,
          totalEngagement: 300,
          totalViews: 4_000,
        },
      ],
      totalVideos: 2,
    });
    expect(result.videos[0]?.hook).toBe('Stop scrolling');
  });
});
