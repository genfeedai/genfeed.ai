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

function handlerWith(rowsByPlatform: Record<string, unknown[]>) {
  const getTrends = vi
    .fn()
    .mockImplementation(
      async (_org: string, _brand: unknown, platform: string) =>
        rowsByPlatform[platform] ?? [],
    );
  return new AgentTrendsToolHandler({ getTrends } as never);
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
