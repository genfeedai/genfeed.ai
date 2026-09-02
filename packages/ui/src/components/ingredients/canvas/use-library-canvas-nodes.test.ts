import type {
  IIngredient,
  IMoodBoardLayoutItem,
} from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIBRARY_CANVAS_AUTOSAVE_DEBOUNCE_MS,
  useLibraryCanvasNodes,
} from './use-library-canvas-nodes';

function asset(id: string): IIngredient {
  return { id, isDeleted: false } as IIngredient;
}

// Stable references: the hydration effect keys on ingredients/savedLayout
// identity, so inline arrays would re-fire it every render (mirrors real
// useState/useMemo inputs from the consumer).
const EMPTY_LAYOUT: IMoodBoardLayoutItem[] = [];

describe('useLibraryCanvasNodes', () => {
  // Only fake the timer functions the debounce uses; faking nextTick/Date as
  // well leaves the vitest worker unable to terminate cleanly.
  beforeEach(() =>
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }),
  );
  afterEach(() => vi.useRealTimers());

  it('hydrates one node per ingredient', () => {
    const ingredients = [asset('a'), asset('b')];
    const { result } = renderHook(() =>
      useLibraryCanvasNodes({
        ingredients,
        savedLayout: EMPTY_LAYOUT,
        onPersist: vi.fn(),
      }),
    );

    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.nodes[0]).toMatchObject({
      id: 'a',
      type: 'libraryAsset',
    });
  });

  it('persists the moved layout once after the debounce window', () => {
    const ingredients = [asset('a')];
    const onPersist = vi.fn();
    const { result } = renderHook(() =>
      useLibraryCanvasNodes({
        ingredients,
        savedLayout: EMPTY_LAYOUT,
        onPersist,
      }),
    );

    act(() => {
      result.current.onNodesChange([
        { id: 'a', type: 'position', position: { x: 50, y: 60 } },
      ]);
      result.current.onNodeDragStop();
    });

    act(() => {
      vi.advanceTimersByTime(LIBRARY_CANVAS_AUTOSAVE_DEBOUNCE_MS - 1);
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

  it('applies a saved layout that arrives after the ingredients', () => {
    const ingredients = [asset('a')];
    const { rerender, result } = renderHook(
      ({ savedLayout }: { savedLayout: IMoodBoardLayoutItem[] }) =>
        useLibraryCanvasNodes({
          ingredients,
          savedLayout,
          onPersist: vi.fn(),
        }),
      { initialProps: { savedLayout: EMPTY_LAYOUT } },
    );

    // Seeded into a grid slot because the layout had not loaded yet.
    const seeded = result.current.nodes[0].position;

    rerender({ savedLayout: [{ assetId: 'a', position: { x: 300, y: 400 } }] });

    expect(result.current.nodes[0].position).toEqual({ x: 300, y: 400 });
    expect(result.current.nodes[0].position).not.toEqual(seeded);
  });

  it('keeps an undrafted drag when only the ingredients change', () => {
    const savedLayout: IMoodBoardLayoutItem[] = [];
    const { rerender, result } = renderHook(
      ({ ingredients }: { ingredients: IIngredient[] }) =>
        useLibraryCanvasNodes({
          ingredients,
          savedLayout,
          onPersist: vi.fn(),
        }),
      { initialProps: { ingredients: [asset('a')] } },
    );

    act(() => {
      result.current.onNodesChange([
        { id: 'a', type: 'position', position: { x: 50, y: 60 } },
      ]);
    });

    // A later asset page, or a widened filter, must not snap the dragged tile
    // back into its grid slot.
    rerender({ ingredients: [asset('a'), asset('b')] });

    expect(result.current.nodes[0].position).toEqual({ x: 50, y: 60 });
  });

  it('coalesces rapid drags into a single persist', () => {
    const ingredients = [asset('a')];
    const onPersist = vi.fn();
    const { result } = renderHook(() =>
      useLibraryCanvasNodes({
        ingredients,
        savedLayout: EMPTY_LAYOUT,
        onPersist,
      }),
    );

    act(() => {
      result.current.onNodeDragStop();
      vi.advanceTimersByTime(500);
      result.current.onNodeDragStop();
      vi.advanceTimersByTime(LIBRARY_CANVAS_AUTOSAVE_DEBOUNCE_MS);
    });

    expect(onPersist).toHaveBeenCalledTimes(1);
  });
});
