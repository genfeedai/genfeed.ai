import { renderHook } from '@testing-library/react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrefetchOnIntent } from './use-prefetch-on-intent';

const router = { prefetch: vi.fn() };

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AppRouterContext.Provider value={router as unknown as AppRouterInstance}>
      {children}
    </AppRouterContext.Provider>
  );
}

describe('usePrefetchOnIntent', () => {
  beforeEach(() => {
    router.prefetch.mockClear();
  });

  it('prepares the destination on hover, focus and pointer down', () => {
    const { result } = renderHook(() => usePrefetchOnIntent(), { wrapper });
    const props = result.current('/acme/brand/posts/1');

    props.onPointerEnter();
    props.onFocus();
    props.onPointerDown();

    expect(router.prefetch.mock.calls).toEqual([
      ['/acme/brand/posts/1'],
      ['/acme/brand/posts/1'],
      ['/acme/brand/posts/1'],
    ]);
  });

  it('ignores external and missing destinations', () => {
    const { result } = renderHook(() => usePrefetchOnIntent(), { wrapper });

    result.current('https://docs.genfeed.ai').onPointerEnter();
    result.current(undefined).onFocus();

    expect(router.prefetch).not.toHaveBeenCalled();
  });

  it('does nothing where no app router is mounted', () => {
    const { result } = renderHook(() => usePrefetchOnIntent());

    expect(() => result.current('/acme/brand/posts/1').onFocus()).not.toThrow();
  });
});
