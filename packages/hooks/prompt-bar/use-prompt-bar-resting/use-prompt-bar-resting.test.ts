import { usePromptBarResting } from '@hooks/prompt-bar/use-prompt-bar-resting/use-prompt-bar-resting';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function createScroller(): HTMLDivElement {
  const scroller = document.createElement('div');
  Object.defineProperties(scroller, {
    clientHeight: { configurable: true, value: 400 },
    scrollHeight: { configurable: true, value: 2000 },
  });
  document.body.append(scroller);
  return scroller;
}

function scrollTo(scroller: HTMLDivElement, top: number) {
  scroller.scrollTop = top;
  scroller.dispatchEvent(new Event('scroll'));
}

describe('usePromptBarResting', () => {
  it('rests while browsing and opens again at the end', () => {
    const scroller = createScroller();
    const composer = document.createElement('div');
    const { result } = renderHook(() =>
      usePromptBarResting({
        composerRef: { current: composer },
        scrollRef: { current: scroller },
      }),
    );

    expect(result.current.isResting).toBe(false);
    act(() => scrollTo(scroller, 40));
    expect(result.current.isResting).toBe(true);
    act(() => scrollTo(scroller, 1600));
    expect(result.current.isResting).toBe(false);
  });

  it('stays open while disabled and expands on request', () => {
    const scroller = createScroller();
    const composer = document.createElement('div');
    const { rerender, result } = renderHook(
      ({ isEnabled }: { isEnabled: boolean }) =>
        usePromptBarResting({
          composerRef: { current: composer },
          isEnabled,
          scrollRef: { current: scroller },
        }),
      { initialProps: { isEnabled: false } },
    );

    act(() => scrollTo(scroller, 60));
    expect(result.current.isResting).toBe(false);

    rerender({ isEnabled: true });
    act(() => scrollTo(scroller, 120));
    expect(result.current.isResting).toBe(true);
    act(() => result.current.expand());
    expect(result.current.isResting).toBe(false);
  });
});
