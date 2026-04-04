import { TrendsWarmupService } from '@api/collections/trends/services/trends-warmup.service';

describe('TrendsWarmupService', () => {
  const createService = () => {
    const configService = {
      isDevSchedulersEnabled: true,
    };
    const trendsService = {
      fetchAndCacheHashtags: vi.fn().mockResolvedValue([]),
      fetchAndCacheSounds: vi.fn().mockResolvedValue([]),
      fetchAndCacheViralVideos: vi.fn().mockResolvedValue([]),
      getGlobalCorpusStats: vi.fn().mockResolvedValue({
        activeTrends: 0,
        referenceRecords: 0,
      }),
      precomputeGlobalTrendSourcePreview: vi
        .fn()
        .mockResolvedValue({ processed: 0 }),
      refreshTrends: vi.fn().mockResolvedValue([]),
    };
    const cacheService = {
      withLock: vi.fn().mockImplementation(async (_key, fn) => await fn()),
    };
    const loggerService = {
      log: vi.fn(),
      warn: vi.fn(),
    };

    const service = new TrendsWarmupService(
      configService as never,
      trendsService as never,
      cacheService as never,
      loggerService as never,
    );

    return {
      cacheService,
      configService,
      loggerService,
      service,
      trendsService,
    };
  };

  const flushStartupWork = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips startup warmup when local schedulers are disabled', async () => {
    const {
      cacheService,
      configService,
      loggerService,
      service,
      trendsService,
    } = createService();

    configService.isDevSchedulersEnabled = false;

    service.onModuleInit();
    await flushStartupWork();

    expect(trendsService.getGlobalCorpusStats).not.toHaveBeenCalled();
    expect(cacheService.withLock).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      'Trend warmup scheduler disabled for local development',
      'TrendsWarmupService',
    );
  });

  it('runs startup warmup when the global corpus is below threshold', async () => {
    const { cacheService, loggerService, service, trendsService } =
      createService();

    service.onModuleInit();
    await flushStartupWork();

    expect(trendsService.getGlobalCorpusStats).toHaveBeenCalledTimes(1);
    expect(cacheService.withLock).toHaveBeenCalledWith(
      'trends:global-warmup',
      expect.any(Function),
      1800,
    );
    expect(trendsService.refreshTrends).toHaveBeenCalledTimes(1);
    expect(trendsService.fetchAndCacheViralVideos).toHaveBeenCalledTimes(4);
    expect(trendsService.fetchAndCacheHashtags).toHaveBeenCalledTimes(3);
    expect(trendsService.fetchAndCacheSounds).toHaveBeenCalledTimes(1);
    expect(
      trendsService.precomputeGlobalTrendSourcePreview,
    ).toHaveBeenCalledTimes(1);
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Starting startup trend warmup because corpus is below threshold',
      ),
      'TrendsWarmupService',
    );
  });

  it('skips startup warmup when the global corpus already meets threshold', async () => {
    const { cacheService, loggerService, service, trendsService } =
      createService();

    trendsService.getGlobalCorpusStats.mockResolvedValue({
      activeTrends: 75,
      referenceRecords: 180,
    });

    service.onModuleInit();
    await flushStartupWork();

    expect(cacheService.withLock).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping startup trend warmup because corpus thresholds are already satisfied',
      ),
      'TrendsWarmupService',
    );
  });
});
