import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { TrendsAnalyticsController } from '@api/collections/trends/controllers/trends-analytics.controller';
import { TrendsDiscoveryController } from '@api/collections/trends/controllers/trends-discovery.controller';
import type { TrendsService } from '@api/collections/trends/services/trends.service';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { Timeframe } from '@genfeedai/contracts';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

type TrendRead = [method: string, ...args: unknown[]];

describe('Trends split controllers', () => {
  const user = {
    brandId: 'brand-active',
    organizationId: 'org-1',
  } as unknown as User;

  let reads: TrendRead[];
  let responses: Record<string, unknown>;

  const read =
    (method: string) =>
    async (...args: unknown[]): Promise<unknown> => {
      reads.push([method, ...args]);
      return responses[method] ?? [];
    };

  const trendsService = {
    getBrandTrendingHashtags: read('getBrandTrendingHashtags'),
    getBrandTrendingSounds: read('getBrandTrendingSounds'),
    getBrandViralVideos: read('getBrandViralVideos'),
    getTrendingHashtags: read('getTrendingHashtags'),
    getTrendingSounds: read('getTrendingSounds'),
    getTrendTimeline: read('getTrendTimeline'),
    getTurnoverStats: read('getTurnoverStats'),
    getViralLeaderboard: read('getViralLeaderboard'),
    getViralVideos: read('getViralVideos'),
  };
  const analyticsController = new TrendsAnalyticsController(
    trendsService as unknown as TrendsService,
  );

  beforeEach(() => {
    reads = [];
    responses = {};
  });

  it.each([
    [TrendsDiscoveryController, 'getTrendsDiscovery', 'discovery'],
    [TrendsDiscoveryController, 'getTrendContent', 'content'],
    [TrendsDiscoveryController, 'getReferenceCorpus', 'references'],
    [TrendsDiscoveryController, 'getPromptReferencePacks', 'references/packs'],
    [
      TrendsDiscoveryController,
      'getTopReferenceAccounts',
      'references/accounts',
    ],
    [TrendsDiscoveryController, 'getCorpusFreshnessHealth', 'corpus/health'],
    [TrendsAnalyticsController, 'getViralVideos', 'videos'],
    [TrendsAnalyticsController, 'getViralLeaderboard', 'leaderboard'],
    [TrendsAnalyticsController, 'getTrendingHashtags', 'hashtags'],
    [TrendsAnalyticsController, 'getTrendingSounds', 'sounds'],
    [TrendsAnalyticsController, 'getTurnoverStats', 'turnover'],
    [TrendsAnalyticsController, 'getTurnoverTimeline', 'turnover/timeline'],
  ] as const)(
    'preserves moved route metadata',
    (controllerClass, methodName, path) => {
      const handler = Reflect.get(
        controllerClass.prototype,
        methodName,
      ) as object;

      expect(Reflect.getMetadata(PATH_METADATA, controllerClass)).toBe(
        'trends',
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({
        operationId: `TrendsController.${methodName}`,
        summary: methodName,
      });
    },
  );

  it('registers static sibling controllers before the wildcard controller', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      TrendsModule,
    );

    expect(controllers).toEqual([
      TrendsAnalyticsController,
      TrendsDiscoveryController,
      TrendsController,
    ]);
  });

  it('preserves viral-video summary behavior', async () => {
    responses.getBrandViralVideos = [
      { platform: 'tiktok', viralScore: 81 },
      { platform: 'youtube', viralScore: Number.NaN },
    ];

    const result = await analyticsController.getViralVideos(
      { brandId: 'brand-active', limit: 12, timeframe: Timeframe.H24 },
      user,
    );

    expect(reads).toEqual([
      [
        'getBrandViralVideos',
        'org-1',
        'brand-active',
        { limit: 12, platform: undefined, timeframe: Timeframe.H24 },
      ],
    ]);
    expect(result.summary).toEqual({
      avgViralScore: 41,
      platforms: ['tiktok', 'youtube'],
      totalVideos: 2,
    });
  });

  it('rejects a sibling-brand selection before reading its private relevance corpus', async () => {
    await expect(
      analyticsController.getViralVideos(
        { brandId: 'brand-sibling', relevance: 'brand' },
        user,
      ),
    ).rejects.toThrow('Select an authorized brand');
    expect(reads).toEqual([]);
  });

  it('scopes hashtags and sounds to the selected authorized brand by default', async () => {
    const query = { limit: 12, timeframe: Timeframe.H24 } satisfies Parameters<
      TrendsAnalyticsController['getTrendingHashtags']
    >[0];

    await analyticsController.getTrendingHashtags(query, user);
    await analyticsController.getTrendingSounds(query, user);

    const scope = { limit: 12, platform: undefined, timeframe: Timeframe.H24 };
    expect(reads).toEqual([
      ['getBrandTrendingHashtags', 'org-1', 'brand-active', scope],
      ['getBrandTrendingSounds', 'org-1', 'brand-active', scope],
    ]);
  });

  it.each([
    ['hashtags', 'getTrendingHashtags'],
    ['sounds', 'getTrendingSounds'],
  ] as const)(
    'refuses %s for a sibling brand without reading anything',
    async (_kind, method) => {
      await expect(
        analyticsController[method](
          { brandId: 'sibling', limit: 12, timeframe: Timeframe.H24 },
          user,
        ),
      ).rejects.toThrow('Select an authorized brand');
      expect(reads).toEqual([]);
    },
  );

  it('reads the global hashtag and sound market only when explicitly selected', async () => {
    const query = { relevance: 'market', timeframe: Timeframe.D7 } as const;

    await analyticsController.getTrendingHashtags(query, user);
    await analyticsController.getTrendingSounds(query, user);

    const market = {
      limit: undefined,
      platform: undefined,
      timeframe: Timeframe.D7,
    };
    expect(reads).toEqual([
      ['getTrendingHashtags', market],
      ['getTrendingSounds', market],
    ]);
  });

  it('preserves turnover aggregation and supported-day parsing', async () => {
    const byPlatform = [
      {
        alive: 7,
        appeared: 10,
        avgLifespanDays: 4.25,
        died: 3,
        platform: 'tiktok',
        turnoverRate: 30,
      },
      {
        alive: 3,
        appeared: 5,
        avgLifespanDays: 6.5,
        died: 2,
        platform: 'youtube',
        turnoverRate: 40,
      },
    ];
    const timeline = [{ alive: 10, appeared: 15, date: '2026-07-27', died: 5 }];
    responses.getTurnoverStats = byPlatform;
    responses.getTrendTimeline = timeline;

    const result = await analyticsController.getTurnoverStats('7');

    expect(reads).toEqual(
      expect.arrayContaining([
        ['getTurnoverStats', 7],
        ['getTrendTimeline', 7],
      ]),
    );
    expect(result).toEqual({
      byPlatform,
      days: 7,
      timeline,
      totals: {
        alive: 10,
        appeared: 15,
        avgLifespanDays: 5.4,
        died: 5,
        turnoverRate: 33,
      },
    });
  });

  it('defaults unsupported turnover windows to 30 days', async () => {
    await analyticsController.getTurnoverTimeline('14');

    expect(reads).toEqual([['getTrendTimeline', 30]]);
  });
});
