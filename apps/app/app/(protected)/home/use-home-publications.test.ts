// @vitest-environment jsdom
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomePublications } from './use-home-publications';

const { findAll } = vi.hoisted(() => ({ findAll: vi.fn() }));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ findAll }),
}));

describe('useHomePublications', () => {
  beforeEach(() => {
    findAll.mockReset().mockResolvedValue([]);
  });

  it('fetches recent posts for the selected brand with cancellation', async () => {
    const publications = [{ id: 'release-1', title: 'Launch' }];
    findAll.mockResolvedValue(publications);
    const { result } = renderHook(
      () => useHomePublications('org-1', 'brand-1'),
      { wrapper: createQueryWrapper() },
    );
    expect(result.current.isLoading).toBe(true);
    await waitFor(() =>
      expect(result.current.publications).toEqual(publications),
    );
    expect(findAll).toHaveBeenCalledWith(
      { brandId: 'brand-1', limit: 5, sort: 'updatedAt: -1' },
      expect.any(AbortSignal),
    );
  });

  it('does not fetch an organization-wide feed while brand scope is unresolved', () => {
    renderHook(() => useHomePublications('org-1'), {
      wrapper: createQueryWrapper(),
    });
    expect(findAll).not.toHaveBeenCalled();
  });

  it('clears previous publications when brand scope changes', async () => {
    findAll
      .mockResolvedValueOnce([{ id: 'brand-1-post' }])
      .mockImplementation(() => new Promise(() => {}));
    const { result, rerender } = renderHook(
      ({ brandId }) => useHomePublications('org-1', brandId),
      {
        initialProps: { brandId: 'brand-1' },
        wrapper: createQueryWrapper(),
      },
    );
    await waitFor(() => expect(result.current.publications).toHaveLength(1));
    rerender({ brandId: 'brand-2' });
    expect(result.current.publications).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('retries a failed publication request', async () => {
    findAll.mockRejectedValueOnce(new Error('unavailable'));
    const { result } = renderHook(
      () => useHomePublications('org-1', 'brand-1'),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(findAll).toHaveBeenCalledTimes(2);
  });
});
