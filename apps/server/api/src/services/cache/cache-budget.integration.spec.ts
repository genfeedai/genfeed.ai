import { randomUUID } from 'node:crypto';
import { CacheService } from '@api/services/cache/cache.service';
import type { CacheClientService } from '@api/services/cache/cache-client.service';
import type { CacheTagsService } from '@api/services/cache/cache-tags.service';
import type { LoggerService } from '@libs/logger/logger.service';
import Redis from 'ioredis';

const redisUrl = process.env.APIFY_BUDGET_TEST_REDIS_URL;
if (redisUrl) {
  const url = new URL(redisUrl);
  if (
    url.protocol !== 'redis:' ||
    !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'Budget integration Redis must be an unauthenticated loopback instance',
    );
  }
}

describe.skipIf(!redisUrl)('atomic counter budget with isolated Redis', () => {
  let redis: Redis;
  let services: CacheService[];
  const keys = new Set<string>();
  const key = () => {
    const value = `test:budget:${randomUUID()}`;
    keys.add(value);
    keys.add(`${value}:initialized`);
    return value;
  };
  beforeAll(async () => {
    if (!redisUrl) throw new Error('Missing isolated Redis URL');
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    await redis.connect();
    services = [0, 1].map(
      () =>
        new CacheService(
          { instance: redis, isReady: true } as unknown as CacheClientService,
          {} as CacheTagsService,
          { error: vi.fn() } as unknown as LoggerService,
        ),
    );
  });
  afterEach(async () => {
    if (keys.size) await redis.del(...keys);
    keys.clear();
  });
  afterAll(async () => {
    await redis?.quit();
  });

  it('initializes absent ledgers once and preserves existing values and expiry', async () => {
    const ledger = key();
    expect(await services[0].initializeCounterBudget(ledger, 70, 60)).toBe(
      true,
    );
    const expiresAt = await redis.pexpiretime(ledger);
    expect(await redis.get(`${ledger}:initialized`)).toBe('1');
    await redis.del(`${ledger}:initialized`);
    expect(await services[1].initializeCounterBudget(ledger, 0, 300)).toBe(
      true,
    );
    expect(await redis.get(ledger)).toBe('70');
    expect(await redis.pexpiretime(ledger)).toBe(expiresAt);
    expect(await redis.pexpiretime(`${ledger}:initialized`)).toBe(expiresAt);
    await redis.set(ledger, 'corrupt', 'PX', 60000);
    expect(await services[0].initializeCounterBudget(ledger, 0, 60)).toBe(
      false,
    );
    expect(await redis.get(ledger)).toBe('corrupt');
  });

  it('does not recreate a lost ledger while its continuity marker remains', async () => {
    const ledger = key();
    await redis.set(`${ledger}:initialized`, '1', 'PX', 60000);
    expect(await services[0].initializeCounterBudget(ledger, 0, 60)).toBe(
      false,
    );
    expect(await redis.exists(ledger)).toBe(0);
    expect(await redis.get(`${ledger}:initialized`)).toBe('1');
  });

  it('admits concurrent callers without overspending and issues distinct receipts', async () => {
    const ledger = key();
    await redis.set(ledger, '0', 'PX', 60000);
    const receipts = Array.from({ length: 50 }, key);
    const results = await Promise.all(
      receipts.map((receipt, index) =>
        services[index % 2].reserveCounterBudget(ledger, receipt, 1000, 70),
      ),
    );
    const allowed = results.filter((result) => result.status === 'reserved');
    expect(allowed.reduce((sum, result) => sum + result.reserved, 0)).toBe(
      1000,
    );
    expect(await redis.get(ledger)).toBe('1000');
    expect(allowed).toHaveLength(15);
    for (let index = 0; index < results.length; index++) {
      if (results[index].status !== 'reserved') continue;
      expect(await redis.hget(receipts[index], 'usageKey')).toBe(ledger);
      expect(
        Math.abs(
          (await redis.pttl(receipts[index])) - (await redis.pttl(ledger)),
        ),
      ).toBeLessThan(50);
    }
  });

  it.each([0, 70, 1200])(
    'settles concurrent replay once for actual %s, including zero delta and overages',
    async (actual) => {
      const ledger = key();
      const receipt = key();
      await redis.set(ledger, '0', 'PX', 60000);
      await services[0].reserveCounterBudget(ledger, receipt, 1000, 70);
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          services[index % 2].reconcileCounterReservation(
            ledger,
            receipt,
            70,
            actual,
          ),
        ),
      );
      expect(results.filter((result) => result === 'settled')).toHaveLength(1);
      expect(results.filter((result) => result === 'duplicate')).toHaveLength(
        19,
      );
      expect(await redis.get(ledger)).toBe(String(actual));
      expect(await redis.hget(receipt, 'actualMicroUsd')).toBe(String(actual));
      expect(
        await services[0].reconcileCounterReservation(ledger, receipt, 70, 1),
      ).toBe('duplicate');
      if (actual > 1000)
        expect(
          await services[0].reserveCounterBudget(ledger, key(), 1000, 70),
        ).toEqual({ status: 'exhausted' });
    },
  );

  it.each(['missing', 'negative', 'fraction', 'unsafe', 'hash', 'no-expiry'])(
    'retains invalid ledger state: %s',
    async (state) => {
      const ledger = key();
      const receipt = key();
      if (state === 'hash') await redis.hset(ledger, 'bad', 'value');
      else if (state !== 'missing')
        await redis.set(
          ledger,
          (
            {
              negative: '-1',
              fraction: '1.5',
              unsafe: '9007199254740992',
            } as Record<string, string>
          )[state] ?? '5',
        );
      if (state !== 'no-expiry' && state !== 'missing')
        await redis.pexpire(ledger, 60000);
      const original = await redis.dump(ledger);
      expect(
        await services[0].reserveCounterBudget(ledger, receipt, 1000, 70),
      ).toEqual({ status: 'unavailable' });
      expect(await redis.dump(ledger)).toBe(original);
      expect(await redis.exists(receipt)).toBe(0);
    },
  );

  it('retains missing, forged, corrupt and expired receipts without modifying ledgers', async () => {
    const ledger = key();
    const receipt = key();
    await redis.set(ledger, '70', 'PX', 60000);
    expect(
      await services[0].reconcileCounterReservation(ledger, receipt, 70, 0),
    ).toBe('unavailable');
    await redis.hset(
      receipt,
      'usageKey',
      ledger,
      'reserved',
      '70',
      'state',
      'reserved',
    );
    expect(
      await services[0].reconcileCounterReservation(ledger, receipt, 70, 0),
    ).toBe('unavailable');
    await redis.pexpire(receipt, 60000);
    expect(
      await services[0].reconcileCounterReservation(ledger, receipt, 69, 0),
    ).toBe('unavailable');
    await redis.hset(receipt, 'state', 'corrupt');
    expect(
      await services[0].reconcileCounterReservation(ledger, receipt, 70, 0),
    ).toBe('unavailable');
    expect(
      await services[0].reserveCounterBudget(ledger, receipt, 1000, 70),
    ).toEqual({ status: 'unavailable' });
    expect(await redis.get(ledger)).toBe('70');
  });

  it('settles only the original retained cycle and preserves expiry and safe integer precision', async () => {
    const old = key();
    const next = key();
    const receipt = key();
    await redis.set(old, String(Number.MAX_SAFE_INTEGER - 100), 'PX', 60000);
    await redis.set(next, '20', 'PX', 60000);
    await services[0].reserveCounterBudget(
      old,
      receipt,
      Number.MAX_SAFE_INTEGER,
      100,
    );
    expect(await redis.hget(receipt, 'reserved')).toBe('100');
    expect(
      await services[0].reconcileCounterReservation(old, receipt, 100, 101),
    ).toBe('unavailable');
    expect(
      await services[0].reconcileCounterReservation(next, receipt, 100, 0),
    ).toBe('unavailable');
    expect(
      await services[0].reconcileCounterReservation(old, receipt, 100, 0),
    ).toBe('settled');
    expect(await redis.get(old)).toBe(String(Number.MAX_SAFE_INTEGER - 100));
    expect(await redis.get(next)).toBe('20');
    expect(await redis.pttl(old)).toBeGreaterThan(59000);
    expect(await redis.pttl(receipt)).toBeGreaterThan(59000);
  });

  it('does not import our run when the provider reports it before settlement', async () => {
    const ledger = key();
    const receipt = key();
    keys.add(`${ledger}:snapshot`);
    keys.add(`${ledger}:settled`);
    keys.add(`${ledger}:outstanding`);
    await redis.set(ledger, '0', 'PX', 60_000);
    await services[0].initializeCounterBudget(ledger, 0, 60);
    await services[0].importHostedAccountUsage(ledger, 0);
    expect(
      await services[0].reserveCounterBudget(ledger, receipt, 1_000, 100),
    ).toEqual({ reserved: 100, status: 'reserved', total: 100 });
    expect(
      await services[0].noteResearchReservation(ledger, receipt, 100),
    ).toBe('noted');

    expect(await services[0].importHostedAccountUsage(ledger, 20)).toEqual({
      status: 'behind',
    });
    expect(await redis.get(ledger)).toBe('100');

    expect(
      await services[0].reconcileCounterReservation(ledger, receipt, 100, 20),
    ).toBe('settled');
    expect(await redis.get(ledger)).toBe('20');
    expect(await services[0].importHostedAccountUsage(ledger, 20)).toEqual({
      status: 'behind',
    });
    expect(await redis.get(ledger)).toBe('20');
    expect(
      await services[0].noteSettledResearchReservation(ledger, receipt),
    ).toBe('noted');
    expect(await services[0].importHostedAccountUsage(ledger, 20)).toEqual({
      status: 'unchanged',
    });
    expect(await redis.get(ledger)).toBe('20');
  });

  it('imports only provider usage above open reservations', async () => {
    const ledger = key();
    const receipt = key();
    keys.add(`${ledger}:snapshot`);
    keys.add(`${ledger}:settled`);
    keys.add(`${ledger}:outstanding`);
    await redis.set(ledger, '0', 'PX', 60_000);
    await services[0].initializeCounterBudget(ledger, 0, 60);
    await services[0].importHostedAccountUsage(ledger, 0);
    await services[0].reserveCounterBudget(ledger, receipt, 1_000, 100);
    await services[0].noteResearchReservation(ledger, receipt, 100);

    expect(await services[0].importHostedAccountUsage(ledger, 130)).toEqual({
      externalMicroUsd: 30,
      status: 'applied',
    });
    expect(await redis.get(ledger)).toBe('130');
    expect(await services[0].importHostedAccountUsage(ledger, 130)).toEqual({
      status: 'behind',
    });
    expect(await redis.get(ledger)).toBe('130');
  });
});
