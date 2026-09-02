import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { SubscriptionTier } from '@genfeedai/contracts';
import { vi } from 'vitest';

// Togglable deployment mode drives both the per-tier (cloud) and per-key
// (self-hosted) rate-limit paths.
let mockCloudMode = true;
vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return {
    ...actual,
    isCloudDeployment: () => mockCloudMode,
  };
});

type FindUniqueFn = ReturnType<typeof vi.fn>;

type RedisClientMock = {
  eval: ReturnType<typeof vi.fn>;
};

type RateLimitHarness = ApiKeysService & {
  __findUnique: FindUniqueFn;
  __getPublisher: ReturnType<typeof vi.fn>;
};

function buildApiKey(overrides: Partial<ApiKeyDocument> = {}): ApiKeyDocument {
  return {
    id: 'key-1',
    organizationId: 'org-1',
    rateLimit: 60,
    ...overrides,
  } as ApiKeyDocument;
}

/**
 * Mocks the atomic Lua script's [allowedFlag, count, referenceScoreMs]
 * response. `requestCount` is the count already in the window BEFORE this
 * call — if it is at/above `limit` the script blocks and returns that count
 * unchanged; otherwise it allows and reports `requestCount + 1`.
 */
function buildRedisClient(requestCount: number, limit = 60): RedisClientMock {
  const blocked = requestCount >= limit;
  return {
    eval: vi
      .fn()
      .mockResolvedValue(
        blocked
          ? [0, requestCount, Date.now()]
          : [1, requestCount + 1, Date.now()],
      ),
  };
}

function createHarness(redisClient?: RedisClientMock): RateLimitHarness {
  const service = Object.create(ApiKeysService.prototype) as RateLimitHarness;
  const findUnique = vi.fn();
  const getPublisher = vi.fn().mockReturnValue(redisClient ?? null);

  Object.defineProperty(service, 'prisma', {
    value: { organizationSetting: { findUnique } },
  });
  Object.defineProperty(service, 'redisService', {
    value: { getPublisher },
  });
  Object.defineProperty(service, 'logger', {
    value: { error: vi.fn(), warn: vi.fn() },
  });

  service.__findUnique = findUnique;
  service.__getPublisher = getPublisher;
  return service;
}

describe('ApiKeysService per-tier rate limiting', () => {
  beforeEach(() => {
    mockCloudMode = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveEffectiveRateLimit', () => {
    it('cloud: resolves the tier limit from OrganizationSetting', async () => {
      const service = createHarness();
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.PRO,
      });

      await expect(
        service.resolveEffectiveRateLimit(buildApiKey()),
      ).resolves.toBe(300);
      expect(service.__findUnique).toHaveBeenCalledWith({
        select: { subscriptionTier: true },
        where: { organizationId: 'org-1' },
      });
    });

    it('cloud: free tier resolves to 0 (no access)', async () => {
      const service = createHarness();
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.FREE,
      });

      await expect(
        service.resolveEffectiveRateLimit(buildApiKey()),
      ).resolves.toBe(0);
    });

    it('cloud: enterprise resolves to null (uncapped)', async () => {
      const service = createHarness();
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.ENTERPRISE,
      });

      await expect(
        service.resolveEffectiveRateLimit(buildApiKey()),
      ).resolves.toBeNull();
    });

    it('cloud: missing org setting default-denies (0)', async () => {
      const service = createHarness();
      service.__findUnique.mockResolvedValue(null);

      await expect(
        service.resolveEffectiveRateLimit(buildApiKey()),
      ).resolves.toBe(0);
    });

    it('non-cloud: honors the per-key limit and never reads the tier', async () => {
      mockCloudMode = false;
      const service = createHarness();

      await expect(
        service.resolveEffectiveRateLimit(buildApiKey({ rateLimit: 120 })),
      ).resolves.toBe(120);
      expect(service.__findUnique).not.toHaveBeenCalled();
    });

    it('non-cloud: a falsy per-key limit stays unlimited (null)', async () => {
      mockCloudMode = false;
      const service = createHarness();

      await expect(
        service.resolveEffectiveRateLimit(buildApiKey({ rateLimit: null })),
      ).resolves.toBeNull();
    });
  });

  describe('checkRateLimit', () => {
    it('denies free tier without touching Redis', async () => {
      const service = createHarness();
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.FREE,
      });

      await expect(
        service.checkRateLimit(buildApiKey()),
      ).resolves.toMatchObject({ allowed: false, limit: 0 });
      expect(service.__getPublisher).not.toHaveBeenCalled();
    });

    it('allows enterprise (uncapped) without touching Redis', async () => {
      const service = createHarness();
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.ENTERPRISE,
      });

      await expect(
        service.checkRateLimit(buildApiKey()),
      ).resolves.toMatchObject({ allowed: true, limit: null });
      expect(service.__getPublisher).not.toHaveBeenCalled();
    });

    it('allows a paid tier while under its per-minute ceiling via a single atomic eval call', async () => {
      const client = buildRedisClient(10);
      const service = createHarness(client);
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.PRO,
      });

      await expect(
        service.checkRateLimit(buildApiKey()),
      ).resolves.toMatchObject({ allowed: true, limit: 300 });
      expect(client.eval).toHaveBeenCalledTimes(1);
      expect(client.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'rateLimit:key-1',
        expect.any(String),
        expect.any(String),
        '300',
        expect.any(String),
        expect.any(String),
      );
    });

    it('denies a paid tier once its per-minute ceiling is reached and reports Retry-After', async () => {
      const client = buildRedisClient(300);
      const service = createHarness(client);
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.PRO,
      });

      const result = await service.checkRateLimit(buildApiKey());

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(300);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(client.eval).toHaveBeenCalledTimes(1);
    });

    it('fails open when the Lua eval call errors', async () => {
      const client: RedisClientMock = {
        eval: vi.fn().mockRejectedValue(new Error('redis down')),
      };
      const service = createHarness(client);
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.PRO,
      });

      await expect(
        service.checkRateLimit(buildApiKey()),
      ).resolves.toMatchObject({ allowed: true, limit: 300 });
    });
  });
});
