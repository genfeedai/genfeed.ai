import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { CacheService } from '@server/services/cache/cache.service';
import { ApifyRunBudgetService } from '@server/services/integrations/apify/services/modules/apify-run-budget.service';
import { of } from 'rxjs';

describe('ApifyRunBudgetService', () => {
  let service: ApifyRunBudgetService;
  let cacheService: Record<string, ReturnType<typeof vi.fn>>;
  let configService: Record<string, ReturnType<typeof vi.fn>>;
  let httpService: { get: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let env: Record<string, string | undefined>;
  let counters: Record<string, number>;
  let claims: Set<string>;

  const build = (): ApifyRunBudgetService =>
    new ApifyRunBudgetService(
      configService as unknown as ConfigService,
      loggerService as unknown as LoggerService,
      cacheService as unknown as CacheService,
      httpService as unknown as HttpService,
    );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
    env = {};
    counters = {};
    claims = new Set();

    configService = { get: vi.fn((key: string) => env[key]) };

    cacheService = {
      claimOnce: vi.fn(async (key: string) => {
        if (claims.has(key)) return 'duplicate';
        claims.add(key);
        return 'claimed';
      }),
      del: vi.fn(async (key: string) => {
        delete counters[key];
        claims.delete(key);
        return true;
      }),
      expire: vi.fn().mockResolvedValue(true),
      generateKey: vi.fn(
        (namespace: string, ...parts: (string | number)[]) =>
          `${namespace}:${parts.join(':')}`,
      ),
      incr: vi.fn(async (key: string, by = 1) => {
        counters[key] = (counters[key] ?? 0) + by;
        return counters[key];
      }),
      get: vi.fn(async (key: string) => counters[key] ?? null),
      set: vi.fn(async (key: string, value: number) => {
        counters[key] = value;
        return true;
      }),
    };

    httpService = {
      get: vi.fn().mockReturnValue(
        of({
          data: {
            data: {
              totalUsageCreditsUsdAfterVolumeDiscount: 0,
              usageCycle: {
                endAt: '2026-09-26T23:59:59.999Z',
                startAt: '2026-08-27T00:00:00.000Z',
              },
            },
          },
        }),
      ),
    };

    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    service = build();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('allows a run while both counters are under their caps', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '5';
    env.APIFY_MAX_RUNS_PER_DAY = '10';
    service = build();

    const decision = await service.consumeRun(
      'hosted',
      'apify/scraper',
      'test-token',
    );

    expect(decision.isAllowed).toBe(true);
    expect(cacheService.incr).toHaveBeenCalledTimes(3);
  });

  it('sets an expiry on each counter so budgets roll over on their own', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '5';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper', 'test-token');

    expect(cacheService.expire).toHaveBeenCalledTimes(2);
  });

  it('refuses the run once the hourly cap is reached', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '2';
    env.APIFY_MAX_RUNS_PER_DAY = '100';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper', 'test-token');
    await service.consumeRun('hosted', 'apify/scraper', 'test-token');
    const third = await service.consumeRun(
      'hosted',
      'apify/scraper',
      'test-token',
    );

    expect(third.isAllowed).toBe(false);
    expect(third.reason).toContain('hourly');
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it('refuses the run once the daily cap is reached', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '100';
    env.APIFY_MAX_RUNS_PER_DAY = '1';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper', 'test-token');
    const second = await service.consumeRun(
      'hosted',
      'apify/scraper',
      'test-token',
    );

    expect(second.isAllowed).toBe(false);
    expect(second.reason).toContain('daily');
  });

  it('budgets each token scope separately', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '1';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper', 'test-token');
    const other = await service.consumeRun(
      'byok:org-1',
      'apify/scraper',
      'byok-token',
    );

    expect(other.isAllowed).toBe(true);
  });

  it('does not spend the hourly budget when the daily cap already refused', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '100';
    env.APIFY_MAX_RUNS_PER_DAY = '1';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper', 'test-token');
    cacheService.incr.mockClear();
    await service.consumeRun('hosted', 'apify/scraper', 'test-token');

    expect(cacheService.incr).toHaveBeenCalledTimes(1);
  });

  it('treats a non-positive cap as an explicitly disabled budget', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '0';
    env.APIFY_MAX_RUNS_PER_DAY = '0';
    env.APIFY_MAX_BILLING_PERIOD_USD = '0';
    service = build();

    const decision = await service.consumeRun(
      'hosted',
      'apify/scraper',
      'test-token',
    );

    expect(decision.isAllowed).toBe(true);
    expect(cacheService.incr).not.toHaveBeenCalled();
  });

  it('fails closed for the hosted token when Redis is unavailable', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '1';
    service = build();
    cacheService.incr.mockResolvedValue(0);

    const decision = await service.consumeRun(
      'hosted',
      'apify/scraper',
      'test-token',
    );

    expect(decision.isAllowed).toBe(false);
    expect(decision.reason).toContain('unavailable');
  });

  it('keeps BYOK run-budget behavior isolated when Redis is unavailable', async () => {
    cacheService.incr.mockResolvedValue(0);

    const decision = await service.consumeRun(
      'byok:org-1',
      'apify/scraper',
      'byok-token',
    );

    expect(decision.isAllowed).toBe(true);
  });

  it('logs the exhausted budget once per window instead of on every refusal', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '1';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper', 'test-token');
    await service.consumeRun('hosted', 'apify/scraper', 'test-token');
    await service.consumeRun('hosted', 'apify/scraper', 'test-token');

    expect(loggerService.warn).toHaveBeenCalledTimes(1);
  });

  it('applies conservative defaults when no caps are configured', () => {
    const limits = service.getLimits();

    expect(limits.maxRunsPerHour).toBeGreaterThan(0);
    expect(limits.maxRunsPerDay).toBeGreaterThan(limits.maxRunsPerHour);
    expect(limits.maxBillingPeriodUsd).toBe(4);
    expect(limits.maxTotalChargeUsdPerRun).toBeGreaterThan(0);
  });

  it('initializes the hosted ledger and clamps a run to remaining current-cycle usage', async () => {
    env.APIFY_MAX_BILLING_PERIOD_USD = '4';
    env.APIFY_MAX_TOTAL_CHARGE_USD_PER_RUN = '0.25';
    httpService.get.mockReturnValueOnce(
      of({
        data: {
          data: {
            totalUsageCreditsUsdAfterVolumeDiscount: 3.9,
            usageCycle: {
              endAt: '2026-09-26T23:59:59.999Z',
              startAt: '2026-08-27T00:00:00.000Z',
            },
          },
        },
      }),
    );
    service = build();

    const decision = await service.consumeRun(
      'hosted',
      'apify/scraper',
      'test-token',
    );

    expect(decision).toMatchObject({
      isAllowed: true,
      maxTotalChargeUsd: 0.1,
      reservation: expect.objectContaining({ reservedMicroUsd: 100_000 }),
    });
    expect(httpService.get).toHaveBeenCalledWith(
      'https://api.apify.com/v2/users/me/usage/monthly',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
        timeout: 15_000,
      }),
    );
  });

  it('retains the completed billing-period ledger for post-reset review', async () => {
    env.APIFY_MAX_BILLING_PERIOD_USD = '4';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper', 'test-token');

    const usageSet = cacheService.set.mock.calls.find(([key]) =>
      String(key).startsWith('apify:billing-period-budget:hosted:'),
    );
    const ttl = usageSet?.[2]?.ttl as number | undefined;
    const secondsUntilReset = Math.ceil(
      (Date.parse('2026-09-26T23:59:59.999Z') - Date.now()) / 1000,
    );

    expect(ttl).toBeGreaterThan(secondsUntilReset + 89 * 24 * 60 * 60);
  });

  it('refuses hosted runs when Apify current-cycle usage reached the ceiling', async () => {
    env.APIFY_MAX_BILLING_PERIOD_USD = '4';
    httpService.get.mockReturnValueOnce(
      of({
        data: {
          data: {
            totalUsageCreditsUsdAfterVolumeDiscount: 4,
            usageCycle: {
              endAt: '2026-09-26T23:59:59.999Z',
              startAt: '2026-08-27T00:00:00.000Z',
            },
          },
        },
      }),
    );
    service = build();

    const decision = await service.consumeRun(
      'hosted',
      'apify/scraper',
      'test-token',
    );

    expect(decision.isAllowed).toBe(false);
    expect(decision.reason).toContain('billing-period');
    expect(loggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('100%'),
      expect.objectContaining({ threshold: 100 }),
    );
  });

  it('claims billing threshold alerts once across service instances', async () => {
    env.APIFY_MAX_BILLING_PERIOD_USD = '4';
    httpService.get.mockReturnValue(
      of({
        data: {
          data: {
            totalUsageCreditsUsdAfterVolumeDiscount: 2,
            usageCycle: {
              endAt: '2026-09-26T23:59:59.999Z',
              startAt: '2026-08-27T00:00:00.000Z',
            },
          },
        },
      }),
    );

    await build().consumeRun('hosted', 'apify/scraper', 'test-token');
    await build().consumeRun('hosted', 'apify/scraper', 'test-token');

    const thresholdWarnings = loggerService.warn.mock.calls.filter(
      ([message]) => String(message).includes('50%'),
    );
    expect(thresholdWarnings).toHaveLength(1);
  });

  it('returns a per-run charge cap and reconciles the reservation to actual usage', async () => {
    env.APIFY_MAX_BILLING_PERIOD_USD = '4';
    env.APIFY_MAX_TOTAL_CHARGE_USD_PER_RUN = '0.25';
    service = build();

    const decision = await service.consumeRun(
      'hosted',
      'apify/scraper',
      'test-token',
    );
    expect(decision).toMatchObject({
      isAllowed: true,
      maxTotalChargeUsd: 0.25,
      reservation: expect.objectContaining({ reservedMicroUsd: 250_000 }),
    });

    await service.reconcileRun(decision.reservation, 0.012);

    const usageKey = decision.reservation?.usageKey;
    expect(usageKey).toBeDefined();
    expect(counters[usageKey as string]).toBe(12_000);
  });

  it('retains and reports the reservation when Apify omits actual usage', async () => {
    const reservation = {
      reservedMicroUsd: 250_000,
      usageKey: 'apify:billing-period-budget:hosted:2026-08-27',
    };

    await service.reconcileRun(reservation, undefined);

    expect(cacheService.incr).not.toHaveBeenCalled();
    expect(loggerService.warn).toHaveBeenCalledWith(
      'Apify actual usage unavailable; retaining the billing reservation',
      {
        reservedUsd: 0.25,
        usageKey: reservation.usageKey,
      },
    );
  });
});
