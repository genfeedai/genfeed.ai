import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrefetchOnIntent } from './use-prefetch-on-intent';

const router = vi.hoisted(() => ({ prefetch: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('usePrefetchOnIntent', () => {
  beforeEach(() => {
    router.prefetch.mockClear();
  });

  it('prepares the destination on hover, focus and pointer down', () => {
    const { result } = renderHook(() => usePrefetchOnIntent());
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
    const { result } = renderHook(() => usePrefetchOnIntent());

    result.current('https://docs.genfeed.ai').onPointerEnter();
    result.current(undefined).onFocus();

    expect(router.prefetch).not.toHaveBeenCalled();
  });
});
