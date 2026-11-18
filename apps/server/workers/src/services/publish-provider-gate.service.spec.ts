import { PublishProviderGateService } from '@workers/services/publish-provider-gate.service';
import Redis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// The ceilings live in a Lua script, so they are proven against a real Redis.
// The suite clears `genfeed:publish-gate:*`, so on a developer machine it runs
// only when REDIS_URL names a Redis for it and skips otherwise. In CI it always
// runs, against the job's Redis service: Turbo hands the `test` task only the
// variables `turbo.json` declares, so REDIS_URL from the workflow never arrives
// here, and a suite that waited for it skipped on every run.
const CI_REDIS_URL = 'redis://127.0.0.1:6379';
const redisUrl =
  process.env.REDIS_URL ?? (process.env.CI ? CI_REDIS_URL : undefined);

describe.skipIf(!redisUrl)('PublishProviderGateService', () => {
  let redis: Redis;
  let gate: PublishProviderGateService;
  let warnings: string[];

  beforeAll(() => {
    redis = new Redis(redisUrl as string);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    warnings = [];
    const keys = await redis.keys('genfeed:publish-gate:*');
    if (keys.length > 0) await redis.del(...keys);
    gate = new PublishProviderGateService(
      { getPublisher: () => redis } as never,
      { warn: (message: string) => warnings.push(message) } as never,
    );
  });

  it('holds a publish at the provider concurrency ceiling and admits it once a slot frees', async () => {
    const limit = { concurrency: 2, ratePerMinute: 100 };

    const first = await gate.admit('twitter', 'job-1', limit);
    const second = await gate.admit('twitter', 'job-2', limit);
    const held = await gate.admit('twitter', 'job-3', limit);
    await gate.release('twitter', 'job-1');
    const afterRelease = await gate.admit('twitter', 'job-3', limit);

    expect({ afterRelease, first, held, second }).toEqual({
      afterRelease: { isAdmitted: true },
      first: { isAdmitted: true },
      held: {
        isAdmitted: false,
        reason: 'concurrency',
        retryAfterMs: expect.any(Number),
      },
      second: { isAdmitted: true },
    });
  });

  it('keeps publishing to other providers while one is at its ceiling', async () => {
    const limit = { concurrency: 1, ratePerMinute: 100 };
    await gate.admit('youtube', 'slow-upload', limit);

    const youtube = await gate.admit('youtube', 'next-upload', limit);
    const instagram = await gate.admit('instagram', 'quick-post', limit);

    expect({
      instagram: instagram.isAdmitted,
      youtube: youtube.isAdmitted,
    }).toEqual({ instagram: true, youtube: false });
  });

  it('holds a publish past the per-minute rate and says when the window frees', async () => {
    const limit = { concurrency: 10, ratePerMinute: 2 };
    await gate.admit('mastodon', 'job-1', limit);
    await gate.release('mastodon', 'job-1');
    await gate.admit('mastodon', 'job-2', limit);
    await gate.release('mastodon', 'job-2');

    const held = await gate.admit('mastodon', 'job-3', limit);

    expect(held).toEqual({
      isAdmitted: false,
      reason: 'rate',
      // Within the minute window, plus the jitter a held job adds.
      retryAfterMs: expect.toSatisfy(
        (ms: number) => ms > 0 && ms <= 60_000 + 3_000,
      ),
    });
  });

  it('counts a job that asks again while it holds a slot once', async () => {
    const limit = { concurrency: 1, ratePerMinute: 100 };

    await gate.admit('reddit', 'job-1', limit);
    const again = await gate.admit('reddit', 'job-1', limit);

    expect(again).toEqual({ isAdmitted: true });
  });

  it('shares one ceiling between two worker processes', async () => {
    const otherProcess = new PublishProviderGateService(
      { getPublisher: () => new Redis(redisUrl as string) } as never,
      { warn: () => undefined } as never,
    );
    const limit = { concurrency: 1, ratePerMinute: 100 };

    await gate.admit('linkedin', 'job-on-first-process', limit);
    const held = await otherProcess.admit(
      'linkedin',
      'job-on-second-process',
      limit,
    );

    expect(held.isAdmitted).toBe(false);
  });

  it('admits every publish when Redis is unavailable instead of stopping publishing', async () => {
    const withoutRedis = new PublishProviderGateService(
      { getPublisher: () => null } as never,
      { warn: () => undefined } as never,
    );

    const decision = await withoutRedis.admit('twitter', 'job-1', {
      concurrency: 1,
      ratePerMinute: 1,
    });

    expect(decision).toEqual({ isAdmitted: true });
  });

  it('admits and warns when the gate errors', async () => {
    const failing = new PublishProviderGateService(
      {
        getPublisher: () => ({
          eval: async () => {
            throw new Error('redis down');
          },
        }),
      } as never,
      { warn: (message: string) => warnings.push(message) } as never,
    );

    const decision = await failing.admit('twitter', 'job-1');

    expect({ decision, warnings }).toEqual({
      decision: { isAdmitted: true },
      warnings: ['Publish provider gate unavailable; admitting'],
    });
  });
});
