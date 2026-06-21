import type { IIngredient, IMoodBoardLayoutItem } from '@genfeedai/interfaces';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MOOD_BOARD_AUTOSAVE_DEBOUNCE_MS,
  useMoodBoardCanvas,
} from '@/features/moodboard/use-mood-board-canvas';

function asset(id: string): IIngredient {
  return { id, isDeleted: false } as IIngredient;
}

// Stable references: the hydration effect keys on assets/savedLayout identity,
// so inline arrays would re-fire it every render (mirrors real useState/useMemo
// inputs from the consumer).
const EMPTY_LAYOUT: IMoodBoardLayoutItem[] = [];

describe('useMoodBoardCanvas', () => {
  // Only fake the timer functions the debounce uses; faking nextTick/Date as
  // well leaves the vitest worker unable to terminate cleanly.
  beforeEach(() =>
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }),
  );
  afterEach(() => vi.useRealTimers());

  it('hydrates one node per asset', () => {
    const assets = [asset('a'), asset('b')];
    const { result } = renderHook(() =>
      useMoodBoardCanvas({
        assets,
        savedLayout: EMPTY_LAYOUT,
        onPersist: vi.fn(),
      }),
    );

    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.nodes[0]).toMatchObject({
      id: 'a',
      type: 'mediaAsset',
    });
  });

  it('persists the moved layout once after the debounce window', () => {
    const assets = [asset('a')];
    const onPersist = vi.fn();
    const { result } = renderHook(() =>
      useMoodBoardCanvas({ assets, savedLayout: EMPTY_LAYOUT, onPersist }),
    );

    act(() => {
      result.current.onNodesChange([
        { id: 'a', type: 'position', position: { x: 50, y: 60 } },
      ]);
      result.current.onNodeDragStop();
    });

    act(() => {
      vi.advanceTimersByTime(MOOD_BOARD_AUTOSAVE_DEBOUNCE_MS - 1);
    });
    expect(onPersist).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist).toHaveBeenCalledWith([
      { assetId: 'a', position: { x: 50, y: 60 } },
    ]);
  });

  it('coalesces rapid drags into a single persist', () => {
    const assets = [asset('a')];
    const onPersist = vi.fn();
    const { result } = renderHook(() =>
      useMoodBoardCanvas({ assets, savedLayout: EMPTY_LAYOUT, onPersist }),
    );

    act(() => {
      result.current.onNodeDragStop();
      vi.advanceTimersByTime(500);
      result.current.onNodeDragStop();
      vi.advanceTimersByTime(MOOD_BOARD_AUTOSAVE_DEBOUNCE_MS);
    });

    expect(onPersist).toHaveBeenCalledTimes(1);
  });
});
