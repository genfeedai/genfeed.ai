import { usePromptBarRowFit } from '@hooks/prompt-bar/use-prompt-bar-row-fit/use-prompt-bar-row-fit';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function createRow(clientWidth: number, scrollWidth: number) {
  const row = document.createElement('div');
  Object.defineProperty(row, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  });
  Object.defineProperty(row, 'scrollWidth', {
    configurable: true,
    get: () => scrollWidth,
  });
  return {
    resize(nextClientWidth: number, nextScrollWidth: number) {
      clientWidth = nextClientWidth;
      scrollWidth = nextScrollWidth;
    },
    row,
  };
}

describe('usePromptBarRowFit', () => {
  const observers: Array<() => void> = [];

  afterEach(() => {
    observers.length = 0;
    vi.unstubAllGlobals();
  });

  function stubResizeObserver() {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
  }

  it('stays full while the row fits', () => {
    stubResizeObserver();
    const { row } = createRow(400, 400);
    const { result } = renderHook(() =>
      usePromptBarRowFit({ contentKey: 'a', rowRef: { current: row } }),
    );

    expect(result.current.isCompact).toBe(false);
  });

  it('compacts on overflow and expands once the full width fits again', () => {
    stubResizeObserver();
    const sized = createRow(300, 520);
    const { result } = renderHook(() =>
      usePromptBarRowFit({ contentKey: 'a', rowRef: { current: sized.row } }),
    );
    expect(result.current.isCompact).toBe(true);

    sized.resize(480, 480);
    act(() => observers.at(-1)?.());
    expect(result.current.isCompact).toBe(true);

    sized.resize(560, 560);
    act(() => observers.at(-1)?.());
    expect(result.current.isCompact).toBe(false);
  });

  it('measures again when the content changes', () => {
    stubResizeObserver();
    const sized = createRow(300, 520);
    const { rerender, result } = renderHook(
      ({ contentKey }) =>
        usePromptBarRowFit({ contentKey, rowRef: { current: sized.row } }),
      { initialProps: { contentKey: 'a' } },
    );
    expect(result.current.isCompact).toBe(true);

    sized.resize(300, 200);
    rerender({ contentKey: 'b' });
    expect(result.current.isCompact).toBe(false);
  });
});
