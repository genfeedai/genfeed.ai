import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { CacheService } from '@api/services/cache/cache.service';
import type { CacheClientService } from '@api/services/cache/cache-client.service';
import { CacheTagsService } from '@api/services/cache/cache-tags.service';
import type { LoggerService } from '@libs/logger/logger.service';
import Redis from 'ioredis';

const hasRedisServer =
  spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForPort(port: number): Promise<void> {
  await vi.waitFor(
    () =>
      new Promise<void>((resolve, reject) => {
        const socket = connect({ host: '127.0.0.1', port });
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('error', (error) => {
          socket.destroy();
          reject(error);
        });
      }),
    { interval: 50, timeout: 5_000 },
  );
}

/**
 * The guarded store is a Lua script, which an in-memory fake cannot run. This
 * starts a throwaway loopback `redis-server` when the binary exists and is
 * skipped where it does not.
 */
describe.skipIf(!hasRedisServer)('guarded cache store on a real Redis', () => {
  const TAGS = ['brands', 'public-brand-content'];
  let server: ChildProcess;
  let redis: Redis;
  let cache: CacheService;

  beforeAll(async () => {
    const port = await freePort();
    server = spawn(
      'redis-server',
      ['--port', String(port), '--bind', '127.0.0.1', '--save', ''],
      { stdio: 'ignore' },
    );
    await waitForPort(port);
    redis = new Redis({
      host: '127.0.0.1',
      lazyConnect: true,
      maxRetriesPerRequest: 20,
      port,
      retryStrategy: (attempt) => (attempt > 40 ? null : 50),
    });
    await redis.connect();
    const client = {
      instance: redis,
      isReady: true,
    } as unknown as CacheClientService;
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
    } as unknown as LoggerService;
    cache = new CacheService(
      client,
      new CacheTagsService(client, logger),
      logger,
    );
  });

  afterAll(async () => {
    await redis?.quit();
    server?.kill();
  });

  beforeEach(async () => {
    await redis.flushall();
  });

  it('stores a value when its tags were not invalidated since the epochs were read', async () => {
    const epochs = await cache.readTagEpochs(TAGS);

    const isStored = await cache.setUnlessTagsInvalidated(
      'public:brand:1',
      { name: 'Acme' },
      { tags: TAGS, ttl: 60 },
      epochs ?? [],
    );

    expect(isStored).toBe(true);
    expect(await cache.get('public:brand:1')).toEqual({ name: 'Acme' });
  });

  it('refuses a value read before an invalidation, even when no entry existed yet', async () => {
    const epochs = await cache.readTagEpochs(TAGS);

    await cache.invalidateGuardedTags(['public-brand-content']);
    const isStored = await cache.setUnlessTagsInvalidated(
      'public:brand:1',
      { name: 'Acme' },
      { tags: TAGS, ttl: 60 },
      epochs ?? [],
    );

    expect(isStored).toBe(false);
    expect(await cache.get('public:brand:1')).toBeNull();
  });

  it('deletes stored entries of the invalidated tag and leaves other tags alone', async () => {
    const epochs = await cache.readTagEpochs(TAGS);
    await cache.setUnlessTagsInvalidated(
      'public:brand:1',
      { name: 'Acme' },
      { tags: TAGS, ttl: 60 },
      epochs ?? [],
    );
    await cache.set('public:models', ['m1'], { tags: ['models'], ttl: 60 });

    await cache.invalidateGuardedTags(['public-brand-content']);

    expect(await cache.get('public:brand:1')).toBeNull();
    expect(await cache.get('public:models')).toEqual(['m1']);
  });

  it('accepts a value read after the invalidation', async () => {
    await cache.invalidateGuardedTags(['public-brand-content']);
    const epochs = await cache.readTagEpochs(TAGS);

    const isStored = await cache.setUnlessTagsInvalidated(
      'public:brand:1',
      { name: 'Acme' },
      { tags: TAGS, ttl: 60 },
      epochs ?? [],
    );

    expect(isStored).toBe(true);
  });
});
