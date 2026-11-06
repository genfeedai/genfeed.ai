import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LayoutItem = {
  assetId: string;
  position: { x: number; y: number };
  width: number;
};
type StoredBoard = { brandId: string; id: string; layout: LayoutItem[] };

// In-memory mood-boards API: one board per brand. `reads` logs each fetch.
const api = vi.hoisted(() => ({
  boards: [] as StoredBoard[],
  brandId: 'brand-1' as string | undefined,
  isSignedIn: true,
  reads: [] as string[],
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: api.brandId }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isSignedIn: api.isSignedIn }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getByBrand: async (brandId: string) => {
      api.reads.push(brandId);
      const board = api.boards.find((item) => item.brandId === brandId);
      return board ? { id: board.id, layout: board.layout } : undefined;
    },
    patch: async (id: string, body: { layout: LayoutItem[] }) => {
      const board = api.boards.find((item) => item.id === id);
      if (!board) throw new Error(`404: board ${id}`);
      board.layout = body.layout;
      return { id: board.id, layout: board.layout };
    },
  }),
}));

vi.mock('@genfeedai/services/content/mood-boards.service', () => ({
  MoodBoardsService: { getInstance: () => ({}) },
}));

import { useMoodBoard } from './use-mood-board';

const LAYOUT: LayoutItem[] = [
  { assetId: 'item-1', position: { x: 0, y: 0 }, width: 1 },
];

describe('useMoodBoard', () => {
  beforeEach(() => {
    api.boards = [
      { brandId: 'brand-1', id: 'board-1', layout: [] },
      { brandId: 'brand-2', id: 'board-2', layout: LAYOUT },
    ];
    api.brandId = 'brand-1';
    api.isSignedIn = true;
    api.reads = [];
  });

  it('loads the mood board for the current brand', async () => {
    const { result } = renderHook(() => useMoodBoard(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.board).toEqual({ id: 'board-1', layout: [] });
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('does not fetch when signed out', () => {
    api.isSignedIn = false;

    const { result } = renderHook(() => useMoodBoard(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.board).toBeUndefined();
    expect(api.reads).toEqual([]);
  });

  it('does not fetch without a brand id', () => {
    api.brandId = undefined;

    const { result } = renderHook(() => useMoodBoard(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.board).toBeUndefined();
    expect(api.reads).toEqual([]);
  });

  it('saves a layout patch for the loaded board', async () => {
    const { result } = renderHook(() => useMoodBoard(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.board).toEqual({ id: 'board-1', layout: [] });
    });

    await act(async () => {
      await result.current.save(LAYOUT);
    });

    expect(api.boards[0].layout).toEqual(LAYOUT);
    await waitFor(() => {
      expect(result.current.board).toEqual({ id: 'board-1', layout: LAYOUT });
    });
    expect(api.boards[1].layout).toEqual(LAYOUT);
  });

  it('skips saving when no board is loaded', async () => {
    api.boards = [];
    const { result } = renderHook(() => useMoodBoard(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.save(LAYOUT);
    });

    expect(result.current.board).toBeUndefined();
    expect(api.boards).toEqual([]);
  });

  it('refresh picks up a board changed on the server', async () => {
    const { result } = renderHook(() => useMoodBoard(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.board).toEqual({ id: 'board-1', layout: [] });
    });

    api.boards[0].layout = LAYOUT;
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.board).toEqual({ id: 'board-1', layout: LAYOUT });
    });
  });
});
