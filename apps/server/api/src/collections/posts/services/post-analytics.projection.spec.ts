import { PostAnalyticsProjection } from '@api/collections/posts/services/post-analytics.projection';
import { AnalyticsMetric } from '@genfeedai/contracts';

const projection = new PostAnalyticsProjection();

describe('PostAnalyticsProjection', () => {
  it('preserves the distinct zero-baseline growth contracts', () => {
    const currentAggregate = {
      _avg: { engagementRate: 12.5 },
      _sum: {
        totalComments: 5,
        totalLikes: 10,
        totalSaves: 7,
        totalShares: 3,
        totalViews: 100,
      },
    };
    const previousAggregate = {
      _sum: {
        totalComments: 0,
        totalLikes: 0,
        totalShares: 0,
        totalViews: 0,
      },
    };

    expect(
      projection.buildOverview({
        activePlatforms: ['instagram'],
        currentAggregate,
        previousAggregate,
        totalBrands: 2,
        totalPosts: 4,
      }),
    ).toMatchObject({
      engagementGrowth: 0,
      totalEngagement: 25,
      totalSaves: 7,
      viewsGrowth: 0,
    });
    expect(
      projection.buildPlatformOverview({
        currentAggregate,
        platform: 'instagram',
        previousAggregate,
        totalBrands: 2,
        totalPosts: 4,
      }),
    ).toMatchObject({
      engagementGrowth: 100,
      totalEngagement: 25,
      totalSaves: 7,
      viewsGrowth: 100,
    });
  });

  it('groups time-series rows with saves counted in total engagement', () => {
    const points = projection.buildTimeSeries(
      [
        {
          _avg: { engagementRate: 10 },
          _sum: {
            totalComments: 2,
            totalLikes: 4,
            totalSaves: 8,
            totalShares: 1,
            totalViews: 20,
          },
          date: new Date('2026-04-01T00:00:00.000Z'),
        },
        {
          _avg: { engagementRate: 20 },
          _sum: {
            totalComments: 3,
            totalLikes: 6,
            totalSaves: 9,
            totalShares: 2,
            totalViews: 30,
          },
          date: new Date('2026-04-01T12:00:00.000Z'),
        },
      ],
      'day',
    );

    expect(points).toEqual([
      {
        comments: 5,
        date: '2026-04-01',
        engagementRate: 15,
        likes: 10,
        saves: 17,
        shares: 3,
        // likes 10 + comments 5 + shares 3 + saves 17 (genfeedai/genfeed.ai#5449).
        totalEngagement: 35,
        views: 50,
      },
    ]);
  });

  it('scaffolds missing platform dates with zero metrics', () => {
    const points = projection.buildTimeSeriesWithPlatforms(
      [
        {
          _avg: { engagementRate: 6 },
          _sum: {
            totalComments: 1,
            totalLikes: 2,
            totalSaves: 4,
            totalShares: 3,
            totalViews: 10,
          },
          date: new Date('2026-04-01T00:00:00.000Z'),
          platform: 'instagram',
        },
      ],
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-04-02T00:00:00.000Z'),
      'day',
    );

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      date: '2026-04-01',
      instagram: {
        comments: 1,
        engagementRate: 6,
        likes: 2,
        saves: 4,
        shares: 3,
        views: 10,
      },
    });
    expect(points[0]?.twitter).toEqual({
      comments: 0,
      engagementRate: 0,
      likes: 0,
      saves: 0,
      shares: 0,
      views: 0,
    });
    expect(points[1]?.instagram).toEqual(points[0]?.twitter);
  });

  it('buckets week scaffolding on UTC boundaries', () => {
    const points = projection.buildTimeSeriesWithPlatforms(
      [
        {
          _avg: { engagementRate: 4 },
          _sum: {
            totalComments: 1,
            totalLikes: 1,
            totalSaves: 1,
            totalShares: 1,
            totalViews: 5,
          },
          date: new Date('2026-01-01T00:00:00.000Z'),
          platform: 'tiktok',
        },
      ],
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-08T23:59:59.999Z'),
      'week',
    );

    expect(points.map((point) => point.date)).toEqual(['2026-01', '2026-02']);
    expect(points[0]?.tiktok).toMatchObject({ views: 5 });
    expect(points[1]?.tiktok).toEqual({
      comments: 0,
      engagementRate: 0,
      likes: 0,
      saves: 0,
      shares: 0,
      views: 0,
    });
  });

  it('keeps every week key when the range crosses a year boundary', () => {
    const points = projection.buildTimeSeriesWithPlatforms(
      [
        {
          _avg: { engagementRate: 4 },
          _sum: {
            totalComments: 1,
            totalLikes: 1,
            totalSaves: 1,
            totalShares: 1,
            totalViews: 7,
          },
          date: new Date('2026-01-01T00:00:00.000Z'),
          platform: 'tiktok',
        },
      ],
      new Date('2025-12-31T00:00:00.000Z'),
      new Date('2026-01-10T23:59:59.999Z'),
      'week',
    );

    const dates = points.map((point) => point.date);
    expect(dates).toEqual(['2025-53', '2026-01', '2026-02']);
    expect(
      points.find((point) => point.date === '2026-01')?.tiktok,
    ).toMatchObject({ views: 7 });
  });

  it('preserves ranking metrics and post response projection', () => {
    const analyticsRows = [
      {
        avg_engagement_rate: 5,
        max_comments: 2,
        max_likes: 3,
        max_saves: 4,
        max_shares: 1,
        max_views: 100,
        platform: 'INSTAGRAM',
        post_id: 'post_views',
      },
      {
        avg_engagement_rate: 15,
        max_comments: 20,
        max_likes: 30,
        max_saves: 5,
        max_shares: 10,
        max_views: 50,
        platform: 'TIKTOK',
        post_id: 'post_engagement',
      },
    ];

    const scored = projection.scoreTopContent(
      analyticsRows,
      AnalyticsMetric.ENGAGEMENT,
      1,
    );
    const publishedAt = new Date('2026-04-03T10:00:00.000Z');

    expect(scored[0]?.postId).toBe('post_engagement');
    expect(
      projection.buildTopContent(scored, [
        {
          description: 'Launch',
          id: 'post_engagement',
          label: 'Launch post',
          publicationDate: publishedAt,
          url: 'https://example.com/post',
        },
      ]),
    ).toEqual([
      {
        comments: 20,
        description: 'Launch',
        engagementRate: 15,
        ingredientId: '',
        likes: 30,
        platform: 'tiktok',
        postId: 'post_engagement',
        publishDate: publishedAt,
        saves: 5,
        shares: 10,
        title: 'Launch post',
        totalEngagement: 65,
        url: 'https://example.com/post',
        views: 50,
      },
    ]);
  });

  // genfeedai/genfeed.ai#5449: saves count toward top-content engagement, so
  // a save-heavy post outranks a like-heavy one and reports the same total.
  it('ranks top content by engagement including saves', () => {
    const rows = [
      {
        avg_engagement_rate: 1,
        max_comments: 5,
        max_likes: 50,
        max_saves: 0,
        max_shares: 5,
        max_views: 500,
        platform: 'INSTAGRAM',
        post_id: 'post_likes',
      },
      {
        avg_engagement_rate: 2,
        max_comments: 0,
        max_likes: 10,
        max_saves: 90,
        max_shares: 0,
        max_views: 100,
        platform: 'INSTAGRAM',
        post_id: 'post_saves',
      },
    ];

    const byEngagement = projection.scoreTopContent(
      rows,
      AnalyticsMetric.ENGAGEMENT,
      2,
    );
    expect(byEngagement.map((item) => item.postId)).toEqual([
      'post_saves',
      'post_likes',
    ]);
    expect(byEngagement.map((item) => item.totalEngagement)).toEqual([100, 60]);
    expect(byEngagement[0]?.saves).toBe(90);

    const byViews = projection.scoreTopContent(rows, AnalyticsMetric.VIEWS, 2);
    expect(byViews.map((item) => item.postId)).toEqual([
      'post_likes',
      'post_saves',
    ]);
  });

  it('keeps growth thresholds, best-day selection, and breakdown definitions', () => {
    const currentAggregate = {
      _sum: {
        totalComments: 10,
        totalLikes: 20,
        totalSaves: 40,
        totalShares: 30,
        totalViews: 106,
      },
    };
    const previousAggregate = {
      _sum: {
        totalComments: 5,
        totalLikes: 10,
        totalShares: 15,
        totalViews: 100,
      },
    };

    expect(
      projection.buildGrowthTrends(currentAggregate, previousAggregate, [
        {
          _sum: { totalViews: 80 },
          date: new Date('2026-04-05T00:00:00.000Z'),
        },
      ]),
    ).toEqual({
      bestDay: { date: '2026-04-05', views: 80 },
      // Engagement includes saves (genfeedai/genfeed.ai#5427).
      engagement: {
        current: 100,
        growth: 70,
        growthPercentage: (70 / 30) * 100,
        previous: 30,
      },
      trendingDirection: 'up',
      views: {
        current: 106,
        growth: 6,
        growthPercentage: 6,
        previous: 100,
      },
    });
    expect(projection.buildEngagementBreakdown(currentAggregate)).toEqual({
      comments: 10,
      commentsPercentage: 10,
      likes: 20,
      likesPercentage: 20,
      saves: 40,
      savesPercentage: 40,
      shares: 30,
      sharesPercentage: 30,
      total: 100,
    });
  });

  // genfeedai/genfeed.ai#5419: the organization endpoint shares the
  // `IPlatformComparison` contract with `GET /analytics/platforms`.
  it('projects organization platform rows onto IPlatformComparison', () => {
    expect(
      projection.buildPlatformComparison([
        {
          comments: BigInt(2),
          engagement_rate: 4,
          likes: BigInt(10),
          platform: 'INSTAGRAM',
          post_count: BigInt(4),
          saves: BigInt(1),
          shares: BigInt(3),
          views: BigInt(400),
        },
      ]),
    ).toEqual([
      {
        avgViewsPerPost: 100,
        comments: 2,
        engagementRate: 4,
        likes: 10,
        platform: 'instagram',
        postCount: 4,
        saves: 1,
        shares: 3,
        totalEngagement: 16,
        views: 400,
      },
    ]);
  });
});
