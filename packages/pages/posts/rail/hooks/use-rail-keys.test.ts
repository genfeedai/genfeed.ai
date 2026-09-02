import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRailKeys } from './use-rail-keys';

function fireKey(key: string, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { bubbles: true, key });
  Object.defineProperty(event, 'target', { value: target });
  window.dispatchEvent(event);
}

describe('useRailKeys', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('advances the active index on j and ArrowDown', () => {
    const { result } = renderHook(() => useRailKeys({ itemCount: 3 }));

    act(() => fireKey('j'));
    expect(result.current.activeIndex).toBe(1);

    act(() => fireKey('ArrowDown'));
    expect(result.current.activeIndex).toBe(2);

    act(() => fireKey('ArrowDown'));
    expect(result.current.activeIndex).toBe(2);
  });

  it('retreats the active index on k and ArrowUp', () => {
    const { result } = renderHook(() => useRailKeys({ itemCount: 3 }));

    act(() => fireKey('j'));
    act(() => fireKey('j'));
    expect(result.current.activeIndex).toBe(2);

    act(() => fireKey('k'));
    expect(result.current.activeIndex).toBe(1);

    act(() => fireKey('ArrowUp'));
    expect(result.current.activeIndex).toBe(0);

    act(() => fireKey('ArrowUp'));
    expect(result.current.activeIndex).toBe(0);
  });

  it('calls onOpen with the active index on Enter', () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() => useRailKeys({ itemCount: 3, onOpen }));

    act(() => fireKey('j'));
    act(() => fireKey('Enter'));

    expect(onOpen).toHaveBeenCalledWith(1);
    expect(result.current.activeIndex).toBe(1);
  });

  it('calls onRefresh on r', () => {
    const onRefresh = vi.fn();
    renderHook(() => useRailKeys({ itemCount: 3, onRefresh }));

    act(() => fireKey('r'));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('ignores key presses while focus is in a text-entry control', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { result } = renderHook(() => useRailKeys({ itemCount: 3 }));

    act(() => fireKey('j', input));

    expect(result.current.activeIndex).toBe(0);
    document.body.removeChild(input);
  });

  it('clamps the active index when itemCount shrinks', () => {
    const { result, rerender } = renderHook(
      ({ itemCount }: { itemCount: number }) => useRailKeys({ itemCount }),
      { initialProps: { itemCount: 5 } },
    );

    act(() => fireKey('j'));
    act(() => fireKey('j'));
    act(() => fireKey('j'));
    expect(result.current.activeIndex).toBe(3);

    rerender({ itemCount: 2 });
    expect(result.current.activeIndex).toBe(1);
  });

  it('resets the active index to zero when itemCount reaches zero', () => {
    const { result, rerender } = renderHook(
      ({ itemCount }: { itemCount: number }) => useRailKeys({ itemCount }),
      { initialProps: { itemCount: 3 } },
    );

    act(() => fireKey('j'));
    expect(result.current.activeIndex).toBe(1);

    rerender({ itemCount: 0 });
    expect(result.current.activeIndex).toBe(0);
  });
});
