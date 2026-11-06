// @vitest-environment jsdom
import {
  createTestQueryClient,
  queryClientWrapper,
  TEST_VIEWER,
} from '@app-tests/query-client.harness';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useIngredientsById } from './use-ingredients-by-id';

const mocks = vi.hoisted(() => ({
  findByIds: vi.fn(),
  viewer: { orgId: 'org-1', userId: 'user-1' },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  // The real hook returns a stable getter; a new one per render would loop.
  const getService = async () => ({ findByIds: mocks.findByIds });
  return { useAuthedService: () => getService };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ ...TEST_VIEWER, ...mocks.viewer }),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

describe('useIngredientsById', () => {
  beforeEach(() => {
    mocks.findByIds.mockReset();
    mocks.viewer = { orgId: 'org-1', userId: 'user-1' };
  });

  it('reads each distinct id once and indexes the result by id', async () => {
    mocks.findByIds.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const { result } = renderHook(() => useIngredientsById(['b', 'a', 'a']), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(mocks.findByIds).toHaveBeenCalledTimes(1);
    expect(mocks.findByIds).toHaveBeenCalledWith(['a', 'b']);
    expect(result.current.get('a')).toEqual({ id: 'a' });
  });

  it('does not read anything for an empty list', () => {
    const { result } = renderHook(() => useIngredientsById([]), {
      wrapper: queryClientWrapper(),
    });

    expect(result.current.size).toBe(0);
    expect(mocks.findByIds).not.toHaveBeenCalled();
  });

  it('returns the cached ingredients at once on a return visit', async () => {
    mocks.findByIds.mockResolvedValue([{ id: 'a' }]);
    const client = createTestQueryClient();
    const firstVisit = renderHook(() => useIngredientsById(['a']), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(firstVisit.result.current.size).toBe(1));
    firstVisit.unmount();

    mocks.findByIds.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useIngredientsById(['a']), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.get('a')).toEqual({ id: 'a' });
  });

  it('keeps the images on screen while a changed id set loads', async () => {
    mocks.findByIds.mockResolvedValue([{ id: 'a' }]);
    const { rerender, result } = renderHook(
      ({ ids }) => useIngredientsById(ids),
      {
        initialProps: { ids: ['a'] },
        wrapper: queryClientWrapper(),
      },
    );
    await waitFor(() => expect(result.current.size).toBe(1));

    mocks.findByIds.mockReturnValue(new Promise(() => {}));
    rerender({ ids: ['a', 'c'] });

    expect(result.current.get('a')).toEqual({ id: 'a' });
  });

  it('never shows one organization’s images to another', async () => {
    mocks.findByIds.mockResolvedValue([{ id: 'a' }]);
    const { rerender, result } = renderHook(
      ({ ids }) => useIngredientsById(ids),
      {
        initialProps: { ids: ['a'] },
        wrapper: queryClientWrapper(),
      },
    );
    await waitFor(() => expect(result.current.size).toBe(1));

    mocks.viewer = { orgId: 'org-2', userId: 'user-1' };
    mocks.findByIds.mockReturnValue(new Promise(() => {}));
    rerender({ ids: ['a'] });

    expect(result.current.size).toBe(0);
  });
});
