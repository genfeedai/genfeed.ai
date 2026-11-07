import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useElementHeight } from '@/features/studio/playground/hooks/useElementHeight';

type ResizeCallback = () => void;

function stubResizeObserver() {
  const callbacks: ResizeCallback[] = [];
  const disconnected: ResizeCallback[] = [];
  class FakeResizeObserver {
    constructor(private readonly callback: ResizeCallback) {
      callbacks.push(callback);
    }
    observe() {}
    disconnect() {
      disconnected.push(this.callback);
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return { callbacks, disconnected };
}

function elementWithHeight(height: number) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    value: height,
  });
  return element;
}

describe('useElementHeight', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports the height each time the element resizes', () => {
    const observer = stubResizeObserver();
    const element = elementWithHeight(120);
    const { result } = renderHook(() => useElementHeight({ current: element }));
    expect(result.current).toBeNull();

    act(() => observer.callbacks[0]?.());
    expect(result.current).toBe(120);

    Object.defineProperty(element, 'offsetHeight', { value: 184 });
    act(() => observer.callbacks[0]?.());
    expect(result.current).toBe(184);
  });

  it('stops observing on unmount', () => {
    const observer = stubResizeObserver();
    const { unmount } = renderHook(() =>
      useElementHeight({ current: elementWithHeight(80) }),
    );

    unmount();

    expect(observer.disconnected).toHaveLength(1);
  });

  it('stays null without an element or without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { result } = renderHook(() =>
      useElementHeight({ current: elementWithHeight(80) }),
    );
    const { result: detached } = renderHook(() =>
      useElementHeight({ current: null }),
    );

    expect(result.current).toBeNull();
    expect(detached.current).toBeNull();
  });
});
