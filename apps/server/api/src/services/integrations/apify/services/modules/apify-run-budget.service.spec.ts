import { CacheService } from '@api/services/cache/services/cache.service';
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
    env = {};
    counters = {};

    configService = { get: vi.fn((key: string) => env[key]) };

    cacheService = {
      expire: vi.fn().mockResolvedValue(true),
      incr: vi.fn(async (key: string) => {
        counters[key] = (counters[key] ?? 0) + 1;
        return counters[key];
      }),
    };

    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    service = build();
  });

  afterEach(() => vi.clearAllMocks());

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

  it('treats a non-positive cap as an explicitly disabled budget', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '0';
    env.APIFY_MAX_RUNS_PER_DAY = '0';
    service = build();

    const decision = await service.consumeRun('hosted', 'apify/scraper');

    expect(decision.isAllowed).toBe(true);
    expect(cacheService.incr).not.toHaveBeenCalled();
  });

  it('fails open when Redis is unavailable rather than bricking every scrape', async () => {
    env.APIFY_MAX_RUNS_PER_HOUR = '1';
    service = build();
    cacheService.incr.mockResolvedValue(0);

    const first = await service.consumeRun('hosted', 'apify/scraper');
    const second = await service.consumeRun('hosted', 'apify/scraper');

    expect(first.isAllowed).toBe(true);
    expect(second.isAllowed).toBe(true);
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
  });
});
