// @vitest-environment jsdom
'use client';

import {
  PostsLayoutContext,
  usePostsLayout,
} from '@genfeedai/contexts/posts/posts-layout-context';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

describe('usePostsLayout', () => {
  it('returns callable no-op defaults outside a provider', () => {
    const { result } = renderHook(() => usePostsLayout());

    expect(() => {
      result.current.setExportNode(null);
      result.current.setFiltersNode(null);
      result.current.setIsRefreshing(true);
      result.current.setRefresh(() => undefined);
      result.current.setScheduleActionsNode(null);
      result.current.setViewToggleNode(null);
    }).not.toThrow();
  });

  it('returns the provided context value inside a provider', () => {
    const value = {
      setExportNode: vi.fn(),
      setFiltersNode: vi.fn(),
      setIsRefreshing: vi.fn(),
      setRefresh: vi.fn(),
      setScheduleActionsNode: vi.fn(),
      setViewToggleNode: vi.fn(),
    };

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <PostsLayoutContext.Provider value={value}>
          {children}
        </PostsLayoutContext.Provider>
      );
    }

    const { result } = renderHook(() => usePostsLayout(), {
      wrapper: Wrapper,
    });

    result.current.setIsRefreshing(true);
    expect(value.setIsRefreshing).toHaveBeenCalledWith(true);
    expect(result.current.setRefresh).toBe(value.setRefresh);
  });
});
