import {
  AccessBootstrapCachePayload,
  AccessBootstrapCacheService,
} from '@api/common/services/access-bootstrap-cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('AccessBootstrapCacheService', () => {
  let service: AccessBootstrapCacheService;
  let publisher: {
    expire: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    sAdd: ReturnType<typeof vi.fn>;
    sMembers: ReturnType<typeof vi.fn>;
    setEx: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
    scanIterator: ReturnType<typeof vi.fn>;
  };
  let redisService: { getPublisher: ReturnType<typeof vi.fn> };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const makePayload = (
    overrides: Partial<AccessBootstrapCachePayload> = {},
  ): AccessBootstrapCachePayload => ({
    brandId: 'brand-1',
    creditsBalance: 100,
    hasEverHadCredits: true,
    isOnboardingCompleted: true,
    isSuperAdmin: false,
    organizationId: 'org-1',
    subscriptionStatus: 'active',
    subscriptionTier: 'pro',
    userId: 'user-1',
    ...overrides,
  });

  beforeEach(async () => {
    publisher = {
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      sAdd: vi.fn().mockResolvedValue(1),
      scanIterator: vi.fn(),
      setEx: vi.fn().mockResolvedValue('OK'),
      sMembers: vi.fn().mockResolvedValue([]),
      unlink: vi.fn().mockResolvedValue(1),
    };
    redisService = { getPublisher: vi.fn().mockReturnValue(publisher) };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessBootstrapCacheService,
        { provide: RedisService, useValue: redisService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<AccessBootstrapCacheService>(
      AccessBootstrapCacheService,
    );
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return null when publisher is unavailable', async () => {
      redisService.getPublisher.mockReturnValue(null);
      const result = await service.get('clerk-1', 'org-1');
      expect(result).toBeNull();
    });

    it('should return null when cache miss', async () => {
      publisher.get.mockResolvedValue(null);
      const result = await service.get('clerk-1', 'org-1');
      expect(result).toBeNull();
    });

    it('should return parsed payload on cache hit', async () => {
      const payload = makePayload();
      publisher.get.mockResolvedValue(JSON.stringify(payload));
      const result = await service.get('clerk-1', 'org-1');
      expect(result).toEqual(payload);
    });

    it('should use correct cache key format', async () => {
      await service.get('clerk-99', 'org-99');
      expect(publisher.get).toHaveBeenCalledWith(
        'access-bootstrap:clerk-99:org-99',
      );
    });

    it('should return null and log error on redis failure', async () => {
      publisher.get.mockRejectedValue(new Error('Redis down'));
      const result = await service.get('clerk-1', 'org-1');
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should do nothing when publisher is unavailable', async () => {
      redisService.getPublisher.mockReturnValue(null);
      await service.set('clerk-1', 'org-1', makePayload());
      expect(publisher.setEx).not.toHaveBeenCalled();
    });

    it('should call setEx, sAdd, and expire', async () => {
      const payload = makePayload();
      await service.set('clerk-1', 'org-1', payload);
      expect(publisher.setEx).toHaveBeenCalledWith(
        'access-bootstrap:clerk-1:org-1',
        30,
        JSON.stringify(payload),
      );
      expect(publisher.sAdd).toHaveBeenCalled();
      expect(publisher.expire).toHaveBeenCalled();
    });

    it('should log error on redis failure without throwing', async () => {
      publisher.setEx.mockRejectedValue(new Error('Redis write fail'));
      await expect(
        service.set('clerk-1', 'org-1', makePayload()),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('invalidateForUser', () => {
    it('should do nothing when publisher is unavailable', async () => {
      redisService.getPublisher.mockReturnValue(null);
      await service.invalidateForUser('clerk-1');
      expect(publisher.unlink).not.toHaveBeenCalled();
    });

    it('should unlink all user keys when found', async () => {
      publisher.sMembers.mockResolvedValue([
        'access-bootstrap:clerk-1:org-1',
        'access-bootstrap:clerk-1:org-2',
      ]);
      await service.invalidateForUser('clerk-1');
      expect(publisher.unlink).toHaveBeenCalledWith([
        'access-bootstrap:clerk-1:org-1',
        'access-bootstrap:clerk-1:org-2',
        'access-bootstrap:keys:clerk-1',
      ]);
    });

    it('should only unlink the keys set when no keys exist', async () => {
      publisher.sMembers.mockResolvedValue([]);
      await service.invalidateForUser('clerk-1');
      expect(publisher.unlink).toHaveBeenCalledWith(
        'access-bootstrap:keys:clerk-1',
      );
    });

    it('should log debug on success', async () => {
      publisher.sMembers.mockResolvedValue(['key1']);
      await service.invalidateForUser('clerk-1');
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should log error on redis failure without throwing', async () => {
      publisher.sMembers.mockRejectedValue(new Error('Redis error'));
      await expect(
        service.invalidateForUser('clerk-1'),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('invalidateForOrganization', () => {
    it('should do nothing when publisher is unavailable', async () => {
      redisService.getPublisher.mockReturnValue(null);
      await service.invalidateForOrganization('org-1');
      expect(publisher.unlink).not.toHaveBeenCalled();
    });

    it('should unlink matching keys found by scan', async () => {
      async function* asyncGen() {
        yield 'access-bootstrap:clerk-1:org-1';
      }
      publisher.scanIterator.mockReturnValue(asyncGen());

      await service.invalidateForOrganization('org-1');

      expect(publisher.unlink).toHaveBeenCalledWith([
        'access-bootstrap:clerk-1:org-1',
      ]);
    });

    it('should not call unlink when no keys matched', async () => {
      async function* emptyGen() {
        /* empty */
      }
      publisher.scanIterator.mockReturnValue(emptyGen());

      await service.invalidateForOrganization('org-1');

      expect(publisher.unlink).not.toHaveBeenCalled();
    });

    it('should log error on redis failure without throwing', async () => {
      publisher.scanIterator.mockImplementation(() => {
        throw new Error('Scan fail');
      });
      await expect(
        service.invalidateForOrganization('org-1'),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
