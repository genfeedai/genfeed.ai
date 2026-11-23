import { RELEASE_OWNED_CLAIM_SCRIPT } from '@api/services/cache/cache-claim-scripts';
import type { CacheClientService } from '@api/services/cache/cache-client.service';
import { CacheLocks } from '@api/services/cache/cache-locks';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@genfeedai/utils/model-checking/interleaving-explorer';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

/**
 * Two processes run the same job under one lock, and the lock may expire at
 * any moment (a slow holder outlives its TTL). The model tries every order of
 * their Redis commands against the real `CacheLocks` and a Redis double whose
 * commands are atomic steps.
 *
 * Harm it rules out: a holder's release deleting a lock another holder owns.
 * Before the owner token, a holder that outlived its TTL deleted the lock of
 * the process that had taken over, so a third process entered while the
 * second was still working.
 */

const LOCK_KEY = 'lock:job';

type World = {
  foreignRelease: string | null;
  store: Map<string, { value: string; writer: string }>;
};

function redisFor(actor: string, sim: Simulation, world: World) {
  const reply = <T>(value: T): T => {
    sim.observed(value);
    return value;
  };
  return {
    del: async (key: string) => {
      await sim.step(`${actor}: redis DEL ${key}`);
      const entry = world.store.get(key);
      if (entry && entry.writer !== actor) {
        world.foreignRelease = `${actor} deleted the lock ${entry.writer} owns`;
      }
      return reply(world.store.delete(key) ? 1 : 0);
    },
    eval: async (script: string, _keys: number, key: string, token: string) => {
      if (script !== RELEASE_OWNED_CLAIM_SCRIPT) {
        throw new Error('The model does not know this script.');
      }
      await sim.step(`${actor}: redis EVAL release`);
      if (world.store.get(key)?.value !== token) return reply(0);
      world.store.delete(key);
      return reply(1);
    },
    set: async (key: string, value: string) => {
      await sim.step(`${actor}: redis SET NX ${key}`);
      if (world.store.has(key)) return reply(null);
      world.store.set(key, { value, writer: actor });
      return reply('OK');
    },
  };
}

type Locks = {
  run: (
    lockKey: string,
    fn: () => Promise<unknown>,
    ttlSeconds: number,
  ) => Promise<unknown>;
};

/** `CacheLocks` as it was: a timestamp for a value and an unconditional DEL. */
class LocksBefore {
  constructor(
    private readonly client: {
      del: (key: string) => Promise<number>;
      set: (key: string, value: string) => Promise<string | null>;
    },
  ) {}

  async run(
    lockKey: string,
    fn: () => Promise<unknown>,
  ): Promise<unknown | null> {
    const key = `lock:${lockKey}`;
    if ((await this.client.set(key, Date.now().toString())) !== 'OK') {
      return null;
    }
    try {
      return await fn();
    } finally {
      await this.client.del(key);
    }
  }
}

function lockScenario(
  makeLocks: (client: ReturnType<typeof redisFor>) => Locks,
): () => Scenario {
  return () => {
    const world: World = { foreignRelease: null, store: new Map() };
    let expired = false;
    return {
      final: () =>
        world.store.size === 0 ? null : 'a lock outlived both holders',
      invariant: () => world.foreignRelease,
      snapshot: () =>
        JSON.stringify([[...world.store.entries()], world.foreignRelease]),
      start: (sim) => {
        sim.environment(
          'the lock expires',
          () => !expired && world.store.has(LOCK_KEY),
          () => {
            expired = true;
            world.store.delete(LOCK_KEY);
          },
        );
        for (const actor of ['A', 'B']) {
          const locks = makeLocks(redisFor(actor, sim, world));
          sim.spawn(actor, () =>
            locks.run('job', () => sim.step(`${actor}: works`), 300),
          );
        }
      },
    };
  };
}

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as LoggerService;

describe('CacheLocks model', () => {
  it('never lets a holder release a lock another holder owns', async () => {
    const result = await explore(
      lockScenario(
        (client) =>
          new CacheLocks(
            {
              instance: client,
              isReady: true,
            } as unknown as CacheClientService,
            logger,
          ),
      ),
    );

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(10);
  });

  it('finds the release that deleted the new owner lock before the owner token', async () => {
    const result = await explore(
      lockScenario((client) => new LocksBefore(client) as unknown as Locks),
    );

    expect(result.violation?.message).toMatch(/deleted the lock . owns/);
    expect(result.violation?.trace).toContain('environment: the lock expires');
  });
});
