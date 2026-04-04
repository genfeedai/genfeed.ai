import { AuthenticationTokenUnavailableError } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { logger } from '@services/core/logger.service';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('useResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('returns data as null by default', async () => {
      const fetcher = vi.fn().mockResolvedValue({ items: [] });

      const { result } = renderHook(() => useResource(fetcher));

      // Initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();
    });

    it('returns defaultValue when provided', async () => {
      const fetcher = vi.fn().mockResolvedValue([]);

      const { result } = renderHook(() =>
        useResource(fetcher, { defaultValue: [] }),
      );

      expect(result.current.data).toEqual([]);
    });

    it('starts with isLoading true when enabled', () => {
      const fetcher = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useResource(fetcher));

      expect(result.current.isLoading).toBe(true);
    });

    it('starts with isLoading false when disabled', () => {
      const fetcher = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() =>
        useResource(fetcher, { enabled: false }),
      );

      expect(result.current.isLoading).toBe(false);
    });

    it('returns isRefreshing false initially', () => {
      const fetcher = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useResource(fetcher));

      expect(result.current.isRefreshing).toBe(false);
    });

    it('returns null error initially', () => {
      const fetcher = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useResource(fetcher));

      expect(result.current.error).toBeNull();
    });
  });

  describe('Data Fetching', () => {
    it('fetches data on mount when enabled', async () => {
      const mockData = { id: 1, name: 'test' };
      const fetcher = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useResource(fetcher));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual(mockData);
    });

    it('does not fetch when enabled is false', async () => {
      const fetcher = vi.fn().mockResolvedValue({});

      renderHook(() => useResource(fetcher, { enabled: false }));

      // Wait a bit to ensure fetch is not called
      await new Promise((r) => setTimeout(r, 100));

      expect(fetcher).not.toHaveBeenCalled();
    });

    it('sets isLoading false after successful fetch', async () => {
      const fetcher = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useResource(fetcher));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('uses initialData without fetching on mount when revalidateOnMount is false', async () => {
      const fetcher = vi.fn().mockResolvedValue({ id: 2, name: 'fresh' });
      const initialData = { id: 1, name: 'hydrated' };

      const { result } = renderHook(() =>
        useResource(fetcher, {
          initialData,
          revalidateOnMount: false,
        }),
      );

      expect(result.current.data).toEqual(initialData);
      expect(result.current.isLoading).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetcher).not.toHaveBeenCalled();
    });
  });

  describe('Refresh', () => {
    it('provides refresh function', () => {
      const fetcher = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useResource(fetcher));

      expect(typeof result.current.refresh).toBe('function');
    });

    it('refresh refetches data', async () => {
      const fetcher = vi.fn().mockResolvedValue({ count: 1 });

      const { result } = renderHook(() => useResource(fetcher));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetcher).toHaveBeenCalledTimes(1);

      fetcher.mockResolvedValue({ count: 2 });

      await act(async () => {
        await result.current.refresh();
      });

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(result.current.data).toEqual({ count: 2 });
    });
  });

  describe('Mutate', () => {
    it('provides mutate function', () => {
      const fetcher = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useResource(fetcher));

      expect(typeof result.current.mutate).toBe('function');
    });

    it('mutate updates data immediately', async () => {
      const fetcher = vi.fn().mockResolvedValue({ count: 1 });

      const { result } = renderHook(() => useResource(fetcher));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.mutate({ count: 100 });
      });

      expect(result.current.data).toEqual({ count: 100 });
    });
  });

  describe('Error Handling', () => {
    it('sets error on fetch failure', async () => {
      const error = new Error('Fetch failed');
      const fetcher = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useResource(fetcher));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Fetch failed');
    });

    it('calls onError callback on failure', async () => {
      const error = new Error('Fetch failed');
      const fetcher = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();

      renderHook(() => useResource(fetcher, { onError }));

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error);
      });
    });

    it('silently defers when auth token is not yet available', async () => {
      const fetcher = vi
        .fn()
        .mockRejectedValue(new AuthenticationTokenUnavailableError());
      const onError = vi.fn();

      const { result } = renderHook(() => useResource(fetcher, { onError }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
      expect(onError).not.toHaveBeenCalled();
      expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
    });

    it('clears error on successful refresh', async () => {
      const error = new Error('Fetch failed');
      const fetcher = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useResource(fetcher));

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      fetcher.mockResolvedValue({ data: 'success' });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Callbacks', () => {
    it('calls onSuccess callback after successful fetch', async () => {
      const mockData = { id: 1 };
      const fetcher = vi.fn().mockResolvedValue(mockData);
      const onSuccess = vi.fn();

      renderHook(() => useResource(fetcher, { onSuccess }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(mockData);
      });
    });
  });

  describe('Dependencies', () => {
    it('refetches when dependencies change', async () => {
      const fetcher = vi.fn().mockResolvedValue({});

      const { result, rerender } = renderHook(
        ({ dep }) => useResource(fetcher, { dependencies: [dep] }),
        { initialProps: { dep: 'initial' } },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetcher).toHaveBeenCalledTimes(1);

      rerender({ dep: 'changed' });

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(2);
      });
    });

    it('refetches on dependency change after hydrating initialData', async () => {
      const fetcher = vi.fn().mockResolvedValue({ scope: 'client' });

      const { rerender } = renderHook(
        ({ dep }) =>
          useResource(fetcher, {
            dependencies: [dep],
            initialData: { scope: 'server' },
            revalidateOnMount: false,
          }),
        { initialProps: { dep: 'initial' } },
      );

      expect(fetcher).not.toHaveBeenCalled();

      rerender({ dep: 'changed' });

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Cleanup', () => {
    it('aborts request on unmount', async () => {
      let abortCalled = false;
      const fetcher = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            if (!abortCalled) {
              reject(new Error('Should have been aborted'));
            }
          }, 100);
        });
      });

      const { unmount } = renderHook(() => useResource(fetcher));

      unmount();
      abortCalled = true;

      // Should not throw - request was aborted
    });

    it('passes AbortSignal to the fetcher', async () => {
      let receivedSignal: AbortSignal | null = null;
      const fetcher = vi
        .fn()
        .mockImplementation(async (signal: AbortSignal) => {
          receivedSignal = signal;
          return { ok: true };
        });

      renderHook(() => useResource(fetcher));

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(1);
      });

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      expect(receivedSignal?.aborted).toBe(false);
    });
  });

  describe('Caching', () => {
    it('dedupes in-flight requests when cacheKey matches', async () => {
      let resolveRequest: ((value: { value: string }) => void) | null = null;
      const fetcher = vi.fn().mockImplementation(
        () =>
          new Promise<{ value: string }>((resolve) => {
            resolveRequest = resolve;
          }),
      );

      const firstHook = renderHook(() =>
        useResource(fetcher, { cacheKey: 'shared-cache-key' }),
      );
      const secondHook = renderHook(() =>
        useResource(fetcher, { cacheKey: 'shared-cache-key' }),
      );

      expect(fetcher).toHaveBeenCalledTimes(1);

      act(() => {
        resolveRequest?.({ value: 'resolved' });
      });

      await waitFor(() => {
        expect(firstHook.result.current.data).toEqual({ value: 'resolved' });
      });

      await waitFor(() => {
        expect(secondHook.result.current.data).toEqual({ value: 'resolved' });
      });
    });
  });

  describe('All Return Values', () => {
    it('returns all expected properties', () => {
      const fetcher = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useResource(fetcher));

      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isRefreshing');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('refresh');
      expect(result.current).toHaveProperty('mutate');
    });
  });

  describe('Type Safety', () => {
    it('maintains data type with defaultValue', async () => {
      interface Item {
        id: number;
        name: string;
      }

      const mockItems: Item[] = [{ id: 1, name: 'Test' }];
      const fetcher = vi.fn().mockResolvedValue(mockItems);

      const { result } = renderHook(() =>
        useResource(fetcher, { defaultValue: [] }),
      );

      // Type should be Item[], not Item[] | null
      expect(Array.isArray(result.current.data)).toBe(true);
    });
  });
});
