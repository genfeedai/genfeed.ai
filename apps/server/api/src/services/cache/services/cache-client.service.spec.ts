import { ConfigService } from '@api/config/config.service';
import { CacheClientService } from '@api/services/cache/services/cache-client.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ---------- mock redis ---------- */
const mockPipeline = { exec: vi.fn().mockResolvedValue([]) };
const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isReady: true,
  multi: vi.fn().mockReturnValue(mockPipeline),
  on: vi.fn().mockReturnThis(),
  quit: vi.fn().mockResolvedValue(undefined),
  removeAllListeners: vi.fn().mockReturnThis(),
};

let capturedReconnectStrategy:
  | ((retries: number) => number | false)
  | undefined;

vi.mock('redis', () => ({
  createClient: vi.fn(
    (opts: {
      socket?: { reconnectStrategy?: (retries: number) => number | false };
    }) => {
      capturedReconnectStrategy = opts?.socket?.reconnectStrategy;
      return mockRedisClient;
    },
  ),
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
    mockRedisClient.isReady = true;
    expect(service.isReady).toBe(true);
    mockRedisClient.isReady = false;
    expect(service.isReady).toBe(false);
    mockRedisClient.isReady = true;
  });

  it('should read REDIS_URL from ConfigService', () => {
    expect(mockConfigService.get).toHaveBeenCalledWith('REDIS_URL');
  });

  /* ---------- reconnect strategy ---------- */

  it('should pass a reconnect strategy to createClient', () => {
    expect(capturedReconnectStrategy).toBeTypeOf('function');
  });

  it('reconnect strategy returns exponential delay for early retries', () => {
    const delay = capturedReconnectStrategy!(0);
    expect(typeof delay).toBe('number');
    expect(delay as number).toBeGreaterThan(0);
    expect(delay as number).toBeLessThanOrEqual(30_000);
  });

  it('reconnect strategy returns false after max retries', () => {
    const result = capturedReconnectStrategy!(10);
    expect(result).toBe(false);
  });

  it('reconnect strategy caps delay at 30 seconds', () => {
    const delay = capturedReconnectStrategy!(8);
    expect(delay as number).toBeLessThanOrEqual(30_000);
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
});
