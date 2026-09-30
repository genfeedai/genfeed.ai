import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAll = vi.fn();
const mockPollNow = vi.fn();
const mockGetService = vi.fn();
const mockUseCollectionScope = vi.fn();
const mockUseAuthIdentity = vi.fn();

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => mockUseCollectionScope(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mockUseAuthIdentity(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetService,
}));

vi.mock('@genfeedai/services/content/rss-sources.service', () => ({
  RssSourcesService: { getInstance: vi.fn() },
}));

import { useRssSources } from './use-rss-sources';

const SOURCE = { id: 'rss-1', label: 'Tech feed' };

describe('useRssSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAll.mockResolvedValue([SOURCE]);
    mockPollNow.mockResolvedValue(SOURCE);
    mockGetService.mockResolvedValue({
      findAll: mockFindAll,
      pollNow: mockPollNow,
    });
    mockUseCollectionScope.mockReturnValue({ brandId: 'brand-1' });
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: true });
  });

  it('loads rss sources for the current brand', async () => {
    const { result } = renderHook(() => useRssSources(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFindAll).toHaveBeenCalledWith(
      { brandId: 'brand-1' },
      expect.any(AbortSignal),
    );
    expect(result.current.sources).toEqual([SOURCE]);
  });

  it('does not fetch when signed out', () => {
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: false });

    renderHook(() => useRssSources(), { wrapper: createQueryWrapper() });

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('does not fetch without a brand id', () => {
    mockUseCollectionScope.mockReturnValue({ brandId: undefined });

    renderHook(() => useRssSources(), { wrapper: createQueryWrapper() });

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('polls a source and refreshes the list', async () => {
    const { result } = renderHook(() => useRssSources(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.sources).toEqual([SOURCE]);
    });

    mockFindAll.mockClear();

    await act(async () => {
      await result.current.pollNow('rss-1');
    });

    expect(mockPollNow).toHaveBeenCalledWith('rss-1');
    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalled();
    });
  });

  it('refresh triggers a refetch', async () => {
    const { result } = renderHook(() => useRssSources(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockFindAll.mockClear();

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalled();
    });
  });
});
