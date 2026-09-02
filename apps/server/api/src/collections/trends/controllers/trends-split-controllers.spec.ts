import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { TrendsAnalyticsController } from '@api/collections/trends/controllers/trends-analytics.controller';
import { TrendsDiscoveryController } from '@api/collections/trends/controllers/trends-discovery.controller';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { Timeframe } from '@genfeedai/contracts';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Trends split controllers', () => {
  const trendsService = {
    getTrendingHashtags: vi.fn(),
    getTrendingSounds: vi.fn(),
    getTrendTimeline: vi.fn(),
    getTurnoverStats: vi.fn(),
    getViralLeaderboard: vi.fn(),
    getViralVideos: vi.fn(),
  };
  const analyticsController = new TrendsAnalyticsController(
    trendsService as never,
  );

  afterEach(() => {
    vi.clearAllMocks();
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
    trendsService.getViralVideos.mockResolvedValue([
      { platform: 'tiktok', viralScore: 81 },
      { platform: 'youtube', viralScore: Number.NaN },
    ]);

    const result = await analyticsController.getViralVideos({
      limit: 12,
      timeframe: Timeframe.H24,
    });

    expect(trendsService.getViralVideos).toHaveBeenCalledWith({
      limit: 12,
      platform: undefined,
      timeframe: Timeframe.H24,
    });
    expect(result.summary).toEqual({
      avgViralScore: 41,
      platforms: ['tiktok', 'youtube'],
      totalVideos: 2,
    });
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
    trendsService.getTurnoverStats.mockResolvedValue(byPlatform);
    trendsService.getTrendTimeline.mockResolvedValue(timeline);

    const result = await analyticsController.getTurnoverStats('7');

    expect(trendsService.getTurnoverStats).toHaveBeenCalledWith(7);
    expect(trendsService.getTrendTimeline).toHaveBeenCalledWith(7);
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
    trendsService.getTrendTimeline.mockResolvedValue([]);

    await analyticsController.getTurnoverTimeline('14');

    expect(trendsService.getTrendTimeline).toHaveBeenCalledWith(30);
  });
});
