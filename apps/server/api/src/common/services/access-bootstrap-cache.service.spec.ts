import {
  type AccessBootstrapCachePayload,
  AccessBootstrapCacheService,
} from '@api/common/services/access-bootstrap-cache.service';
import { MemberRole } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface Entry {
  ttl: number;
  value: string;
}

const makePayload = (
  organizationId = 'org-1',
): AccessBootstrapCachePayload => ({
  access: {
    brandId: 'brand-1',
    creditsBalance: 100,
    hasDismissedAssetGate: false,
    hasEverHadCredits: true,
    hasGeneratedFirstAsset: false,
    isOnboardingCompleted: true,
    isSuperAdmin: false,
    memberRole: MemberRole.OWNER,
    organizationId,
    subscriptionStatus: 'active',
    subscriptionTier: 'scale',
    userId: 'user-1',
  },
  brands: [],
  currentUser: null,
  fleetCapabilities: null,
  settings: null,
  streak: null,
});

describe('AccessBootstrapCacheService', () => {
  let errors: string[];
  let isRedisDown: boolean;
  let isRedisConfigured: boolean;
  let sets: Map<string, { members: Set<string>; ttl: number }>;
  let strings: Map<string, Entry>;
  let service: AccessBootstrapCacheService;

  beforeEach(() => {
    errors = [];
    isRedisDown = false;
    isRedisConfigured = true;
    sets = new Map();
    strings = new Map();

    // An in-memory Redis: string keys with their TTL, sets, and a glob SCAN
    // that pages two keys at a time.
    const reachable = <T>(result: () => T) =>
      isRedisDown
        ? Promise.reject(new Error('Redis down'))
        : Promise.resolve(result());
    const allKeys = () => [...strings.keys(), ...sets.keys()];
    const publisher = {
      expire: (key: string, ttl: number) =>
        reachable(() => {
          const set = sets.get(key);
          if (set) {
            set.ttl = ttl;
          }
          return set ? 1 : 0;
        }),
      get: (key: string) => reachable(() => strings.get(key)?.value ?? null),
      sadd: (key: string, member: string) =>
        reachable(() => {
          const set = sets.get(key) ?? { members: new Set<string>(), ttl: -1 };
          set.members.add(member);
          sets.set(key, set);
          return 1;
        }),
      scan: (cursor: string, _match: 'MATCH', pattern: string) =>
        reachable(() => {
          const matcher = new RegExp(
            `^${pattern
              .split('*')
              .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
              .join('.*')}$`,
          );
          const matched = allKeys().filter((key) => matcher.test(key));
          const start = Number(cursor);
          const next = start + 2 < matched.length ? String(start + 2) : '0';
          return [next, matched.slice(start, start + 2)];
        }),
      setex: (key: string, ttl: number, value: string) =>
        reachable(() => {
          strings.set(key, { ttl, value });
          return 'OK';
        }),
      smembers: (key: string) =>
        reachable(() => [...(sets.get(key)?.members ?? [])]),
      unlink: (keys: string | string[]) =>
        reachable(
          () =>
            [keys]
              .flat()
              .filter((key) => strings.delete(key) || sets.delete(key)).length,
        ),
    };
    const redis = {
      getPublisher: () => (isRedisConfigured ? publisher : null),
    } as unknown as RedisService;
    const logger = {
      debug: () => undefined,
      error: (message: string) => {
        errors.push(message);
      },
    } as unknown as LoggerService;

    service = new AccessBootstrapCacheService(redis, logger);
  });

  it('stores a snapshot for 30 seconds and indexes it under the user for an hour', async () => {
    const payload = makePayload();

    await service.set('user-1', 'org-1', payload);

    expect(strings.get('access-bootstrap:user-1:org-1')).toEqual({
      ttl: 30,
      value: JSON.stringify(payload),
    });
    expect(sets.get('access-bootstrap:keys:user-1')).toEqual({
      members: new Set(['access-bootstrap:user-1:org-1']),
      ttl: 3_600,
    });
  });

  it('reads back the snapshot of that user and organization only', async () => {
    const payload = makePayload();
    await service.set('user-1', 'org-1', payload);

    await expect(service.get('user-1', 'org-1')).resolves.toEqual(payload);
    await expect(service.get('user-1', 'org-2')).resolves.toBeNull();
    await expect(service.get('user-2', 'org-1')).resolves.toBeNull();
  });

  it('drops every organization snapshot of a user and the index', async () => {
    await service.set('user-1', 'org-1', makePayload('org-1'));
    await service.set('user-1', 'org-2', makePayload('org-2'));
    await service.set('user-2', 'org-1', makePayload('org-1'));

    await service.invalidateForUser('user-1');

    expect(allKeysSorted()).toEqual([
      'access-bootstrap:keys:user-2',
      'access-bootstrap:user-2:org-1',
    ]);
  });

  it('drops the empty index of a user without snapshots', async () => {
    sets.set('access-bootstrap:keys:user-1', { members: new Set(), ttl: 10 });

    await service.invalidateForUser('user-1');

    expect(sets.size).toBe(0);
  });

  it('drops every user snapshot of an organization across scan pages', async () => {
    await service.set('user-1', 'org-1', makePayload('org-1'));
    await service.set('user-2', 'org-1', makePayload('org-1'));
    await service.set('user-3', 'org-1', makePayload('org-1'));
    await service.set('user-1', 'org-2', makePayload('org-2'));

    await service.invalidateForOrganization('org-1');

    expect([...strings.keys()]).toEqual(['access-bootstrap:user-1:org-2']);
  });

  it('leaves the cache alone when an organization has no snapshots', async () => {
    await service.set('user-1', 'org-2', makePayload('org-2'));

    await service.invalidateForOrganization('org-1');

    expect([...strings.keys()]).toEqual(['access-bootstrap:user-1:org-2']);
  });

  it('works as a cache miss without Redis', async () => {
    isRedisConfigured = false;

    await service.set('user-1', 'org-1', makePayload());
    await service.invalidateForUser('user-1');
    await service.invalidateForOrganization('org-1');

    await expect(service.get('user-1', 'org-1')).resolves.toBeNull();
    expect(strings.size).toBe(0);
    expect(errors).toEqual([]);
  });

  it.each([
    [
      'read',
      (cache: AccessBootstrapCacheService) => cache.get('user-1', 'org-1'),
      null,
      'Failed to read access bootstrap cache for user user-1',
    ],
    [
      'write',
      (cache: AccessBootstrapCacheService) =>
        cache.set('user-1', 'org-1', makePayload()),
      undefined,
      'Failed to write access bootstrap cache for user user-1',
    ],
    [
      'user invalidation',
      (cache: AccessBootstrapCacheService) => cache.invalidateForUser('user-1'),
      undefined,
      'Failed to invalidate access bootstrap cache for user user-1',
    ],
    [
      'organization invalidation',
      (cache: AccessBootstrapCacheService) =>
        cache.invalidateForOrganization('org-1'),
      undefined,
      'Failed to invalidate access bootstrap cache for organization org-1',
    ],
  ])(
    'logs and swallows a Redis outage on %s',
    async (_op, run, expected, logged) => {
      isRedisDown = true;

      await expect(run(service)).resolves.toBe(expected);
      expect(errors).toEqual([logged]);
    },
  );

  function allKeysSorted() {
    return [...strings.keys(), ...sets.keys()].sort();
  }
});
