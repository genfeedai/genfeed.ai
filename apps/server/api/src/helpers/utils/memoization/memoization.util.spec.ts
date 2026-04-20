import { MemoizationUtil } from '@api/helpers/utils/memoization/memoization.util';

// Mock dependencies
vi.mock('@api/helpers/utils/cache/cache.util', () => ({
  GlobalCaches: {
    clearAll: vi.fn(),
    getAllStats: vi.fn(() => ({})),
    getObjectIdCache: vi.fn(() => ({
      memoize: vi.fn((fn) => fn),
    })),
    getSortCache: vi.fn(() => ({
      memoize: vi.fn((fn) => fn),
    })),
  },
}));

vi.mock('@api/helpers/utils/objectid/objectid.util', () => ({
  ObjectIdUtil: {
    createSecureQuery: vi.fn((query) => query),
    enrichWithUserContext: vi.fn((dto, metadata) => ({
      ...dto,
      user: metadata.user,
    })),
    processSearchParams: vi.fn((params) => params),
    validate: vi.fn((id) => id),
    validateMany: vi.fn((ids) => ids.map((id: string) => id)),
  },
}));

vi.mock('@api/helpers/utils/sort/sort.util', () => ({
  handleQuerySort: vi.fn((sort) => ({ sortField: sort })),
}));

import { GlobalCaches } from '@api/helpers/utils/cache/cache.util';

describe('MemoizationUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('memoize', () => {
    it('should memoize function results', () => {
      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x * 2;
      };
      const keyGen = (x: number) => `key-${x}`;

      const memoized = MemoizationUtil.memoize(fn, keyGen, 1000);

      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(1);

      // Second call should use cached value
      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(1); // Still 1, not incremented

      // Different argument should call function again
      expect(memoized(10)).toBe(20);
      expect(callCount).toBe(2);
    });

    it('should expire cached values after TTL', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x * 2;
      };
      const keyGen = (x: number) => `key-${x}`;

      const memoized = MemoizationUtil.memoize(fn, keyGen, 50); // 50ms TTL

      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(1);

      await vi.advanceTimersByTimeAsync(100);

      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(2); // Called again after expiry

      vi.useRealTimers();
    });

    it('should cleanup old entries when cache size exceeds limit', () => {
      const fn = (x: number) => x * 2;
      const keyGen = (x: number) => `key-${x}`;

      const memoized = MemoizationUtil.memoize(fn, keyGen, 10000);

      // Add more than 1000 entries to trigger cleanup
      for (let i = 0; i < 1100; i++) {
        memoized(i);
      }

      // Cache should still work
      expect(memoized(1099)).toBe(2198);
    });

    it('should handle functions with multiple arguments', () => {
      let callCount = 0;
      const fn = (a: number, b: number) => {
        callCount++;
        return a + b;
      };
      const keyGen = (a: number, b: number) => `${a}-${b}`;

      const memoized = MemoizationUtil.memoize(fn, keyGen);

      expect(memoized(2, 3)).toBe(5);
      expect(callCount).toBe(1);

      expect(memoized(2, 3)).toBe(5);
      expect(callCount).toBe(1);

      expect(memoized(3, 4)).toBe(7);
      expect(callCount).toBe(2);
    });
  });

  describe('memoizeAsync', () => {
    it('should memoize async function results', async () => {
      let callCount = 0;
      const fn = async (x: number) => {
        callCount++;
        await Promise.resolve();
        return x * 2;
      };
      const keyGen = (x: number) => `key-${x}`;

      const memoized = MemoizationUtil.memoizeAsync(fn, keyGen, 1000);

      expect(await memoized(5)).toBe(10);
      expect(callCount).toBe(1);

      // Second call should use cached promise
      expect(await memoized(5)).toBe(10);
      expect(callCount).toBe(1);
    });

    it('should expire cached promises after TTL', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const fn = async (x: number) => {
        callCount++;
        await Promise.resolve();
        return x * 2;
      };
      const keyGen = (x: number) => `key-${x}`;

      const memoized = MemoizationUtil.memoizeAsync(fn, keyGen, 50);

      expect(await memoized(5)).toBe(10);
      expect(callCount).toBe(1);

      await vi.advanceTimersByTimeAsync(100);

      expect(await memoized(5)).toBe(10);
      expect(callCount).toBe(2);

      vi.useRealTimers();
    });

    it('should remove failed promises from cache', async () => {
      let callCount = 0;
      const fn = async (x: number) => {
        callCount++;
        await Promise.resolve();
        if (x < 0) {
          throw new Error('Negative number');
        }
        return x * 2;
      };
      const keyGen = (x: number) => `key-${x}`;

      const memoized = MemoizationUtil.memoizeAsync(fn, keyGen);

      await expect(memoized(-5)).rejects.toThrow('Negative number');
      expect(callCount).toBe(1);

      // Should retry on next call (not cached)
      await expect(memoized(-5)).rejects.toThrow('Negative number');
      expect(callCount).toBe(2);
    });

    it('should cleanup old entries when cache size exceeds limit', async () => {
      const fn = async (x: number) => {
        await Promise.resolve();
        return x * 2;
      };
      const keyGen = (x: number) => `key-${x}`;

      const memoized = MemoizationUtil.memoizeAsync(fn, keyGen, 10000);

      // Add more than 500 entries to trigger cleanup
      const promises = [];
      for (let i = 0; i < 550; i++) {
        promises.push(memoized(i));
      }

      await Promise.all(promises);

      // Cache should still work
      expect(await memoized(549)).toBe(1098);
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it('should debounce function calls', async () => {
      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x * 2;
      };

      const debounced = MemoizationUtil.debounce(fn, 100);

      debounced(5); // discarded
      debounced(5); // discarded
      const promise3 = debounced(5); // only this resolves

      vi.runAllTimers();

      const result = await promise3;

      expect(result).toBe(10);
      expect(callCount).toBe(1); // Only called once due to debouncing
    });

    it('should handle errors in debounced function', async () => {
      const fn = () => {
        throw new Error('Test error');
      };

      const debounced = MemoizationUtil.debounce(fn, 100);

      const promise = debounced();

      vi.runAllTimers();

      await expect(promise).rejects.toThrow('Test error');
    });
  });

  describe('throttle', () => {
    it('should throttle function calls', () => {
      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x * 2;
      };

      const throttled = MemoizationUtil.throttle(fn, 1000);

      const result1 = throttled(5);
      expect(result1).toBe(10);
      expect(callCount).toBe(1);

      // Immediate subsequent calls should return undefined
      const result2 = throttled(5);
      expect(result2).toBeUndefined();
      expect(callCount).toBe(1);
    });

    it('should allow calls after interval', async () => {
      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x * 2;
      };

      const throttled = MemoizationUtil.throttle(fn, 50);

      expect(throttled(5)).toBe(10);
      expect(callCount).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(throttled(5)).toBe(10);
      expect(callCount).toBe(2);
    });

    it('should handle different arguments separately', () => {
      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x * 2;
      };

      const throttled = MemoizationUtil.throttle(fn, 1000);

      expect(throttled(5)).toBe(10);
      expect(throttled(10)).toBe(20);
      expect(callCount).toBe(2);
    });
  });

  describe('clearAll', () => {
    it('should call GlobalCaches.clearAll', () => {
      MemoizationUtil.clearAll();

      expect(GlobalCaches.clearAll).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const mockStats = {
        objectIdCache: { hits: 500, misses: 50, size: 100 },
        sortCache: { hits: 100, misses: 10, size: 20 },
      };

      (GlobalCaches.getAllStats as vi.Mock).mockReturnValue(mockStats);

      const stats = MemoizationUtil.getStats();

      expect(stats).toEqual(mockStats);
      expect(GlobalCaches.getAllStats).toHaveBeenCalled();
    });
  });
});
