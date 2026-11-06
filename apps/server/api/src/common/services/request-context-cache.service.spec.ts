import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';

describe('RequestContextCacheService', () => {
  // A small Redis: string keys plus the per-user key sets. SCAN returns one
  // key per page so multi-page scans are exercised.
  let strings: Map<string, string>;
  let sets: Map<string, Set<string>>;
  let failing: { scan?: Error; smembers?: Error };
  let isRedisConnected: boolean;
  let logs: Array<{ level: string; message: string }>;
  let service: RequestContextCacheService;

  const globToRegExp = (pattern: string) =>
    new RegExp(
      `^${pattern
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
    );

  const publisher = {
    scan: async (cursor: string, _match: string, pattern: string) => {
      if (failing.scan) throw failing.scan;
      const matching = [...strings.keys()].filter((key) =>
        globToRegExp(pattern).test(key),
      );
      const index = Number(cursor);
      const next = index + 1 < matching.length ? String(index + 1) : '0';
      return [next, matching.slice(index, index + 1)];
    },
    smembers: async (key: string) => {
      if (failing.smembers) throw failing.smembers;
      return [...(sets.get(key) ?? [])];
    },
    unlink: async (...args: Array<string | string[]>) => {
      const keys = args.flat();
      for (const key of keys) {
        strings.delete(key);
        sets.delete(key);
      }
      return keys.length;
    },
  };

  beforeEach(() => {
    strings = new Map([
      ['rc:user_abc:org1', '{}'],
      ['rc:user_abc:org2', '{}'],
      ['rc:user1:org_xyz', '{}'],
      ['rc:user2:org_xyz:brand1', '{}'],
      ['rc:user3:org_other', '{}'],
    ]);
    sets = new Map([
      ['rc:keys:user_abc', new Set(['rc:user_abc:org1', 'rc:user_abc:org2'])],
      ['rc:keys:user_empty', new Set()],
    ]);
    failing = {};
    isRedisConnected = true;
    logs = [];

    const record = (level: string) => (message: string) => {
      logs.push({ level, message });
    };
    service = new RequestContextCacheService(
      {
        getPublisher: () => (isRedisConnected ? publisher : null),
      } as unknown as RedisService,
      {
        debug: record('debug'),
        error: record('error'),
        warn: record('warn'),
      } as unknown as LoggerService,
    );
  });

  describe('invalidateForUser', () => {
    it('evicts every cached context of the user and the key set itself', async () => {
      await service.invalidateForUser('user_abc');

      expect([...strings.keys()]).toEqual([
        'rc:user1:org_xyz',
        'rc:user2:org_xyz:brand1',
        'rc:user3:org_other',
      ]);
      expect(sets.has('rc:keys:user_abc')).toBe(false);
      expect(logs).toEqual([
        {
          level: 'debug',
          message: 'Invalidated 2 context key(s) for user user_abc',
        },
      ]);
    });

    it('drops an empty key set without touching other contexts', async () => {
      await service.invalidateForUser('user_empty');

      expect(sets.has('rc:keys:user_empty')).toBe(false);
      expect(strings.size).toBe(5);
    });

    it('does nothing when Redis is unavailable', async () => {
      isRedisConnected = false;

      await service.invalidateForUser('user_abc');

      expect(sets.has('rc:keys:user_abc')).toBe(true);
      expect(strings.size).toBe(5);
    });

    it('logs and swallows a Redis failure', async () => {
      failing.smembers = new Error('Redis connection lost');

      await expect(
        service.invalidateForUser('user_abc'),
      ).resolves.toBeUndefined();

      expect(logs).toEqual([
        {
          level: 'error',
          message: 'Failed to invalidate context for user user_abc',
        },
      ]);
    });
  });

  describe('invalidateForOrganization', () => {
    it('evicts every context of the organization across scan pages', async () => {
      await service.invalidateForOrganization('org_xyz');

      expect([...strings.keys()]).toEqual([
        'rc:user_abc:org1',
        'rc:user_abc:org2',
        'rc:user3:org_other',
      ]);
      expect(logs).toEqual([
        {
          level: 'debug',
          message: 'Invalidated 2 context key(s) for organization org_xyz',
        },
      ]);
    });

    it('reports zero when no context matches', async () => {
      await service.invalidateForOrganization('org_empty');

      expect(strings.size).toBe(5);
      expect(logs).toEqual([
        {
          level: 'debug',
          message: 'Invalidated 0 context key(s) for organization org_empty',
        },
      ]);
    });

    it('does nothing when Redis is unavailable', async () => {
      isRedisConnected = false;

      await service.invalidateForOrganization('org_xyz');

      expect(strings.size).toBe(5);
    });

    it('logs and swallows a scan failure', async () => {
      failing.scan = new Error('SCAN failed');

      await expect(
        service.invalidateForOrganization('org_xyz'),
      ).resolves.toBeUndefined();

      expect(strings.size).toBe(5);
      expect(logs).toEqual([
        {
          level: 'error',
          message: 'Failed to invalidate context for organization org_xyz',
        },
      ]);
    });
  });
});
