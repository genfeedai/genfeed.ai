import { AnalyticsResponseProjection } from '@api/endpoints/analytics/analytics-response.projection';
import { AnalyticsMetric, CredentialPlatform } from '@genfeedai/contracts';
import type { IPlatformComparison } from '@genfeedai/contracts/interfaces';
import { AnalyticsPlatformSerializer } from '@genfeedai/serializers';

const projection = new AnalyticsResponseProjection();

describe('AnalyticsResponseProjection', () => {
  // Rows carry the Prisma label (`YOUTUBE`); responses carry the domain id
  // (genfeedai/genfeed.ai#5424).
  it('scaffolds the fixed platform response across the complete UTC range', () => {
    const result = projection.buildTimeSeries(
      [
        {
          comments: BigInt(2),
          day: '2025-01-01',
          engagement_rate: null,
          likes: BigInt(4),
          platform: 'YOUTUBE',
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

  // genfeedai/genfeed.ai#5419: the projection, the serializer and the client
  // share `IPlatformComparison`; every metric must survive serialization.
  it('projects IPlatformComparison rows that the platform serializer keeps whole', () => {
    const rows = projection.buildPlatformComparison([
      {
        avg_engagement_rate: 10,
        platform: 'YOUTUBE',
        total_comments: BigInt(20),
        total_engagement: BigInt(75),
        total_likes: BigInt(40),
        total_posts: BigInt(3),
        total_saves: BigInt(5),
        total_shares: BigInt(10),
        total_views: BigInt(300),
      },
      {
        avg_engagement_rate: null,
        platform: 'TIKTOK',
        total_comments: null,
        total_engagement: null,
        total_likes: null,
        total_posts: BigInt(0),
        total_saves: null,
        total_shares: null,
        total_views: null,
      },
    ]);

    const expected: IPlatformComparison[] = [
      {
        avgViewsPerPost: 100,
        comments: 20,
        engagementRate: 10,
        likes: 40,
        platform: CredentialPlatform.YOUTUBE,
        postCount: 3,
        saves: 5,
        shares: 10,
        totalEngagement: 75,
        views: 300,
      },
      {
        avgViewsPerPost: 0,
        comments: 0,
        engagementRate: 0,
        likes: 0,
        platform: CredentialPlatform.TIKTOK,
        postCount: 0,
        saves: 0,
        shares: 0,
        totalEngagement: 0,
        views: 0,
      },
    ];
    expect(rows).toEqual(expected);

    const document = AnalyticsPlatformSerializer.serialize(rows) as {
      data: Array<{ attributes: Record<string, unknown> }>;
    };
    expect(document.data.map((resource) => resource.attributes)).toEqual(
      expected,
    );
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
          platforms: ['TIKTOK'],
          title: 'First',
          total_engagement: BigInt(100),
          total_views: BigInt(1_000),
        },
        {
          description: ' stop scrolling ',
          id: 'post_2',
          platforms: ['YOUTUBE'],
          title: 'Second',
          total_engagement: BigInt(200),
          total_views: BigInt(3_000),
        },
      ],
      [
        {
          platform: 'TIKTOK',
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
    expect(result.videos.map((video) => video.platforms)).toEqual([
      [CredentialPlatform.TIKTOK],
      [CredentialPlatform.YOUTUBE],
    ]);
  });
});
