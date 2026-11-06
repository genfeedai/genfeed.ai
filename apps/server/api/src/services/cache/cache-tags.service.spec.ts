import type { CacheClientService } from '@api/services/cache/cache-client.service';
import { CacheTagsService } from '@api/services/cache/cache-tags.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';

type Log = { context: Record<string, unknown>; level: string; message: string };

/**
 * A Redis keyspace of plain values and sets with MULTI pipelines, plus a
 * logger that records what it was told. `failing` makes the named command
 * reject the way a dropped connection does.
 */
function buildService(
  options: { failing?: 'exec' | 'smembers'; isReady?: boolean } = {},
) {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const logs: Log[] = [];
  const redis = {
    multi: () => {
      const queued: (() => void)[] = [];
      const pipeline = {
        del: (key: string) => {
          queued.push(() => {
            values.delete(key);
            sets.delete(key);
          });
          return pipeline;
        },
        exec: async () => {
          if (options.failing === 'exec') throw new Error('pipeline error');
          for (const command of queued) command();
          return [];
        },
        sadd: (key: string, member: string) => {
          queued.push(() => {
            sets.set(key, (sets.get(key) ?? new Set()).add(member));
          });
          return pipeline;
        },
      };
      return pipeline;
    },
    smembers: async (key: string) => {
      if (options.failing === 'smembers') throw new Error('redis down');
      return [...(sets.get(key) ?? [])];
    },
  };
  const record =
    (level: string) => (message: string, context: Record<string, unknown>) =>
      logs.push({ context, level, message });
  const service = new CacheTagsService(
    {
      instance: redis,
      isReady: options.isReady ?? true,
    } as unknown as CacheClientService,
    {
      debug: record('debug'),
      error: record('error'),
      log: record('log'),
      warn: record('warn'),
    } as unknown as LoggerService,
  );
  return { logs, service, sets, values };
}

describe('CacheTagsService', () => {
  it('adds the key to every tag set', async () => {
    const { service, sets } = buildService();

    await service.setTags('posts:123', ['org:abc', 'brand:xyz']);

    expect(sets).toEqual(
      new Map([
        ['tag:org:abc', new Set(['posts:123'])],
        ['tag:brand:xyz', new Set(['posts:123'])],
      ]),
    );
  });

  it('writes nothing for an empty tag list or a cache that is not ready', async () => {
    const empty = buildService();
    const offline = buildService({ isReady: false });

    await empty.service.setTags('cache:key', []);
    await offline.service.setTags('cache:key', ['org:abc']);

    expect(empty.sets.size).toBe(0);
    expect(offline.sets.size).toBe(0);
  });

  it('logs instead of throwing when the setTags pipeline fails', async () => {
    const { logs, service } = buildService({ failing: 'exec' });

    await expect(service.setTags('key', ['tag1'])).resolves.toBeUndefined();

    expect(logs).toEqual([
      {
        context: expect.objectContaining({ key: 'key', tags: ['tag1'] }),
        level: 'error',
        message: expect.stringContaining('setTags error'),
      },
    ]);
  });

  it('returns 0 when a tag has no associated keys', async () => {
    const { logs, service } = buildService();

    await expect(service.invalidateByTags(['empty-tag'])).resolves.toBe(0);
    expect(logs).toEqual([]);
  });

  it('deletes every tagged key and the tag set, leaving other keys', async () => {
    const { service, sets, values } = buildService();
    values.set('key:1', 'one');
    values.set('key:2', 'two');
    values.set('key:untagged', 'kept');
    await service.setTags('key:1', ['my-tag']);
    await service.setTags('key:2', ['my-tag']);

    await expect(service.invalidateByTags(['my-tag'])).resolves.toBe(2);

    expect([...values.keys()]).toEqual(['key:untagged']);
    expect(sets.has('tag:my-tag')).toBe(false);
  });

  it('sums counts across tags and logs what it invalidated', async () => {
    const { logs, service } = buildService();
    await service.setTags('a:1', ['tag-a']);
    await service.setTags('b:1', ['tag-b']);
    await service.setTags('b:2', ['tag-b']);
    await service.setTags('b:3', ['tag-b']);

    await expect(service.invalidateByTags(['tag-a', 'tag-b'])).resolves.toBe(4);
    expect(logs).toEqual([
      {
        context: { tags: ['tag-a', 'tag-b'] },
        level: 'debug',
        message: expect.stringContaining('invalidated 4 keys'),
      },
    ]);
  });

  it('returns 0 and logs when invalidation fails', async () => {
    const { logs, service } = buildService({ failing: 'smembers' });

    await expect(service.invalidateByTags(['bad-tag'])).resolves.toBe(0);
    expect(logs).toEqual([
      {
        context: expect.objectContaining({ tags: ['bad-tag'] }),
        level: 'error',
        message: expect.stringContaining('invalidateByTags error'),
      },
    ]);
  });
});
