import type { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import {
  claimTrainingCreate,
  readTrainingIdempotencyKey,
} from '@api/collections/trainings/utils/training-create-claim.util';
import type { CacheService } from '@api/services/cache/cache.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

/** An in-memory cache with the owned-claim semantics the util relies on. */
function createCacheDouble(options: { available?: boolean } = {}) {
  const store = new Map<string, string>();
  const cache = {
    acquireOwnedClaim: async (key: string, token: string) => {
      if (options.available === false) return 'unavailable' as const;
      if (store.has(key)) return 'duplicate' as const;
      store.set(key, token);
      return 'claimed' as const;
    },
    get: async <T>(key: string): Promise<T | null> => {
      const value = store.get(key);
      return value === undefined ? null : (JSON.parse(value) as T);
    },
    releaseOwnedClaim: async (key: string, token: string) => {
      if (store.get(key) !== token) return false;
      store.delete(key);
      return true;
    },
    setOwnedClaimValue: async (
      claimKey: string,
      token: string,
      resultKey: string,
      value: unknown,
    ) => {
      if (store.get(claimKey) !== token) return false;
      store.set(resultKey, JSON.stringify(value));
      return true;
    },
  };
  return { cache: cache as unknown as CacheService, store };
}

const identity = { organizationId: 'org-1', userId: 'user-1' };
const dto = {
  label: 'Portrait',
  sources: ['b', 'a'],
  steps: 1000,
  trigger: 'TOK',
} as unknown as CreateTrainingDto;

describe('claimTrainingCreate', () => {
  it('answers a repeat of a finished request with the training it created', async () => {
    const { cache } = createCacheDouble();

    const first = await claimTrainingCreate(cache, identity, dto, 'key-1');
    expect(first.outcome).toBe('proceed');
    if (first.outcome === 'proceed') await first.commit('training-1');

    const repeat = await claimTrainingCreate(cache, identity, dto, 'key-1');

    expect(repeat).toEqual({ outcome: 'replay', trainingId: 'training-1' });
  });

  it('rejects a request that arrives while the first is still creating', async () => {
    const { cache } = createCacheDouble();
    await claimTrainingCreate(cache, identity, dto, 'key-1');

    await expect(
      claimTrainingCreate(cache, identity, dto, 'key-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets a failed request be retried with the same key', async () => {
    const { cache } = createCacheDouble();
    const first = await claimTrainingCreate(cache, identity, dto, 'key-1');
    if (first.outcome === 'proceed') await first.abandon();

    const retry = await claimTrainingCreate(cache, identity, dto, 'key-1');

    expect(retry.outcome).toBe('proceed');
  });

  it('treats the same key with a different body as a different training', async () => {
    const { cache } = createCacheDouble();
    const first = await claimTrainingCreate(cache, identity, dto, 'key-1');
    if (first.outcome === 'proceed') await first.commit('training-1');

    const edited = await claimTrainingCreate(
      cache,
      identity,
      { ...dto, steps: 2000 } as CreateTrainingDto,
      'key-1',
    );

    expect(edited.outcome).toBe('proceed');
  });

  it('ignores the order of the sources', async () => {
    const { cache } = createCacheDouble();
    const first = await claimTrainingCreate(cache, identity, dto, 'key-1');
    if (first.outcome === 'proceed') await first.commit('training-1');

    const reordered = await claimTrainingCreate(
      cache,
      identity,
      { ...dto, sources: ['a', 'b'] } as CreateTrainingDto,
      'key-1',
    );

    expect(reordered).toEqual({ outcome: 'replay', trainingId: 'training-1' });
  });

  it("keeps one user from replaying another user's key", async () => {
    const { cache } = createCacheDouble();
    const first = await claimTrainingCreate(cache, identity, dto, 'key-1');
    if (first.outcome === 'proceed') await first.commit('training-1');

    const other = await claimTrainingCreate(
      cache,
      { organizationId: 'org-1', userId: 'user-2' },
      dto,
      'key-1',
    );

    expect(other.outcome).toBe('proceed');
  });

  it('does not block a user when the cache is unreachable', async () => {
    const { cache } = createCacheDouble({ available: false });

    const claim = await claimTrainingCreate(cache, identity, dto, 'key-1');

    expect(claim.outcome).toBe('proceed');
  });
});

describe('readTrainingIdempotencyKey', () => {
  it('returns nothing for a missing or blank header', () => {
    expect(readTrainingIdempotencyKey(undefined)).toBeUndefined();
    expect(readTrainingIdempotencyKey('   ')).toBeUndefined();
  });

  it('trims the key', () => {
    expect(readTrainingIdempotencyKey('  key-1 ')).toBe('key-1');
  });

  it('refuses a key over 200 characters', () => {
    expect(() => readTrainingIdempotencyKey('k'.repeat(201))).toThrow(
      BadRequestException,
    );
  });
});
