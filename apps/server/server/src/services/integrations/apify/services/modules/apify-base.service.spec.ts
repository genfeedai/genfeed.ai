import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { ByokProviderFactoryService } from '@server/services/byok/byok-provider-factory.service';
import { ApifyBaseService } from '@server/services/integrations/apify/services/modules/apify-base.service';
import { ApifyRunBudgetService } from '@server/services/integrations/apify/services/modules/apify-run-budget.service';
import { of, throwError } from 'rxjs';

const ACCOUNT_LIMIT_ERROR = {
  isAxiosError: true,
  message: 'Request failed with status code 403',
  name: 'AxiosError',
  response: {
    data: {
      error: {
        message: 'Monthly usage hard limit exceeded',
        type: 'platform-feature-disabled',
      },
    },
    status: 403,
  },
};

describe('ApifyBaseService', () => {
  let service: ApifyBaseService;
  let httpService: Record<string, ReturnType<typeof vi.fn>>;
  let configService: Record<string, ReturnType<typeof vi.fn>>;
  let byokFactory: Record<string, ReturnType<typeof vi.fn>>;
  let runBudget: Record<string, ReturnType<typeof vi.fn>>;
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

    runBudget = {
      consumeRun: vi.fn().mockResolvedValue({ isAllowed: true }),
      reconcileRun: vi.fn().mockResolvedValue(undefined),
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
      runBudget as unknown as ApifyRunBudgetService,
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

  it('blocks an unregistered actor from using the hosted token in production', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'APIFY_API_TOKEN') return 'test-token';
      if (key === 'NODE_ENV') return 'production';
      return undefined;
    });

    await expect(service.runActor('unknown/paid-actor', {})).rejects.toThrow(
      'not registered for hosted production execution',
    );
    expect(runBudget.consumeRun).not.toHaveBeenCalled();
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('allows a registered actor through the governed production boundary', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'APIFY_API_TOKEN') return 'test-token';
      if (key === 'NODE_ENV') return 'production';
      return undefined;
    });
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

    await expect(
      service.runActor('streamers/youtube-scraper', {}),
    ).resolves.toEqual([]);
    expect(runBudget.consumeRun).toHaveBeenCalledTimes(1);
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
    const reservation = {
      reservedMicroUsd: 250_000,
      usageKey: 'apify:billing-period-budget:hosted:2026-08-27',
    };
    runBudget.consumeRun.mockResolvedValueOnce({
      isAllowed: true,
      maxTotalChargeUsd: 0.25,
      reservation,
    });
    httpService.post.mockReturnValue(
      of({
        data: {
          data: { defaultDatasetId: 'ds-1', id: 'run-1', status: 'RUNNING' },
        },
      }),
    );
    httpService.get.mockReturnValue(
      of({
        data: {
          data: { id: 'run-1', status: 'FAILED', usageTotalUsd: 0.004 },
        },
      }),
    );

    await expect(service.runActor('test/actor', {})).rejects.toThrow(
      'Actor run run-1 ended with status: FAILED',
    );
    expect(runBudget.reconcileRun).toHaveBeenCalledWith(reservation, 0.004);
  });

  it('caps a hosted run and reconciles the reservation to Apify actual usage', async () => {
    const reservation = {
      reservedMicroUsd: 250_000,
      usageKey: 'apify:billing-period-budget:hosted:2026-08-27',
    };
    runBudget.consumeRun.mockResolvedValueOnce({
      isAllowed: true,
      maxTotalChargeUsd: 0.25,
      reservation,
    });
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
        of({
          data: {
            data: {
              id: 'run-1',
              status: 'SUCCEEDED',
              usageTotalUsd: 0.012,
            },
          },
        }),
      )
      .mockReturnValueOnce(of({ data: [] }));

    await service.runActor('test/actor', {});

    expect(httpService.post).toHaveBeenCalledWith(
      'https://api.apify.com/v2/acts/test~actor/runs?maxTotalChargeUsd=0.25',
      {},
      expect.anything(),
    );
    expect(runBudget.reconcileRun).toHaveBeenCalledWith(reservation, 0.012);
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

  it('keeps order-of-magnitude hashtag signals distinguishable', () => {
    const scores = [
      service.calculateViralityScore(100_000, 2_000),
      service.calculateViralityScore(1_000_000, 20_000),
      service.calculateViralityScore(10_000_000, 200_000),
      service.calculateViralityScore(50_000_000, 1_000_000),
    ];

    expect(scores).toEqual([55, 68, 82, 91]);
    expect(scores[1]).toBeLessThan(70);
    expect(scores[2]).toBeGreaterThanOrEqual(70);
  });

  it('calibrates video scores so the default threshold rejects weak trends', () => {
    const now = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    const fixtures = [
      { engagementRate: 5, velocity: 1_000, views: 100_000 },
      { engagementRate: 8, velocity: 10_000, views: 1_000_000 },
      { engagementRate: 10, velocity: 50_000, views: 10_000_000 },
      { engagementRate: 15, velocity: 250_000, views: 50_000_000 },
    ];

    const scores = fixtures.map(({ engagementRate, velocity, views }) => {
      const hoursOld = views / velocity;
      return service.calculateEngagementMetrics(
        views,
        (views * engagementRate) / 100,
        0,
        0,
        new Date(now - hoursOld * 60 * 60 * 1_000),
      ).viralScore;
    });

    nowSpy.mockRestore();
    expect(scores[0]).toBe(46);
    expect(scores[1]).toBe(60);
    expect(scores[2]).toBeGreaterThanOrEqual(70);
    expect(scores[2]).toBeLessThan(72);
    expect(scores[3]).toBe(83);
  });

  it('treats invalid or negative scoring inputs as zero signal', () => {
    expect(
      service.calculateViralityScore(Number.NaN, Number.POSITIVE_INFINITY),
    ).toBe(0);
    expect(service.calculateViralityScore(-1, -1)).toBe(0);
    expect(service.calculateEngagementMetrics(-1, -1, -1, -1).viralScore).toBe(
      0,
    );
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

  // ─── Account-limit circuit breaker ───────────────────────────────────────

  describe('Apify account usage limit', () => {
    let nowSpy: ReturnType<typeof vi.spyOn>;
    let now: number;

    beforeEach(() => {
      now = 1_700_000_000_000;
      nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it('logs an actionable account-limit error instead of an anonymous request failure', async () => {
      httpService.post.mockReturnValue(throwError(() => ACCOUNT_LIMIT_ERROR));

      await expect(service.runActor('test/actor', {})).rejects.toBeDefined();

      const messages = loggerService.error.mock.calls.map(
        (call: unknown[]) => call[0] as string,
      );
      expect(
        messages.some(
          (message) =>
            message.includes('Monthly usage hard limit exceeded') &&
            message.includes('suspended'),
        ),
      ).toBe(true);
    });

    it('stops issuing doomed hosted calls while the account limit is active', async () => {
      httpService.post.mockReturnValue(throwError(() => ACCOUNT_LIMIT_ERROR));

      await expect(service.runActor('test/actor', {})).rejects.toBeDefined();
      expect(httpService.post).toHaveBeenCalledTimes(1);

      await expect(service.runActor('other/actor', {})).rejects.toThrow(
        /Apify/i,
      );
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it('retries once the suspension window has elapsed', async () => {
      httpService.post.mockReturnValue(throwError(() => ACCOUNT_LIMIT_ERROR));

      await expect(service.runActor('test/actor', {})).rejects.toBeDefined();
      expect(httpService.post).toHaveBeenCalledTimes(1);

      now += ApifyBaseService.ACCOUNT_LIMIT_SUSPENSION_MS + 1;

      await expect(service.runActor('test/actor', {})).rejects.toBeDefined();
      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it('does not suspend on failures that are not account limits', async () => {
      httpService.post.mockReturnValue(
        throwError(() => ({
          isAxiosError: true,
          message: 'Request failed with status code 500',
          name: 'AxiosError',
          response: { status: 500 },
        })),
      );

      await expect(service.runActor('test/actor', {})).rejects.toBeDefined();
      await expect(service.runActor('test/actor', {})).rejects.toBeDefined();

      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it('scopes a byok account limit to that organization only', async () => {
      byokFactory.resolveProvider.mockResolvedValue({
        apiKey: 'byok-key',
        source: 'byok',
      });
      httpService.post.mockReturnValue(throwError(() => ACCOUNT_LIMIT_ERROR));

      await expect(
        service.runActorForOrg('org-1', 'test/actor', {}),
      ).rejects.toBeDefined();
      expect(httpService.post).toHaveBeenCalledTimes(1);

      await expect(
        service.runActorForOrg('org-1', 'test/actor', {}),
      ).rejects.toThrow(/Apify/i);
      expect(httpService.post).toHaveBeenCalledTimes(1);

      byokFactory.resolveProvider.mockResolvedValue({
        apiKey: 'byok-key-2',
        source: 'byok',
      });
      await expect(
        service.runActorForOrg('org-2', 'test/actor', {}),
      ).rejects.toBeDefined();
      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it('keeps byok organizations running when the hosted token hits its limit', async () => {
      httpService.post.mockReturnValue(throwError(() => ACCOUNT_LIMIT_ERROR));

      await expect(service.runActor('test/actor', {})).rejects.toBeDefined();
      expect(httpService.post).toHaveBeenCalledTimes(1);

      byokFactory.resolveProvider.mockResolvedValue({
        apiKey: 'byok-key',
        source: 'byok',
      });
      await expect(
        service.runActorForOrg('org-1', 'test/actor', {}),
      ).rejects.toBeDefined();
      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it('suspends the hosted scope when an organization falls back to the hosted token', async () => {
      byokFactory.resolveProvider.mockResolvedValue({
        apiKey: null,
        source: 'hosted',
      });
      httpService.post.mockReturnValue(throwError(() => ACCOUNT_LIMIT_ERROR));

      await expect(
        service.runActorForOrg('org-1', 'test/actor', {}),
      ).rejects.toBeDefined();
      expect(httpService.post).toHaveBeenCalledTimes(1);

      await expect(service.runActor('test/actor', {})).rejects.toThrow(
        /Apify/i,
      );
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('Apify run budget', () => {
    it('does not call Apify when the run budget is exhausted', async () => {
      runBudget.consumeRun.mockResolvedValue({
        isAllowed: false,
        reason: 'hourly run budget exhausted',
        retryAfterMs: 60000,
      });

      await expect(service.runActor('test/actor', {})).rejects.toThrow(
        /run budget/i,
      );
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('spends budget against the byok scope for a byok organization', async () => {
      byokFactory.resolveProvider.mockResolvedValue({
        apiKey: 'byok-key',
        source: 'byok',
      });
      httpService.post.mockReturnValue(
        of({ data: { data: { defaultDatasetId: 'ds-1', id: 'run-1' } } }),
      );
      httpService.get.mockReturnValue(
        of({ data: { data: { status: 'SUCCEEDED' } } }),
      );

      await service.runActorForOrg('org-1', 'test/actor', {});

      expect(runBudget.consumeRun).toHaveBeenCalledWith(
        'byok:org-1',
        'test/actor',
        'byok-key',
      );
    });

    it('skips the budget entirely when no token is configured', async () => {
      configService.get.mockReturnValue(undefined);

      await expect(service.runActor('test/actor', {})).resolves.toEqual([]);
      expect(runBudget.consumeRun).not.toHaveBeenCalled();
    });

    it('does not spend budget while the account-limit suspension is active', async () => {
      httpService.post.mockReturnValue(throwError(() => ACCOUNT_LIMIT_ERROR));

      await expect(service.runActor('test/actor', {})).rejects.toBeDefined();
      runBudget.consumeRun.mockClear();

      await expect(service.runActor('test/actor', {})).rejects.toThrow(
        /Apify/i,
      );
      expect(runBudget.consumeRun).not.toHaveBeenCalled();
    });
  });
});
