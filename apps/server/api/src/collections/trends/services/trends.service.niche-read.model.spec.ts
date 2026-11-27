import { TrendBrandNicheVideoService } from '@api/collections/trends/services/modules/trend-brand-niche-video.service';
import { TrendBrandReadService } from '@api/collections/trends/services/modules/trend-brand-read.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@genfeedai/utils/model-checking/interleaving-explorer';
import { describe, expect, it, vi } from 'vitest';

/**
 * Two people open the same brand's Trends at the same moment. The brand has no
 * niche videos yet, so each read may start the one paid TikTok search the first
 * read is allowed (#11429). This model runs the real `noteBrandRead`, the real
 * claim and the real niche cache over a Redis whose every command is an atomic
 * step, with a reader crashing before any step.
 *
 * Harm it states: one brand pays for two niche searches inside the claim window.
 */

const ORG = 'org-1';
const BRAND = 'brand-1';

type World = {
  redis: Map<string, string>;
  runs: number;
};

type CacheDouble = {
  claimOnce: (key: string, ttl: number, tags?: string[]) => Promise<string>;
  generateKey: (...parts: string[]) => string;
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<boolean>;
};

/** Every Redis command is one step, like the real server. */
function redisFor(sim: Simulation, world: World): CacheDouble {
  return {
    claimOnce: async (key) => {
      await sim.step(`redis SET NX ${key.split(':')[1]}`);
      if (world.redis.has(key)) return 'duplicate';
      world.redis.set(key, '1');
      return 'claimed';
    },
    generateKey: (...parts) => parts.join(':'),
    get: async (key) => {
      await sim.step(`redis GET ${key.split(':')[1]}`);
      const value = world.redis.get(key);
      sim.observed(value ?? null);
      return value ? JSON.parse(value) : null;
    },
    set: async (key, value) => {
      await sim.step(`redis SETEX ${key.split(':')[1]}`);
      world.redis.set(key, JSON.stringify(value));
      return true;
    },
  };
}

function apifyFor(sim: Simulation, world: World) {
  return {
    searchTikTokByQueries: async () => {
      await sim.step('apify niche search');
      world.runs += 1;
      return [{ externalId: 'video-1', platform: 'tiktok' }];
    },
  };
}

function serviceFor(sim: Simulation, world: World): TrendsService {
  const cache = redisFor(sim, world);
  const niche = new TrendBrandNicheVideoService(
    { log: vi.fn() } as never,
    cache as never,
    apifyFor(sim, world) as never,
  );
  return new TrendsService(
    { warn: vi.fn() } as never,
    { findOne: async () => ({ description: 'AI tools' }) } as never,
    {} as never,
    {
      getPreferences: async () => ({ keywords: ['ai influencers'] }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    niche,
    {} as never,
    new TrendBrandReadService(
      cache as never,
      { warn: vi.fn() } as never,
      niche,
      // Outside a plan check, a scan only runs what it is given.
      {
        runScan: (_input: unknown, run: () => Promise<number>) => run(),
      } as never,
    ),
  );
}

type Read = (actor: string) => Promise<void>;

function scenario(makeRead: (sim: Simulation, world: World) => Read) {
  return (): Scenario => {
    const world: World = { redis: new Map(), runs: 0 };
    return {
      invariant: () =>
        world.runs > 1
          ? `the brand paid for ${world.runs} niche searches inside one claim window`
          : null,
      snapshot: () =>
        JSON.stringify([[...world.redis.keys()].sort(), world.runs]),
      start: (sim) => {
        const read = makeRead(sim, world);
        sim.spawn('read 1', () => read('read 1'), { crashable: true });
        sim.spawn('read 2', () => read('read 2'), { crashable: true });
      },
    };
  };
}

function realRead(sim: Simulation, world: World): Read {
  const service = serviceFor(sim, world);
  return async () => {
    await service.noteBrandRead(ORG, BRAND);
  };
}

/**
 * The first design: look for a niche snapshot and, finding none, search. No
 * claim, so two reads that both see no snapshot both pay.
 */
function readWithoutClaim(sim: Simulation, world: World): Read {
  const cache = redisFor(sim, world);
  const niche = new TrendBrandNicheVideoService(
    { log: vi.fn() } as never,
    cache as never,
    apifyFor(sim, world) as never,
  );
  return async () => {
    if (await niche.hasSnapshot(ORG, BRAND)) return;
    await niche.fetchAndCache(ORG, BRAND, ['ai influencers']);
  };
}

describe('First read of a brand with no niche videos, every interleaving', () => {
  it('starts at most one niche search', async () => {
    const result = await explore(scenario(realRead));

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(10);
  });

  it('fails on a read that searches whenever it finds no snapshot', async () => {
    const result = await explore(scenario(readWithoutClaim));

    expect(result.violation).toEqual({
      message: 'the brand paid for 2 niche searches inside one claim window',
      trace: expect.arrayContaining([
        'read 1: redis GET brand-niche-videos',
        'read 2: redis GET brand-niche-videos',
      ]),
    });
  });
});
