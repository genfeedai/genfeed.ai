import { ConfigService } from '@api/config/config.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

describe('ApifyBaseService', () => {
  let service: ApifyBaseService;
  let httpService: Record<string, ReturnType<typeof vi.fn>>;
  let configService: Record<string, ReturnType<typeof vi.fn>>;
  let byokFactory: Record<string, ReturnType<typeof vi.fn>>;
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    configService = {
      get: vi.fn((key: string) =>
        key === 'APIFY_API_TOKEN' ? 'test-token' : undefined,
      ),
    };

    httpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    byokFactory = {
      resolveProvider: vi.fn().mockResolvedValue({
        apiKey: null,
        source: 'hosted',
      }),
    };

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new ApifyBaseService(
      configService as unknown as ConfigService,
      loggerService as unknown as LoggerService,
      httpService as unknown as HttpService,
      byokFactory as unknown as ByokProviderFactoryService,
    );
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getApiToken returns token from config', () => {
    expect(service.getApiToken()).toBe('test-token');
  });

  it('getApiToken returns null when not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(service.getApiToken()).toBeNull();
  });

  it('runActor returns empty array when no token configured', async () => {
    configService.get.mockReturnValue(undefined);
    const result = await service.runActor('some/actor', {});
    expect(result).toEqual([]);
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('runActor executes actor and returns dataset items', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          data: {
            defaultDatasetId: 'ds-1',
            id: 'run-1',
            status: 'RUNNING',
          },
        },
      }),
    );

    // waitForRun poll returns SUCCEEDED
    httpService.get
      .mockReturnValueOnce(
        of({ data: { data: { id: 'run-1', status: 'SUCCEEDED' } } }),
      )
      // dataset items
      .mockReturnValueOnce(of({ data: [{ title: 'Video 1' }] }));

    const result = await service.runActor<{ title: string }>('test/actor', {
      query: 'test',
    });
    expect(result).toEqual([{ title: 'Video 1' }]);
    expect(httpService.post).toHaveBeenCalledWith(
      'https://api.apify.com/v2/acts/test~actor/runs',
      { query: 'test' },
      {
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      },
    );
    expect(httpService.get).toHaveBeenNthCalledWith(
      1,
      'https://api.apify.com/v2/actor-runs/run-1',
      {
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      },
    );
    expect(httpService.get).toHaveBeenNthCalledWith(
      2,
      'https://api.apify.com/v2/datasets/ds-1/items',
      {
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('runActor throws when actor run fails', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          data: { defaultDatasetId: 'ds-1', id: 'run-1', status: 'RUNNING' },
        },
      }),
    );
    httpService.get.mockReturnValue(
      of({ data: { data: { id: 'run-1', status: 'FAILED' } } }),
    );

    await expect(service.runActor('test/actor', {})).rejects.toThrow(
      'Actor run run-1 ended with status: FAILED',
    );
  });

  it('runActorForOrg uses byok key when available', async () => {
    byokFactory.resolveProvider.mockResolvedValue({
      apiKey: 'byok-key',
      source: 'byok',
    });

    httpService.post.mockReturnValue(
      of({
        data: {
          data: { defaultDatasetId: 'ds-1', id: 'run-1', status: 'RUNNING' },
        },
      }),
    );
    httpService.get
      .mockReturnValueOnce(
        of({ data: { data: { id: 'run-1', status: 'SUCCEEDED' } } }),
      )
      .mockReturnValueOnce(of({ data: [{ id: '1' }] }));

    const result = await service.runActorForOrg('org-1', 'test/actor', {});
    expect(result.source).toBe('byok');
    expect(httpService.post).toHaveBeenCalledWith(
      'https://api.apify.com/v2/acts/test~actor/runs',
      {},
      {
        headers: {
          Authorization: 'Bearer byok-key',
          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('runActor preserves already-normalized owner actor identifiers', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          data: {
            defaultDatasetId: 'ds-1',
            id: 'run-1',
            status: 'RUNNING',
          },
        },
      }),
    );
    httpService.get
      .mockReturnValueOnce(
        of({ data: { data: { id: 'run-1', status: 'SUCCEEDED' } } }),
      )
      .mockReturnValueOnce(of({ data: [] }));

    await service.runActor('owner~actor-name', {});

    expect(httpService.post).toHaveBeenCalledWith(
      'https://api.apify.com/v2/acts/owner~actor-name/runs',
      {},
      expect.anything(),
    );
  });

  it('runActor preserves opaque actor ids', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          data: {
            defaultDatasetId: 'ds-1',
            id: 'run-1',
            status: 'RUNNING',
          },
        },
      }),
    );
    httpService.get
      .mockReturnValueOnce(
        of({ data: { data: { id: 'run-1', status: 'SUCCEEDED' } } }),
      )
      .mockReturnValueOnce(of({ data: [] }));

    await service.runActor('asadasd1234ABCD', {});

    expect(httpService.post).toHaveBeenCalledWith(
      'https://api.apify.com/v2/acts/asadasd1234ABCD/runs',
      {},
      expect.anything(),
    );
  });

  it('runActorForOrg returns empty when no token from any source', async () => {
    configService.get.mockReturnValue(undefined);
    byokFactory.resolveProvider.mockResolvedValue({
      apiKey: null,
      source: 'hosted',
    });

    const result = await service.runActorForOrg('org-1', 'test/actor', {});
    expect(result).toEqual({ data: [], source: 'hosted' });
  });

  // ─── Pure utility methods ────────────────────────────────────────────────

  it('calculateEngagementMetrics computes correct values', () => {
    const metrics = service.calculateEngagementMetrics(
      10000, // views
      500, // likes
      100, // comments
      50, // shares
      new Date(Date.now() - 24 * 60 * 60 * 1000), // 24h ago
    );
    expect(metrics.engagementRate).toBeGreaterThan(0);
    expect(metrics.velocity).toBeGreaterThan(0);
    expect(metrics.viralScore).toBeGreaterThan(0);
  });

  it('calculateEngagementMetrics handles zero views', () => {
    const metrics = service.calculateEngagementMetrics(0, 0, 0, 0);
    expect(metrics.engagementRate).toBe(0);
    expect(metrics.viralScore).toBeGreaterThanOrEqual(0);
  });

  it('calculateViralityScore returns value between 0 and 100', () => {
    const score = service.calculateViralityScore(1000000, 50000);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('calculateGrowthRate with previous value', () => {
    expect(service.calculateGrowthRate(150, 100)).toBe(50);
    expect(service.calculateGrowthRate(50, 100)).toBe(-50);
  });

  it('calculateGrowthRate with previous zero', () => {
    expect(service.calculateGrowthRate(100, 0)).toBe(100);
    expect(service.calculateGrowthRate(0, 0)).toBe(0);
  });

  it('calculateGrowthRate without previous uses thresholds', () => {
    expect(service.calculateGrowthRate(500)).toBe(10);
    expect(service.calculateGrowthRate(50000)).toBe(45);
    expect(service.calculateGrowthRate(0)).toBe(0);
  });

  it('parseDuration handles ISO 8601 durations', () => {
    expect(service.parseDuration('PT1H2M3S')).toBe(3723);
    expect(service.parseDuration('PT5M')).toBe(300);
    expect(service.parseDuration('PT30S')).toBe(30);
    expect(service.parseDuration(undefined)).toBeUndefined();
    expect(service.parseDuration('invalid')).toBeUndefined();
  });

  it('extractHashtags finds hashtags in text', () => {
    expect(
      service.extractHashtags('Check out #viral #trending content'),
    ).toEqual(['viral', 'trending']);
    expect(service.extractHashtags('No hashtags here')).toEqual([]);
  });

  it('ACTORS contains expected platform keys', () => {
    expect(service.ACTORS.YOUTUBE_SCRAPER).toBeDefined();
    expect(service.ACTORS.TWITTER_SCRAPER).toBeDefined();
    expect(service.ACTORS.INSTAGRAM_SCRAPER).toBeDefined();
  });
});
