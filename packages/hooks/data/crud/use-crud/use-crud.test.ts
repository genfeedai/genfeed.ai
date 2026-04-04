import {
  useCreate,
  useDelete,
  useFindAll,
  useFindOne,
  useUpdate,
} from '@hooks/data/crud/use-crud/use-crud';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseResource = vi.fn();
const mockWithSilentOperation = vi.fn();
const mockNotifications = {
  error: vi.fn(),
};

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

vi.mock('@hooks/utils/service-operation/service-operation.util', () => ({
  withSilentOperation: (...args: unknown[]) => mockWithSilentOperation(...args),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => mockNotifications),
  },
}));

describe('useCrud hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseResource.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      isRefreshing: false,
      refresh: vi.fn(),
    });
  });

  it('useFindAll passes dependencies and default value', () => {
    const getService = vi.fn().mockResolvedValue({
      findAll: vi.fn().mockResolvedValue([]),
    });

    renderHook(() => useFindAll(getService, { status: 'active' }));

    const options = mockUseResource.mock.calls[0]?.[1] as {
      defaultValue?: unknown;
      dependencies?: unknown[];
    };

    expect(options.defaultValue).toEqual([]);
    expect(options.dependencies).toEqual(
      expect.arrayContaining([JSON.stringify({ status: 'active' })]),
    );
  });

  it('useFindOne disables fetch when id is missing', async () => {
    renderHook(() => useFindOne(vi.fn(), null));

    const options = mockUseResource.mock.calls[0]?.[1] as {
      enabled?: boolean;
    };
    expect(options.enabled).toBe(false);

    const fetcher = mockUseResource.mock
      .calls[0]?.[0] as () => Promise<unknown>;
    await expect(fetcher()).rejects.toThrow('ID is required for findOne');
  });

  it('useCreate posts data and triggers onSuccess', async () => {
    const post = vi.fn().mockResolvedValue({ id: 'item-1' });
    const getService = vi.fn().mockResolvedValue({ post });
    const onSuccess = vi.fn();

    mockWithSilentOperation.mockImplementation(
      async ({
        operation,
        onSuccess: onSuccessCallback,
      }: {
        operation: () => Promise<unknown>;
        onSuccess?: (data: unknown) => void;
      }) => {
        const result = await operation();
        onSuccessCallback?.(result);
        return result;
      },
    );

    const { result } = renderHook(() =>
      useCreate<Record<string, unknown>>(getService, { onSuccess }),
    );

    await act(async () => {
      await result.current.create({ name: 'test' });
    });

    expect(post).toHaveBeenCalledWith({ name: 'test' });
    expect(onSuccess).toHaveBeenCalledWith({ id: 'item-1' });
  });

  it('useCreate captures errors', async () => {
    const error = new Error('Create failed');
    const post = vi.fn();
    const getService = vi.fn().mockResolvedValue({ post });
    const onError = vi.fn();

    mockWithSilentOperation.mockRejectedValue(error);

    const { result } = renderHook(() =>
      useCreate<Record<string, unknown>>(getService, { onError }),
    );

    await act(async () => {
      await result.current.create({ name: 'test' });
    });

    expect(mockNotifications.error).toHaveBeenCalledWith('Create failed');
    expect(onError).toHaveBeenCalledWith(error);
    expect(result.current.error).toBe(error);
  });

  it('useUpdate patches data', async () => {
    const patch = vi.fn().mockResolvedValue({ id: 'item-1' });
    const getService = vi.fn().mockResolvedValue({ patch });

    mockWithSilentOperation.mockImplementation(
      async ({ operation }: { operation: () => Promise<unknown> }) => {
        return operation();
      },
    );

    const { result } = renderHook(() =>
      useUpdate<Record<string, unknown>>(getService),
    );

    await act(async () => {
      await result.current.update('item-1', { name: 'next' });
    });

    expect(patch).toHaveBeenCalledWith('item-1', { name: 'next' });
  });

  it('useDelete calls delete on the service', async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const getService = vi.fn().mockResolvedValue({ delete: deleteFn });

    mockWithSilentOperation.mockImplementation(
      async ({ operation }: { operation: () => Promise<unknown> }) => {
        await operation();
      },
    );

    const { result } = renderHook(() =>
      useDelete<Record<string, unknown>>(getService),
    );

    await act(async () => {
      await result.current.delete('item-1');
    });

    expect(deleteFn).toHaveBeenCalledWith('item-1');
  });
});
