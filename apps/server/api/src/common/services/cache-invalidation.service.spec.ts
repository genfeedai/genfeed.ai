import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { CacheClientService } from '@api/services/cache/cache-client.service';
import type { CacheTagsService } from '@api/services/cache/cache-tags.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('CacheInvalidationService', () => {
  let keys: Set<string>;
  let tagged: Map<string, string[]>;
  let isRedisDown: boolean;
  let unlinkCalls: number;
  let errors: string[];
  let service: CacheInvalidationService;

  beforeEach(() => {
    keys = new Set([
      'brands:list:org1',
      'brands:single:id1',
      'users:profile:user-123',
      'usercontroller:list',
      'other:key',
    ]);
    tagged = new Map([
      ['user:user-123', ['users:profile:user-123']],
      ['usercontroller', ['usercontroller:list']],
      ['user', ['users:profile:user-123']],
      ['profile', ['users:profile:user-123', 'other:key']],
    ]);
    isRedisDown = false;
    unlinkCalls = 0;
    errors = [];

    const redis = {
      unlink: async (toRemove: string[]) => {
        unlinkCalls += 1;
        if (isRedisDown) {
          throw new Error('Redis unavailable');
        }
        const before = keys.size;
        for (const key of toRemove) {
          keys.delete(key);
        }
        return before - keys.size;
      },
    };
    const cacheTags = {
      invalidateByTags: async (tags: string[]) => {
        if (isRedisDown) {
          throw new Error('Redis unavailable');
        }
        const toRemove = new Set(tags.flatMap((tag) => tagged.get(tag) ?? []));
        const before = keys.size;
        for (const key of toRemove) {
          keys.delete(key);
        }
        return before - keys.size;
      },
    };

    service = new CacheInvalidationService(
      { instance: redis } as unknown as CacheClientService,
      cacheTags as unknown as CacheTagsService,
      {
        debug: () => undefined,
        error: (message: string) => {
          errors.push(message);
        },
        warn: () => undefined,
      } as unknown as LoggerService,
    );
  });

  describe('invalidate', () => {
    it('removes exactly the given keys', async () => {
      await service.invalidate('brands:list:org1', 'brands:single:id1');

      expect([...keys]).toEqual([
        'users:profile:user-123',
        'usercontroller:list',
        'other:key',
      ]);
    });

    it('does not reach Redis when no keys are given', async () => {
      await service.invalidate();

      expect(unlinkCalls).toBe(0);
      expect(keys.size).toBe(5);
    });

    it('swallows and logs a Redis error', async () => {
      isRedisDown = true;

      await expect(service.invalidate('some:key')).resolves.toBeUndefined();
      expect(errors).toEqual(['CacheInvalidationService invalidate error']);
    });
  });

  describe('invalidateByTags', () => {
    it('removes every key under the tags and returns the count', async () => {
      const count = await service.invalidateByTags(['user', 'profile']);

      expect(count).toBe(2);
      expect(keys.has('users:profile:user-123')).toBe(false);
      expect(keys.has('other:key')).toBe(false);
      expect(keys.has('brands:list:org1')).toBe(true);
    });

    it('returns 0 and logs on error', async () => {
      isRedisDown = true;

      const count = await service.invalidateByTags(['user']);

      expect(count).toBe(0);
      expect(errors).toEqual([
        'CacheInvalidationService invalidateByTags error',
      ]);
    });
  });

  it.each([
    [
      'invalidateForUser',
      () => service.invalidateForUser('user-123'),
      'users:profile:user-123',
    ],
    [
      'invalidateForController (lowercased)',
      () => service.invalidateForController('UserController'),
      'usercontroller:list',
    ],
  ])('%s removes only the keys under its tag', async (_case, act, removed) => {
    await act();

    expect(keys.has(removed)).toBe(false);
    expect(keys.size).toBe(4);
  });
});
