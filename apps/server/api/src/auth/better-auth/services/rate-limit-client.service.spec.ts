import { RateLimitClientService } from '@api/auth/better-auth/services/rate-limit-client.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ---------- mock ioredis ---------- */
const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  on: vi.fn().mockReturnThis(),
  quit: vi.fn().mockResolvedValue(undefined),
  removeAllListeners: vi.fn().mockReturnThis(),
  set: vi.fn(),
  status: 'ready',
};

vi.mock('ioredis', () => ({
  default: vi.fn(function mockRedisConstructor() {
    return mockRedisClient;
  }),
}));

describe('RateLimitClientService (#1186 isolation)', () => {
  let service: RateLimitClientService;
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfigService = {
      get: vi.fn().mockReturnValue(undefined),
    };
    const mockLogger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitClientService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<RateLimitClientService>(RateLimitClientService);
  });

  it('resolves its own rate-limit Redis workload, not the shared cache one', () => {
    expect(mockConfigService.get).toHaveBeenCalledWith('REDIS_RATELIMIT_URL');
    expect(mockConfigService.get).toHaveBeenCalledWith('REDIS_RATELIMIT_DB');
    // Must not read the cache workload's keys — the whole point is isolation.
    expect(mockConfigService.get).not.toHaveBeenCalledWith('REDIS_CACHE_URL');
  });

  it('exposes the isolated client and its readiness for fail-open gating', () => {
    expect(service.instance).toBe(mockRedisClient);
    mockRedisClient.status = 'ready';
    expect(service.isReady).toBe(true);
    mockRedisClient.status = 'connecting';
    expect(service.isReady).toBe(false);
    mockRedisClient.status = 'ready';
  });
});
