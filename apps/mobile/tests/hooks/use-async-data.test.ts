import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/auth-context', () => ({
  useMobileAuth: vi.fn(() => ({
    getToken: vi.fn().mockResolvedValue('test-token'),
    isLoaded: true,
    isSignedIn: true,
    refreshSession: vi.fn(),
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
    user: null,
  })),
}));

import { useMobileAuth } from '@/contexts/auth-context';
import {
  useAsyncAction,
  useAsyncItem,
  useAsyncList,
} from '@/hooks/use-async-data';

describe('useAsyncList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('loads a list on mount and exposes refresh vs load flags', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      data: [{ id: '1' }],
      meta: {
        pagination: { page: 1, pageCount: 1, pageSize: 20, total: 1 },
      },
    });

    const { result } = renderHook(() => useAsyncList(fetchFn, 'ideas'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual([{ id: '1' }]);
    expect(result.current.pagination?.total).toBe(1);
    expect(fetchFn).toHaveBeenCalledWith(
      'test-token',
      undefined,
      expect.any(AbortSignal),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('skips the request when enabled is false', async () => {
    const fetchFn = vi.fn();

    const { result } = renderHook(() =>
      useAsyncList(fetchFn, 'ideas', { enabled: false }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
  });

  it('surfaces a missing-token error without calling the fetcher', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue(null),
      isLoaded: true,
      isSignedIn: false,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);

    const fetchFn = vi.fn();
    const { result } = renderHook(() => useAsyncList(fetchFn, 'ideas'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe(
      'No authentication token available',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('useAsyncItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('does not fetch when id is null', async () => {
    const fetchFn = vi.fn();
    const { result } = renderHook(() => useAsyncItem(fetchFn, null, 'idea'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('loads an item by id', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: { id: 'idea-1' } });
    const { result } = renderHook(() =>
      useAsyncItem(fetchFn, 'idea-1', 'idea'),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ id: 'idea-1' });
    expect(fetchFn).toHaveBeenCalledWith(
      'test-token',
      'idea-1',
      expect.any(AbortSignal),
    );
  });
});

describe('useAsyncAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('executes an action with the session token', async () => {
    const { result } = renderHook(() => useAsyncAction());
    const action = vi.fn().mockResolvedValue('ok');

    let value: string | null = null;
    await act(async () => {
      value = await result.current.execute(action, 'failed');
    });

    expect(value).toBe('ok');
    expect(action).toHaveBeenCalledWith('test-token');
    expect(result.current.isSubmitting).toBe(false);
  });

  it('returns null and records the error when the action throws', async () => {
    const { result } = renderHook(() => useAsyncAction());

    let value: unknown = 'unset';
    await act(async () => {
      value = await result.current.execute(async () => {
        throw new Error('boom');
      }, 'failed');
    });

    expect(value).toBeNull();
    expect(result.current.error?.message).toBe('boom');
  });
});
