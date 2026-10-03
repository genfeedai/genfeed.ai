import { CacheService } from '@api/services/cache/cache.service';
import { ApifyRunBudgetService } from '@api/services/integrations/apify/services/modules/apify-run-budget.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('ApifyRunBudgetService', () => {
  let service: ApifyRunBudgetService;
  let cacheService: Record<string, ReturnType<typeof vi.fn>>;
  let configService: Record<string, ReturnType<typeof vi.fn>>;
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let env: Record<string, string | undefined>;
  let counters: Record<string, number>;

  const build = (): ApifyRunBudgetService =>
    new ApifyRunBudgetService(
      configService as unknown as ConfigService,
      loggerService as unknown as LoggerService,
      cacheService as unknown as CacheService,
    );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
    env = {};
    counters = {};

    configService = { get: vi.fn((key: string) => env[key]) };

    cacheService = {
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
      reserveCounterBudget: vi.fn(
        async (
          key: string,
          _receipt: string,
          limit: number,
          requested: number,
        ) => {
          if (counters[key] === undefined) return { status: 'unavailable' };
          const reserved = Math.min(requested, limit - counters[key]);
          if (reserved <= 0) return { status: 'exhausted' };
          counters[key] += reserved;
          return { status: 'reserved', reserved, total: counters[key] };
        },
      ),
      initializeCounterBudget: vi.fn(async (key: string, value: number) => {
        counters[key] ??= value;
        return true;
      }),
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

    const decision = await service.consumeRun('hosted', 'apify/scraper');

    expect(decision.isAllowed).toBe(true);
    expect(cacheService.incr).toHaveBeenCalledTimes(2);
  });

  it('sets an expiry on each counter so budgets roll over on their own', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '5';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper');

    expect(cacheService.expire).toHaveBeenCalledTimes(2);
  });

  it('refuses the run once the hourly cap is reached', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '2';
    env.APIFY_MAX_RUNS_PER_DAY = '100';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper');
    await service.consumeRun('hosted', 'apify/scraper');
    const third = await service.consumeRun('hosted', 'apify/scraper');

    expect(third.isAllowed).toBe(false);
    expect(third.reason).toContain('hourly');
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it('refuses the run once the daily cap is reached', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '100';
    env.APIFY_MAX_RUNS_PER_DAY = '1';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper');
    const second = await service.consumeRun('hosted', 'apify/scraper');

    expect(second.isAllowed).toBe(false);
    expect(second.reason).toContain('daily');
  });

  it('budgets each token scope separately', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '1';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper');
    const other = await service.consumeRun('byok:org-1', 'apify/scraper');

    expect(other.isAllowed).toBe(true);
  });

  it('does not spend the hourly budget when the daily cap already refused', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '100';
    env.APIFY_MAX_RUNS_PER_DAY = '1';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper');
    cacheService.incr.mockClear();
    await service.consumeRun('hosted', 'apify/scraper');

    expect(cacheService.incr).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-positive hosted cap', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '0';
    env.APIFY_MAX_RUNS_PER_DAY = '0';
    service = build();

    const decision = await service.consumeRun('hosted', 'apify/scraper');

    expect(decision.isAllowed).toBe(false);
    expect(cacheService.incr).not.toHaveBeenCalled();
  });

  it('fails closed for the hosted token when Redis is unavailable', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '1';
    service = build();
    cacheService.incr.mockResolvedValue(0);

    const decision = await service.consumeRun('hosted', 'apify/scraper');

    expect(decision.isAllowed).toBe(false);
    expect(decision.reason).toContain('unavailable');
  });

  it('keeps BYOK run-budget behavior isolated when Redis is unavailable', async () => {
    cacheService.incr.mockResolvedValue(0);

    const decision = await service.consumeRun('byok:org-1', 'apify/scraper');

    expect(decision.isAllowed).toBe(true);
  });

  it('logs the exhausted budget once per window instead of on every refusal', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '1';
    service = build();

    await service.consumeRun('hosted', 'apify/scraper');
    await service.consumeRun('hosted', 'apify/scraper');
    await service.consumeRun('hosted', 'apify/scraper');

    expect(loggerService.warn).toHaveBeenCalledTimes(1);
  });

  it('applies conservative defaults when no caps are configured', () => {
    const limits = service.getLimits();

    expect(limits.maxRunsPerHour).toBeGreaterThan(0);
    expect(limits.maxRunsPerDay).toBeGreaterThan(limits.maxRunsPerHour);
    expect(limits.maxTotalChargeUsdPerRun).toBeGreaterThan(0);
  });

  it('admits hosted runs without consulting exhausted or unhealthy billing books', async () => {
    const usageKey = 'apify:billing-period-budget:hosted:2026-08-27';
    counters[usageKey] = 4_000_000;
    counters[`${usageKey}:books-unhealthy`] = 1;
    cacheService.get.mockRejectedValue(new Error('billing ledger unavailable'));
    service = build();

    const decision = await service.consumeRun('hosted', 'apify/scraper');

    expect(decision).toEqual({ isAllowed: true, maxTotalChargeUsd: 0.25 });
    expect(cacheService.get).not.toHaveBeenCalled();
    expect(cacheService.initializeCounterBudget).not.toHaveBeenCalled();
    expect(cacheService.reserveCounterBudget).not.toHaveBeenCalled();
    expect(counters[usageKey]).toBe(4_000_000);
  });

  it('passes the configured hosted per-run charge ceiling without a reservation', async () => {
    env.APIFY_MAX_TOTAL_CHARGE_USD_PER_RUN = '0.12';
    service = build();
    expect(await service.consumeRun('hosted', 'actor')).toEqual({
      isAllowed: true,
      maxTotalChargeUsd: 0.12,
    });
  });

  it.each(
    [
      'APIFY_MAX_RUNS_PER_HOUR',
      'APIFY_MAX_RUNS_PER_DAY',
      'APIFY_MAX_TOTAL_CHARGE_USD_PER_RUN',
    ].flatMap((key) =>
      [
        '0',
        '-1',
        'bad',
        'NaN',
        'Infinity',
        ' ',
        '9007199254740992',
        '0.00000001',
      ].map((value) => [key, value]),
    ),
  )('rejects invalid %s=%s before consuming a run', async (key, value) => {
    env[key] = value;
    const result = await build().consumeRun('hosted', 'actor');
    expect(result.isAllowed).toBe(false);
    expect(cacheService.incr).not.toHaveBeenCalled();
  });
});
