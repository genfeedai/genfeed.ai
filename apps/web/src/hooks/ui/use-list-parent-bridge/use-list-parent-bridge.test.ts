import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useListParentBridge } from './use-list-parent-bridge';

describe('useListParentBridge', () => {
  it('reports the loading and refreshing state to the parent', () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    const { rerender } = renderHook(
      (props: { isLoading: boolean; isRefreshing: boolean }) =>
        useListParentBridge({
          ...props,
          onLoadingChange,
          onRefreshingChange,
          refresh: vi.fn(),
        }),
      { initialProps: { isLoading: true, isRefreshing: false } },
    );

    rerender({ isLoading: false, isRefreshing: true });

    expect(onLoadingChange.mock.calls).toEqual([[true], [false]]);
    expect(onRefreshingChange.mock.calls).toEqual([[false], [true]]);
  });

  it('gives the parent a callback that refreshes the list', () => {
    const refresh = vi.fn();
    const onRefresh = vi.fn();

    renderHook(() =>
      useListParentBridge({
        isLoading: false,
        isRefreshing: false,
        onRefresh,
        refresh,
      }),
    );

    const [registered] = onRefresh.mock.calls[0] as [() => void];
    registered();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not report again when the parent recreates its callbacks', () => {
    const calls: boolean[] = [];

    const { rerender } = renderHook(() =>
      useListParentBridge({
        isLoading: true,
        isRefreshing: false,
        onLoadingChange: (isLoading) => calls.push(isLoading),
        refresh: vi.fn(),
      }),
    );

    rerender();
    rerender();

    expect(calls).toEqual([true]);
  });
});
