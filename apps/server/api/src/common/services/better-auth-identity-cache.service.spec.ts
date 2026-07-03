import type { IBetterAuthResolvedIdentity } from '@api/auth/better-auth/better-auth.types';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('BetterAuthIdentityCacheService', () => {
  let service: BetterAuthIdentityCacheService;
  let publisher: {
    get: ReturnType<typeof vi.fn>;
    setEx: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
  };
  let redisService: { getPublisher: ReturnType<typeof vi.fn> };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const identity: IBetterAuthResolvedIdentity = {
    brandId: 'brand-1',
    isSuperAdmin: false,
    organizationId: 'org-1',
    userId: 'user-1',
  };

  beforeEach(async () => {
    publisher = {
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn().mockResolvedValue('OK'),
      unlink: vi.fn().mockResolvedValue(1),
    };
    redisService = { getPublisher: vi.fn().mockReturnValue(publisher) };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BetterAuthIdentityCacheService,
        { provide: RedisService, useValue: redisService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(BetterAuthIdentityCacheService);
  });

  describe('get', () => {
    it('returns null when nothing is cached', async () => {
      await expect(service.get('user-1')).resolves.toBeNull();
      expect(publisher.get).toHaveBeenCalledWith('ba-identity:user-1');
    });

    it('returns the parsed identity on a hit', async () => {
      publisher.get.mockResolvedValue(JSON.stringify(identity));

      await expect(service.get('user-1')).resolves.toEqual(identity);
    });

    it('returns null when Redis is unavailable', async () => {
      redisService.getPublisher.mockReturnValue(null);

      await expect(service.get('user-1')).resolves.toBeNull();
    });

    it('returns null and logs when the read throws', async () => {
      publisher.get.mockRejectedValue(new Error('redis down'));

      await expect(service.get('user-1')).resolves.toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('writes the identity with a TTL', async () => {
      await service.set('user-1', identity);

      expect(publisher.setEx).toHaveBeenCalledWith(
        'ba-identity:user-1',
        expect.any(Number),
        JSON.stringify(identity),
      );
    });

    it('swallows write failures', async () => {
      publisher.setEx.mockRejectedValue(new Error('redis down'));

      await expect(service.set('user-1', identity)).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('invalidateForUser', () => {
    it('unlinks the identity key', async () => {
      await service.invalidateForUser('user-1');

      expect(publisher.unlink).toHaveBeenCalledWith('ba-identity:user-1');
    });

    it('swallows invalidation failures', async () => {
      publisher.unlink.mockRejectedValue(new Error('redis down'));

      await expect(
        service.invalidateForUser('user-1'),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
