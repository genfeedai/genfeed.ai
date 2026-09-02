import { createConcurrencyLimit } from './create-concurrency-limit.util';

describe('createConcurrencyLimit', () => {
  it('returns a callable limiter exposing the requested concurrency', () => {
    const limit = createConcurrencyLimit(2);

    expect(typeof limit).toBe('function');
    expect(limit.concurrency).toBe(2);
  });

  it('runs tasks without exceeding the configured concurrency', async () => {
    const limit = createConcurrencyLimit(2);
    let active = 0;
    let peak = 0;

    const task = async (value: number): Promise<number> => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value;
    };

    const results = await Promise.all([
      limit(() => task(1)),
      limit(() => task(2)),
      limit(() => task(3)),
      limit(() => task(4)),
    ]);

    expect(results).toEqual([1, 2, 3, 4]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('propagates rejections from the wrapped task', async () => {
    const limit = createConcurrencyLimit(1);

    await expect(
      limit(() => Promise.reject(new Error('task failed'))),
    ).rejects.toThrowError('task failed');
  });
});
