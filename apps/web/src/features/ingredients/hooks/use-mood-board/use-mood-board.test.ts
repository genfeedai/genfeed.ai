import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetByBrand = vi.fn();
const mockPatch = vi.fn();
const mockGetService = vi.fn();
const mockUseBrand = vi.fn();
const mockUseAuthIdentity = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mockUseAuthIdentity(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetService,
}));

vi.mock('@genfeedai/services/content/mood-boards.service', () => ({
  MoodBoardsService: { getInstance: vi.fn() },
}));

import { useMoodBoard } from './use-mood-board';

const BOARD = { id: 'board-1', layout: [] };

describe('useMoodBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByBrand.mockResolvedValue(BOARD);
    mockPatch.mockResolvedValue(BOARD);
    mockGetService.mockResolvedValue({
      getByBrand: mockGetByBrand,
      patch: mockPatch,
    });
    mockUseBrand.mockReturnValue({ brandId: 'brand-1' });
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: true });
  });

  it('loads the mood board for the current brand', async () => {
    const { result } = renderHook(() => useMoodBoard(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetByBrand).toHaveBeenCalledWith('brand-1');
    expect(result.current.board).toEqual(BOARD);
  });

  it('does not fetch when signed out', () => {
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: false });

    renderHook(() => useMoodBoard(), { wrapper: createQueryWrapper() });

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('does not fetch without a brand id', () => {
    mockUseBrand.mockReturnValue({ brandId: undefined });

    renderHook(() => useMoodBoard(), { wrapper: createQueryWrapper() });

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('saves a layout patch for the loaded board', async () => {
    const { result } = renderHook(() => useMoodBoard(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.board).toEqual(BOARD);
    });

    const layout = [{ h: 1, id: 'item-1', w: 1, x: 0, y: 0 }];

    await act(async () => {
      await result.current.save(layout);
    });

    expect(mockPatch).toHaveBeenCalledWith('board-1', { layout });
  });

  it('skips saving when no board is loaded', async () => {
    mockGetByBrand.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMoodBoard(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.save([]);
    });

    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('refresh triggers a refetch', async () => {
    const { result } = renderHook(() => useMoodBoard(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockGetByBrand.mockClear();

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockGetByBrand).toHaveBeenCalled();
    });
  });
});
