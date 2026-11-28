import { AgentTrendsToolHandler } from '@api/services/agent-orchestrator/tools/agent-trends-tool-handler.service';

const HOUR_MS = 3_600_000;

function trendRow(
  id: string,
  platform: string,
  viralityScore: number,
  ageHours: number,
) {
  return {
    createdAt: new Date(Date.now() - ageHours * HOUR_MS),
    id,
    platform,
    topic: `${platform} topic ${id}`,
    updatedAt: new Date(Date.now() - ageHours * HOUR_MS),
    viralityScore,
  };
}

const OUTLIER_ROW = {
  captionExcerpt: 'One-take demo',
  countsReadAt: new Date('2026-11-27T06:00:00.000Z'),
  creator: { handle: 'buildlog' },
  id: 'o1',
  medianViews: 9_800,
  outlierRatio: 6.3,
  outlierTier: 'outlier',
  platform: 'tiktok',
  publishedAt: new Date('2026-11-20T09:00:00.000Z'),
  url: 'https://www.tiktok.com/@buildlog/video/7300000000000000000',
  views: 62_000,
};

function handlerWith(
  rowsByPlatform: Record<string, unknown[]>,
  outliers: unknown[] = [],
) {
  const listOutliers = vi.fn().mockResolvedValue(outliers);
  const getTrends = vi
    .fn()
    .mockImplementation(
      async (_org: string, _brand: unknown, platform: string) =>
        rowsByPlatform[platform] ?? [],
    );
  return new AgentTrendsToolHandler(
    { getTrends } as never,
    {
      listOutliers,
    } as never,
  );
}

const ctx = { organizationId: 'org-1' } as never;

describe('AgentTrendsToolHandler', () => {
  it('returns an unavailable result without retrying through live ingestion', async () => {
    const result = await handlerWith({}).getTrends(
      { platform: 'youtube' },
      ctx,
    );

    expect(result).toMatchObject({
      data: { count: 0, trends: [] },
      success: true,
    });
  });

  it('lists the outlier library beside the trends, numbers and links only', async () => {
    const result = await handlerWith({}, [OUTLIER_ROW]).getTrends({}, ctx);

    expect((result.data as { outliers: unknown[] }).outliers).toEqual([
      {
        caption: 'One-take demo',
        countsReadAt: '2026-11-27T06:00:00.000Z',
        creator: 'buildlog',
        id: 'o1',
        multiple: 6.3,
        platform: 'tiktok',
        publishedAt: '2026-11-20T09:00:00.000Z',
        tier: 'outlier',
        typicalViews: 9_800,
        url: 'https://www.tiktok.com/@buildlog/video/7300000000000000000',
        views: 62_000,
      },
    ]);
  });

  it('leaves YouTube out of the outlier list until its policy step is done', async () => {
    const result = await handlerWith({}, [
      OUTLIER_ROW,
      { ...OUTLIER_ROW, id: 'o2', platform: 'youtube' },
    ]).getTrends({}, ctx);
    expect(
      (result.data as { outliers: { id: string }[] }).outliers.map(
        (row) => row.id,
      ),
    ).toEqual(['o1']);

    const youtube = await handlerWith({}, [OUTLIER_ROW]).getTrends(
      { platform: 'youtube' },
      ctx,
    );
    expect((youtube.data as { outliers: unknown[] }).outliers).toEqual([]);
  });

  it('does not let one platform fill the answer when no platform is given', async () => {
    const youtube = Array.from({ length: 30 }, (_, index) =>
      trendRow(`y${index}`, 'youtube', 1000 - index, 1),
    );
    const result = await handlerWith({
      reddit: [trendRow('r1', 'reddit', 5, 2)],
      twitter: [trendRow('t1', 'twitter', 3, 2)],
      youtube,
    }).getTrends({}, ctx);

    const platforms = (
      result.data as { trends: { platform: string }[] }
    ).trends.map((trend) => trend.platform);
    expect(platforms.slice(0, 3).sort()).toEqual([
      'reddit',
      'twitter',
      'youtube',
    ]);
    expect(platforms).toHaveLength(20);
  });

  it.each([
    ['24h', ['fresh']],
    ['7d', ['fresh', 'threeDays']],
    ['30d', ['fresh', 'threeDays', 'tenDays']],
  ])('applies the %s timeframe', async (timeframe, expectedIds) => {
    const result = await handlerWith({
      twitter: [
        trendRow('tenDays', 'twitter', 1, 240),
        trendRow('threeDays', 'twitter', 2, 72),
        trendRow('fresh', 'twitter', 3, 2),
      ],
    }).getTrends({ timeframe }, ctx);

    const ids = (result.data as { trends: { id: string }[] }).trends.map(
      (trend) => trend.id,
    );
    expect(ids.sort()).toEqual([...expectedIds].sort());
  });

  it('dates every trend and names the newest cached row when the window is empty', async () => {
    const stale = trendRow('old', 'twitter', 1, 100);
    const result = await handlerWith({ twitter: [stale] }).getTrends(
      { timeframe: '24h' },
      ctx,
    );

    expect(result.data).toMatchObject({
      count: 0,
      newestUpdatedAt: stale.updatedAt.toISOString(),
      timeframe: '24h',
      trends: [],
    });

    const fresh = trendRow('new', 'twitter', 1, 1);
    const dated = await handlerWith({ twitter: [fresh] }).getTrends({}, ctx);
    expect(
      (dated.data as { trends: { updatedAt: string }[] }).trends[0],
    ).toMatchObject({ updatedAt: fresh.updatedAt.toISOString() });
  });
});
