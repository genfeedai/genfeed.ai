import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { usePublishingPostsViewPreference } from './use-publishing-posts-view-preference';

function installInMemoryLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
    writable: true,
  });
}

describe('usePublishingPostsViewPreference', () => {
  beforeEach(() => {
    installInMemoryLocalStorage();
  });

  it('returns undefined when nothing has been stored for the brand', () => {
    const { result } = renderHook(() =>
      usePublishingPostsViewPreference('brand-1'),
    );

    expect(result.current.getStoredView()).toBeUndefined();
  });

  it('round trips a stored view for a brand', () => {
    const { result } = renderHook(() =>
      usePublishingPostsViewPreference('brand-1'),
    );

    result.current.storeView('grid');

    expect(result.current.getStoredView()).toBe('grid');
  });

  it('scopes storage per brand', () => {
    const brandOne = renderHook(() =>
      usePublishingPostsViewPreference('brand-1'),
    );
    const brandTwo = renderHook(() =>
      usePublishingPostsViewPreference('brand-2'),
    );

    brandOne.result.current.storeView('board');

    expect(brandOne.result.current.getStoredView()).toBe('board');
    expect(brandTwo.result.current.getStoredView()).toBeUndefined();
  });

  it('ignores a corrupted stored value', () => {
    window.localStorage.setItem(
      'genfeed:publishing:posts-view:brand-1',
      'canvas',
    );

    const { result } = renderHook(() =>
      usePublishingPostsViewPreference('brand-1'),
    );

    expect(result.current.getStoredView()).toBeUndefined();
  });

  it('is a no-op without a brand id', () => {
    const { result } = renderHook(() => usePublishingPostsViewPreference());

    result.current.storeView('board');

    expect(result.current.getStoredView()).toBeUndefined();
  });
});
