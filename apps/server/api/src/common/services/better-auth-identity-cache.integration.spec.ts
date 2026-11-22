import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { connect, createServer } from 'node:net';
import type { IBetterAuthResolvedIdentity } from '@api/auth/better-auth/better-auth.types';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
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

const oldOrg: IBetterAuthResolvedIdentity = {
  isSuperAdmin: false,
  organizationId: 'org-old',
  userId: 'user-1',
};

/**
 * The guarded write is a Lua script, which an in-memory fake cannot run. This
 * starts a throwaway loopback `redis-server` and is skipped where none exists.
 */
describe.skipIf(!hasRedisServer)('identity cache on a real Redis', () => {
  let server: ChildProcess;
  let redis: Redis;
  let cache: BetterAuthIdentityCacheService;

  beforeAll(async () => {
    const port = await freePort();
    server = spawn(
      'redis-server',
      ['--port', String(port), '--bind', '127.0.0.1', '--save', ''],
      { stdio: 'ignore' },
    );
    await waitForPort(port);
    redis = new Redis({ host: '127.0.0.1', port });
    cache = new BetterAuthIdentityCacheService(
      { getPublisher: () => redis } as unknown as RedisService,
      { error: () => undefined } as unknown as LoggerService,
    );
  });

  afterAll(async () => {
    redis?.disconnect();
    server?.kill();
  });

  beforeEach(async () => {
    await redis.flushall();
  });

  it('stores the identity when nothing invalidated since the epoch was read', async () => {
    const epoch = await cache.readEpoch('user-1');
    await cache.setIfUnchanged('user-1', oldOrg, epoch);

    await expect(cache.get('user-1')).resolves.toEqual(oldOrg);
    expect(await redis.ttl('ba-identity:user-1')).toBeGreaterThan(0);
  });

  it('drops a write whose resolve started before an invalidation', async () => {
    const epoch = await cache.readEpoch('user-1');
    await cache.invalidateForUser('user-1');
    await cache.setIfUnchanged('user-1', oldOrg, epoch);

    await expect(cache.get('user-1')).resolves.toBeNull();

    const next = await cache.readEpoch('user-1');
    await cache.setIfUnchanged(
      'user-1',
      { ...oldOrg, organizationId: 'org-new' },
      next,
    );
    await expect(cache.get('user-1')).resolves.toMatchObject({
      organizationId: 'org-new',
    });
  });

  it('removes an existing entry on invalidation', async () => {
    await cache.setIfUnchanged(
      'user-1',
      oldOrg,
      await cache.readEpoch('user-1'),
    );
    await cache.invalidateForUser('user-1');

    await expect(cache.get('user-1')).resolves.toBeNull();
  });
});
