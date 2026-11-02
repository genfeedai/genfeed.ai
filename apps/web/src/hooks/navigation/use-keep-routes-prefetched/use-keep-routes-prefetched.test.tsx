import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ROUTE_PREFETCH_REFRESH_MS,
  useKeepRoutesPrefetched,
} from './use-keep-routes-prefetched';

const prefetched = vi.hoisted(() => ({ hrefs: [] as string[] }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    prefetch: (href: string) => {
      prefetched.hrefs.push(href);
    },
  }),
}));

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
}

describe('useKeepRoutesPrefetched', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prefetched.hrefs = [];
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prefetches each in-app destination once, skipping external links', async () => {
    renderHook(() =>
      useKeepRoutesPrefetched([
        '/acme/brand/turbo',
        '/acme/brand/turbo',
        '/acme/brand/library/assets',
        'https://docs.genfeed.ai',
      ]),
    );

    await act(() => vi.advanceTimersByTimeAsync(10));

    expect(prefetched.hrefs).toEqual([
      '/acme/brand/turbo',
      '/acme/brand/library/assets',
    ]);
  });

  it('asks again on the refresh interval so an expired entry is fetched back', async () => {
    renderHook(() => useKeepRoutesPrefetched(['/acme/brand/turbo']));

    await act(() => vi.advanceTimersByTimeAsync(10));
    await act(() => vi.advanceTimersByTimeAsync(ROUTE_PREFETCH_REFRESH_MS));

    expect(prefetched.hrefs).toEqual([
      '/acme/brand/turbo',
      '/acme/brand/turbo',
    ]);
  });

  it('waits while the tab is hidden and warms again when it is shown', async () => {
    setVisibility('hidden');
    renderHook(() => useKeepRoutesPrefetched(['/acme/brand/turbo']));

    await act(() => vi.advanceTimersByTimeAsync(ROUTE_PREFETCH_REFRESH_MS));
    expect(prefetched.hrefs).toEqual([]);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await act(() => vi.advanceTimersByTimeAsync(10));

    expect(prefetched.hrefs).toEqual(['/acme/brand/turbo']);
  });

  it('stops once unmounted', async () => {
    const { unmount } = renderHook(() =>
      useKeepRoutesPrefetched(['/acme/brand/turbo']),
    );
    await act(() => vi.advanceTimersByTimeAsync(10));
    unmount();

    await act(() => vi.advanceTimersByTimeAsync(ROUTE_PREFETCH_REFRESH_MS * 2));

    expect(prefetched.hrefs).toEqual(['/acme/brand/turbo']);
  });
});
