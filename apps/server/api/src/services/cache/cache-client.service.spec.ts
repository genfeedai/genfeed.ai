import { CacheClientService } from '@api/services/cache/cache-client.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ---------- mock ioredis ---------- */
const mockPipeline = { exec: vi.fn().mockResolvedValue([]) };
const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  multi: vi.fn().mockReturnValue(mockPipeline),
  on: vi.fn().mockReturnThis(),
  quit: vi.fn().mockResolvedValue(undefined),
  removeAllListeners: vi.fn().mockReturnThis(),
  status: 'ready',
};

let capturedRetryStrategy: ((retries: number) => number | null) | undefined;

vi.mock('ioredis', () => ({
  default: vi.fn(function mockRedisConstructor(opts?: {
    retryStrategy?: (retries: number) => number | null;
  }) {
    capturedRetryStrategy = opts?.retryStrategy;
    return mockRedisClient;
  }),
}));

describe('CacheClientService', () => {
  let service: CacheClientService;
  let mockConfigService: { get: ReturnType<typeof vi.fn> };
  let mockLogger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfigService = {
      get: vi.fn().mockReturnValue('redis://localhost:6379'),
    };
    mockLogger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheClientService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<CacheClientService>(CacheClientService);
  });

  // Fake timers leak into every later test in the file when the test that
  // installed them fails before restoring them, turning one failure into a
  // cascade of unrelated timeouts.
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The listener the service registered for `event`, so a test can drive the
   * connection lifecycle without standing up a real ioredis connection.
   */
  function getClientHandler(event: string): (...args: unknown[]) => void {
    const registration = mockRedisClient.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => void]) => call[0] === event,
    );
    if (!registration) {
      throw new Error(`No "${event}" handler registered on the Redis client`);
    }
    return registration[1];
  }

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register error, connect and ready event handlers on construction', () => {
    const calls = mockRedisClient.on.mock.calls.map((c: [string]) => c[0]);
    expect(calls).toContain('error');
    expect(calls).toContain('connect');
    expect(calls).toContain('ready');
  });

  it('should expose the redis client via instance getter', () => {
    expect(service.instance).toBe(mockRedisClient);
  });

  it('should expose isReady reflecting the client state', () => {
    mockRedisClient.status = 'ready';
    expect(service.isReady).toBe(true);
    mockRedisClient.status = 'connecting';
    expect(service.isReady).toBe(false);
    mockRedisClient.status = 'ready';
  });

  it('should resolve the isolated cache Redis connection from ConfigService', () => {
    // The cache workload reads its own override first (#1186), falling back to
    // the shared base URL, and applies its dedicated logical DB.
    expect(mockConfigService.get).toHaveBeenCalledWith('REDIS_CACHE_URL');
    expect(mockConfigService.get).toHaveBeenCalledWith('REDIS_CACHE_DB');
  });

  /* ---------- retry strategy ---------- */

  it('should pass a retry strategy to the ioredis constructor', () => {
    expect(capturedRetryStrategy).toBeTypeOf('function');
  });

  it('retry strategy returns exponential delay for early retries', () => {
    const delay = capturedRetryStrategy?.(0);
    expect(typeof delay).toBe('number');
    expect(delay as number).toBeGreaterThan(0);
    expect(delay as number).toBeLessThanOrEqual(30_000);
  });

  it('retry strategy caps delay at 30 seconds', () => {
    const delay = capturedRetryStrategy?.(8);
    expect(delay as number).toBeLessThanOrEqual(30_000);
  });

  it('retry strategy never gives up on the connection', () => {
    // Returning a non-number permanently stops ioredis from reconnecting: the
    // client parks at `status: 'end'`, `isReady` stays false forever, and every
    // fail-open caller degrades silently with nothing left to log. Redis coming
    // back must be reconnected to, however long the outage ran.
    expect(capturedRetryStrategy?.(10)).toBe(30_000);
    expect(capturedRetryStrategy?.(100)).toBe(30_000);
    expect(capturedRetryStrategy?.(10_000)).toBe(30_000);
  });

  it('stops logging every reconnect attempt once the outage is no longer news', () => {
    // Unbounded retries mean unbounded log lines unless the verbose window is
    // bounded — one warning every 30 seconds forever buries the signal.
    for (let retries = 0; retries < 10; retries += 1) {
      capturedRetryStrategy?.(retries);
    }
    expect(mockLogger.warn).toHaveBeenCalledTimes(10);

    mockLogger.warn.mockClear();
    for (let retries = 10; retries < 30; retries += 1) {
      capturedRetryStrategy?.(retries);
    }
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('logs every connection error while an outage is new, then throttles', () => {
    vi.useFakeTimers();
    const handleError = getClientHandler('error');
    const outageError = new Error('ECONNREFUSED');

    for (let retries = 0; retries < 10; retries += 1) {
      capturedRetryStrategy?.(retries);
      handleError(outageError);
    }
    expect(mockLogger.error).toHaveBeenCalledTimes(10);

    mockLogger.error.mockClear();
    for (let retries = 10; retries < 20; retries += 1) {
      capturedRetryStrategy?.(retries);
      handleError(outageError);
    }
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('still unreachable'),
      outageError,
    );

    mockLogger.error.mockClear();
    vi.advanceTimersByTime(60_000);
    handleError(outageError);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    // The throttled errors are accounted for, so the line reports outage volume
    // rather than reading as the second failure in a minute.
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('9 errors suppressed'),
      outageError,
    );
    vi.useRealTimers();
  });

  it('reports how many reconnect attempts a recovery took, then resets', () => {
    const handleReady = getClientHandler('ready');
    const handleError = getClientHandler('error');
    const outageError = new Error('ECONNREFUSED');

    capturedRetryStrategy?.(4);
    mockLogger.log.mockClear();
    handleReady();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('recovered after 5 reconnect attempts'),
    );

    // Reset, so the next outage gets full detail rather than inheriting the
    // previous one's throttle.
    mockLogger.error.mockClear();
    handleError(outageError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Redis client error'),
      outageError,
    );
  });

  /* ---------- onModuleInit ---------- */

  it('should call connect on module init', async () => {
    await service.onModuleInit();
    expect(mockRedisClient.connect).toHaveBeenCalledOnce();
  });

  it('should log success when connection succeeds', async () => {
    await service.onModuleInit();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('initialized successfully'),
    );
  });

  it('should warn and not throw when connection times out', async () => {
    mockRedisClient.connect.mockImplementationOnce(
      () =>
        new Promise((_r, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5),
        ),
    );
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to connect'),
      expect.anything(),
    );
  });

  it('should warn and not throw when connection rejects immediately', async () => {
    mockRedisClient.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  /* ---------- onModuleDestroy ---------- */

  it('should remove listeners and quit on module destroy', async () => {
    await service.onModuleDestroy();
    expect(mockRedisClient.removeAllListeners).toHaveBeenCalled();
    expect(mockRedisClient.quit).toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('disconnected'),
    );
  });

  it('should log error when quit fails on module destroy', async () => {
    mockRedisClient.quit.mockRejectedValueOnce(new Error('quit failed'));
    await service.onModuleDestroy();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('disconnect error'),
      expect.anything(),
    );
  });

  it('should force close when quit hangs on module destroy', async () => {
    vi.useFakeTimers();
    mockRedisClient.quit.mockImplementationOnce(
      () => new Promise<never>(() => undefined),
    );

    const destroyPromise = service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(3_000);
    await destroyPromise;

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('disconnect error'),
      expect.any(Error),
    );
    expect(mockRedisClient.disconnect).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
