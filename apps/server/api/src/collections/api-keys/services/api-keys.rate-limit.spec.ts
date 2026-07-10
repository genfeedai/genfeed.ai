import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { SubscriptionTier } from '@genfeedai/enums';
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
  zremrangebyscore: ReturnType<typeof vi.fn>;
  zcard: ReturnType<typeof vi.fn>;
  zadd: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
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

function buildRedisClient(requestCount: number): RedisClientMock {
  return {
    expire: vi.fn().mockResolvedValue(1),
    zadd: vi.fn().mockResolvedValue(1),
    zcard: vi.fn().mockResolvedValue(requestCount),
    zremrangebyscore: vi.fn().mockResolvedValue(0),
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

      await expect(service.checkRateLimit(buildApiKey())).resolves.toBe(false);
      expect(service.__getPublisher).not.toHaveBeenCalled();
    });

    it('allows enterprise (uncapped) without touching Redis', async () => {
      const service = createHarness();
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.ENTERPRISE,
      });

      await expect(service.checkRateLimit(buildApiKey())).resolves.toBe(true);
      expect(service.__getPublisher).not.toHaveBeenCalled();
    });

    it('allows a paid tier while under its per-minute ceiling', async () => {
      const client = buildRedisClient(10);
      const service = createHarness(client);
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.PRO,
      });

      await expect(service.checkRateLimit(buildApiKey())).resolves.toBe(true);
      expect(client.zadd).toHaveBeenCalled();
    });

    it('denies a paid tier once its per-minute ceiling is reached', async () => {
      const client = buildRedisClient(300);
      const service = createHarness(client);
      service.__findUnique.mockResolvedValue({
        subscriptionTier: SubscriptionTier.PRO,
      });

      await expect(service.checkRateLimit(buildApiKey())).resolves.toBe(false);
      expect(client.zadd).not.toHaveBeenCalled();
    });
  });
});
