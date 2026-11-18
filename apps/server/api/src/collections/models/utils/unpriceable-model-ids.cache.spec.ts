import {
  UNPRICEABLE_MODEL_IDS_TTL_MS,
  UnpriceableModelIdsCache,
} from '@api/collections/models/utils/unpriceable-model-ids.cache';
import { describe, expect, it } from 'vitest';

describe('UnpriceableModelIdsCache', () => {
  function createCache() {
    let now = 1_000;
    const cache = new UnpriceableModelIdsCache(() => now);
    return {
      advance: (ms: number) => {
        now += ms;
      },
      cache,
    };
  }

  it('returns the first classification again inside the window', async () => {
    const { cache } = createCache();

    const first = await cache.read('org-1', async () => ['red-model']);
    const second = await cache.read('org-1', async () => ['other-model']);

    expect(first).toEqual(['red-model']);
    expect(second).toEqual(['red-model']);
  });

  it('classifies again once the window has passed', async () => {
    const { advance, cache } = createCache();
    await cache.read('org-1', async () => ['red-model']);

    advance(UNPRICEABLE_MODEL_IDS_TTL_MS + 1);

    expect(await cache.read('org-1', async () => ['other-model'])).toEqual([
      'other-model',
    ]);
  });

  it('keeps each organization separate', async () => {
    const { cache } = createCache();
    await cache.read('org-1', async () => ['org-1-model']);

    expect(await cache.read('org-2', async () => ['org-2-model'])).toEqual([
      'org-2-model',
    ]);
  });

  it('shares one load between callers that arrive together', async () => {
    const { cache } = createCache();
    let release: (ids: string[]) => void = () => undefined;
    const pending = new Promise<string[]>((resolve) => {
      release = resolve;
    });

    const first = cache.read('org-1', () => pending);
    const second = cache.read('org-1', async () => ['never-used']);
    release(['red-model']);

    expect(await first).toEqual(['red-model']);
    expect(await second).toEqual(['red-model']);
  });

  it('does not keep a load that failed', async () => {
    const { cache } = createCache();
    await expect(
      cache.read('org-1', async () => {
        throw new Error('database unavailable');
      }),
    ).rejects.toThrow('database unavailable');

    expect(await cache.read('org-1', async () => ['red-model'])).toEqual([
      'red-model',
    ]);
  });

  it('forgets everything on clear', async () => {
    const { cache } = createCache();
    await cache.read('org-1', async () => ['red-model']);

    cache.clear();

    expect(await cache.read('org-1', async () => ['other-model'])).toEqual([
      'other-model',
    ]);
  });
});
