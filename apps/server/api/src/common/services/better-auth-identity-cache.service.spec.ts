import type { IBetterAuthResolvedIdentity } from '@api/auth/better-auth/better-auth.types';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';

/**
 * Key-value stand-in for the publisher. `eval` mirrors the guarded-write
 * script; the real script runs in better-auth-identity-cache.integration.spec.
 */
class FakePublisher {
  readonly store = new Map<string, string>();
  isFailing = false;

  private guard(): void {
    if (this.isFailing) {
      throw new Error('redis down');
    }
  }

  async get(key: string): Promise<string | null> {
    this.guard();
    return this.store.get(key) ?? null;
  }

  async eval(
    _script: string,
    _keyCount: number,
    identityKey: string,
    epochKey: string,
    expectedEpoch: string,
    _ttl: string,
    serialized: string,
  ): Promise<number> {
    this.guard();
    if ((this.store.get(epochKey) ?? '0') !== expectedEpoch) {
      return 0;
    }
    this.store.set(identityKey, serialized);
    return 1;
  }

  multi() {
    const steps: Array<() => void> = [];
    const chain = {
      exec: async () => {
        this.guard();
        for (const step of steps) {
          step();
        }
        return [];
      },
      expire: () => chain,
      incr: (key: string) => {
        steps.push(() =>
          this.store.set(key, String(Number(this.store.get(key) ?? '0') + 1)),
        );
        return chain;
      },
      unlink: (key: string) => {
        steps.push(() => this.store.delete(key));
        return chain;
      },
    };
    return chain;
  }
}

describe('BetterAuthIdentityCacheService', () => {
  const identity: IBetterAuthResolvedIdentity = {
    brandId: 'brand-1',
    isSuperAdmin: false,
    organizationId: 'org-1',
    userId: 'user-1',
  };
  const errors: unknown[] = [];

  let publisher: FakePublisher | null;
  let service: BetterAuthIdentityCacheService;

  beforeEach(() => {
    errors.length = 0;
    publisher = new FakePublisher();
    service = new BetterAuthIdentityCacheService(
      { getPublisher: () => publisher } as unknown as RedisService,
      {
        error: (message: string) => errors.push(message),
      } as unknown as LoggerService,
    );
  });

  it('returns null on a miss and the parsed identity on a hit', async () => {
    await expect(service.get('user-1')).resolves.toBeNull();

    await service.setIfUnchanged('user-1', identity, '0');

    await expect(service.get('user-1')).resolves.toEqual(identity);
  });

  it('skips a write whose epoch is stale after an invalidation', async () => {
    const epoch = await service.readEpoch('user-1');
    await service.invalidateForUser('user-1');

    await service.setIfUnchanged('user-1', identity, epoch);

    await expect(service.get('user-1')).resolves.toBeNull();
    await expect(service.readEpoch('user-1')).resolves.toBe('1');
  });

  it('removes a cached identity on invalidation', async () => {
    await service.setIfUnchanged('user-1', identity, '0');

    await service.invalidateForUser('user-1');

    await expect(service.get('user-1')).resolves.toBeNull();
  });

  it('does not write without an epoch', async () => {
    await service.setIfUnchanged('user-1', identity, null);

    await expect(service.get('user-1')).resolves.toBeNull();
  });

  it('reads, writes and invalidates as a no-op when Redis is unavailable', async () => {
    publisher = null;

    await expect(service.get('user-1')).resolves.toBeNull();
    await expect(service.readEpoch('user-1')).resolves.toBeNull();
    await expect(
      service.setIfUnchanged('user-1', identity, '0'),
    ).resolves.toBeUndefined();
    await expect(service.invalidateForUser('user-1')).resolves.toBeUndefined();
  });

  it('swallows and logs Redis failures', async () => {
    publisher?.store.set('ba-identity:user-1', JSON.stringify(identity));
    if (publisher) {
      publisher.isFailing = true;
    }

    await expect(service.get('user-1')).resolves.toBeNull();
    await expect(service.readEpoch('user-1')).resolves.toBeNull();
    await expect(
      service.setIfUnchanged('user-1', identity, '0'),
    ).resolves.toBeUndefined();
    await expect(service.invalidateForUser('user-1')).resolves.toBeUndefined();
    expect(errors).toHaveLength(4);
  });
});
