// @vitest-environment jsdom
'use client';

import {
  ModelsProvider,
  useModelsContext,
} from '@genfeedai/contexts/models/models-context/models-context';
import type { IModelsContextType } from '@genfeedai/contracts/interfaces/models/models-context.interface';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let contextValue: IModelsContextType;

function Consumer(): null {
  contextValue = useModelsContext();
  return null;
}

function renderWithProvider(): void {
  render(
    <ModelsProvider>
      <Consumer />
    </ModelsProvider>,
  );
}

describe('ModelsProvider', () => {
  it('exposes null refreshModels until a refresh function is registered', () => {
    renderWithProvider();
    expect(contextValue.refreshModels).toBeNull();
    expect(contextValue.isRefreshing).toBe(false);
  });

  it('runs the registered refresh function and toggles isRefreshing', async () => {
    renderWithProvider();

    let resolveRefresh: (() => void) | undefined;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    act(() => {
      contextValue.setRefreshModels(refresh);
    });
    expect(contextValue.refreshModels).not.toBeNull();

    act(() => {
      contextValue.refreshModels?.();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(contextValue.isRefreshing).toBe(true);

    await act(async () => {
      resolveRefresh?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(contextValue.isRefreshing).toBe(false);
    });
  });

  it('clears the refresh function when set to null', () => {
    renderWithProvider();

    act(() => {
      contextValue.setRefreshModels(vi.fn().mockResolvedValue(undefined));
    });
    expect(contextValue.refreshModels).not.toBeNull();

    act(() => {
      contextValue.setRefreshModels(null);
    });
    expect(contextValue.refreshModels).toBeNull();
  });

  it('updates filters and accepts query updates', () => {
    renderWithProvider();

    act(() => {
      contextValue.setFilters({
        category: 'image',
        format: '',
        provider: '',
        search: 'flux',
        status: '',
        type: '',
      });
      contextValue.setQuery({ search: 'flux' });
    });

    expect(contextValue.filters.category).toBe('image');
    expect(contextValue.filters.search).toBe('flux');
  });

  it('provides callable no-op defaults outside the provider', () => {
    const { result } = renderHook(() => useModelsContext());

    expect(result.current.refreshModels).toBeNull();
    expect(() => {
      result.current.setFilters({
        category: '',
        format: '',
        provider: '',
        search: '',
        status: '',
        type: '',
      });
      result.current.setQuery({});
      result.current.setRefreshModels(null);
    }).not.toThrow();
  });
});
