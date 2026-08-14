import 'reflect-metadata';

import {
  Cacheable,
  CacheInvalidate,
} from '@api/shared/decorators/cache/cache.decorator';
import { describe, expect, it, vi } from 'vitest';

describe('Cacheable', () => {
  it('falls back to the original method when no cache service is injected', async () => {
    class Example {
      [key: string]: unknown;

      @Cacheable()
      async load(id: string) {
        return `fresh:${id}`;
      }
    }

    await expect(new Example().load('1')).resolves.toBe('fresh:1');
  });

  it('returns a cached value when one exists', async () => {
    const cacheService = {
      generateKey: vi.fn(
        (prefix: string, ...parts: string[]) => `${prefix}:${parts.join(':')}`,
      ),
      get: vi.fn().mockResolvedValue({ hit: true }),
      set: vi.fn(),
    };

    class Example {
      [key: string]: unknown;
      cacheService = cacheService;

      @Cacheable({ keyPrefix: 'widgets', tags: ['w'], ttl: 30 })
      async load(id: string) {
        return { hit: false, id };
      }
    }

    await expect(new Example().load('abc')).resolves.toEqual({ hit: true });
    expect(cacheService.set).not.toHaveBeenCalled();
  });

  it('stores a miss and degrades to the original method when cache I/O fails', async () => {
    const cacheService = {
      generateKey: vi.fn(() => 'widgets:load'),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    class Example {
      [key: string]: unknown;
      cacheService = cacheService;
      calls = 0;

      @Cacheable()
      async load() {
        this.calls += 1;
        return this.calls;
      }
    }

    const example = new Example();
    await expect(example.load()).resolves.toBe(1);
    expect(cacheService.set).toHaveBeenCalledWith('widgets:load', 1, {
      tags: undefined,
      ttl: undefined,
    });

    cacheService.get.mockRejectedValueOnce(new Error('redis down'));
    await expect(example.load()).resolves.toBe(2);
  });
});

describe('CacheInvalidate', () => {
  it('runs the method and invalidates tags when a cache service is present', async () => {
    const cacheService = {
      invalidateByTags: vi.fn().mockResolvedValue(undefined),
    };

    class Example {
      [key: string]: unknown;
      cacheService = cacheService;

      @CacheInvalidate(['widgets'])
      async save(label: string) {
        return label;
      }
    }

    await expect(new Example().save('ok')).resolves.toBe('ok');
    expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['widgets']);
  });

  it('skips invalidation when tags are empty or no cache service exists', async () => {
    class WithoutCache {
      [key: string]: unknown;

      @CacheInvalidate(['widgets'])
      async save() {
        return 'plain';
      }
    }

    class EmptyTags {
      [key: string]: unknown;
      cacheService = { invalidateByTags: vi.fn() };

      @CacheInvalidate([])
      async save() {
        return 'empty';
      }
    }

    await expect(new WithoutCache().save()).resolves.toBe('plain');
    const empty = new EmptyTags();
    await expect(empty.save()).resolves.toBe('empty');
    expect(empty.cacheService.invalidateByTags).not.toHaveBeenCalled();
  });
});
