import { TrendsService } from '@api/collections/trends/services/trends.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { CronTrendsService } from '@workers/crons/trends/cron.trends.service';

describe('CronTrendsService', () => {
  let service: CronTrendsService;
  let trendsService: vi.Mocked<TrendsService>;
  let cacheService: vi.Mocked<CacheService>;
  let loggerService: vi.Mocked<LoggerService>;
  let configService: { isDevSchedulersEnabled: boolean };

  beforeEach(async () => {
    configService = {
      isDevSchedulersEnabled: true,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronTrendsService,
        {
          provide: TrendsService,
          useValue: {
            fetchAndCacheHashtags: vi.fn().mockResolvedValue([]),
            fetchAndCacheSounds: vi.fn().mockResolvedValue([]),
            fetchAndCacheTrends: vi
              .fn()
              .mockResolvedValue([{ id: 'trend-1' }, { id: 'trend-2' }]),
            fetchAndCacheViralVideos: vi.fn().mockResolvedValue([]),
            getGlobalCorpusStats: vi.fn().mockResolvedValue({
              activeTrends: 0,
              referenceRecords: 0,
            }),
            markExpiredHashtagsAsHistorical: vi.fn().mockResolvedValue(0),
            markExpiredSoundsAsHistorical: vi.fn().mockResolvedValue(0),
            markExpiredTrendsAsHistorical: vi.fn().mockResolvedValue(0),
            markExpiredVideosAsHistorical: vi.fn().mockResolvedValue(0),
          },
        },
        {
          provide: CacheService,
          useValue: {
            withLock: vi
              .fn()
              .mockImplementation(async (_key, fn) => await fn()),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<CronTrendsService>(CronTrendsService);
    trendsService = module.get(TrendsService);
    cacheService = module.get(CacheService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('refreshGlobalTrends should execute trend refresh under lock', async () => {
    await service.refreshGlobalTrends();

    expect(cacheService.withLock).toHaveBeenCalled();
    expect(trendsService.markExpiredTrendsAsHistorical).toHaveBeenCalled();
    expect(trendsService.fetchAndCacheTrends).toHaveBeenCalledTimes(1);
    expect(trendsService.fetchAndCacheSounds).toHaveBeenCalledTimes(1);
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
      expect.objectContaining({
        trendsResults: expect.objectContaining({
          global: 2,
          instagram: 1,
          tiktok: 1,
          twitter: 1,
        }),
      }),
    );
  });

  it('refreshGlobalTrends should skip when lock is already held', async () => {
    cacheService.withLock.mockResolvedValueOnce(null);

    await service.refreshGlobalTrends();

    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'skipped - lock already held by another instance',
      ),
    );
  });

  it('refreshGlobalTrends should skip when local schedulers are disabled', async () => {
    configService.isDevSchedulersEnabled = false;

    await service.refreshGlobalTrends();

    expect(cacheService.withLock).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('local schedulers disabled'),
    );
  });

  it('backfillGlobalTrendCorpus should refresh when corpus is below threshold', async () => {
    trendsService.getGlobalCorpusStats
      .mockResolvedValueOnce({
        activeTrends: 12,
        referenceRecords: 18,
      })
      .mockResolvedValueOnce({
        activeTrends: 54,
        referenceRecords: 121,
      });

    await service.backfillGlobalTrendCorpus();

    expect(cacheService.withLock).toHaveBeenCalled();
    expect(trendsService.fetchAndCacheTrends).toHaveBeenCalledTimes(1);
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
      expect.objectContaining({
        stats: expect.objectContaining({
          activeTrends: 54,
          referenceRecords: 121,
        }),
      }),
    );
  });

  it('backfillGlobalTrendCorpus should skip when corpus thresholds are satisfied', async () => {
    trendsService.getGlobalCorpusStats.mockResolvedValueOnce({
      activeTrends: 72,
      referenceRecords: 180,
    });

    await service.backfillGlobalTrendCorpus();

    expect(trendsService.fetchAndCacheTrends).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('skipped - corpus thresholds already satisfied'),
      expect.objectContaining({
        activeTrends: 72,
        referenceRecords: 180,
      }),
    );
  });

  it('backfillGlobalTrendCorpus should skip when local schedulers are disabled', async () => {
    configService.isDevSchedulersEnabled = false;

    await service.backfillGlobalTrendCorpus();

    expect(cacheService.withLock).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('local schedulers disabled'),
    );
  });
});
