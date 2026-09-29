import { usePrefersReducedMotion } from '@hooks/ui/use-prefers-reduced-motion/use-prefers-reduced-motion';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

type ChangeListener = () => void;

function mockReducedMotion(initial: boolean) {
  const listeners = new Set<ChangeListener>();
  const query = {
    addEventListener: vi.fn((_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    }),
    matches: initial,
    removeEventListener: vi.fn((_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    }),
  };
  const matchMedia = vi.fn(() => query);
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    listeners,
    matchMedia,
    set(matches: boolean) {
      query.matches = matches;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function MotionProbe() {
  return <span>{usePrefersReducedMotion() ? 'still' : 'moving'}</span>;
}

describe('usePrefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the reduced motion media query', () => {
    const media = mockReducedMotion(true);

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(true);
    expect(media.matchMedia).toHaveBeenCalledWith(
      '(prefers-reduced-motion: reduce)',
    );
  });

  it('follows the setting while mounted and unsubscribes on unmount', () => {
    const media = mockReducedMotion(false);

    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);

    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('allows motion when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(false);
  });

  it('renders the still state on the server', () => {
    mockReducedMotion(false);

    expect(renderToString(<MotionProbe />)).toContain('still');
  });
});
