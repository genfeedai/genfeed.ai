// @vitest-environment jsdom
'use client';

import {
  TrainingsProvider,
  useTrainingsContext,
} from '@genfeedai/contexts/models/trainings-context/trainings-context';
import type { ITrainingsContextType } from '@genfeedai/contracts/interfaces/models/trainings-context.interface';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let contextValue: ITrainingsContextType;

function Consumer(): null {
  contextValue = useTrainingsContext();
  return null;
}

function renderWithProvider(): void {
  render(
    <TrainingsProvider>
      <Consumer />
    </TrainingsProvider>,
  );
}

describe('TrainingsProvider', () => {
  it('exposes null refreshTrainings until a refresh function is registered', () => {
    renderWithProvider();
    expect(contextValue.refreshTrainings).toBeNull();
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
      contextValue.setRefreshTrainings(refresh);
    });
    expect(contextValue.refreshTrainings).not.toBeNull();

    act(() => {
      contextValue.refreshTrainings?.();
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
      contextValue.setRefreshTrainings(vi.fn().mockResolvedValue(undefined));
    });
    expect(contextValue.refreshTrainings).not.toBeNull();

    act(() => {
      contextValue.setRefreshTrainings(null);
    });
    expect(contextValue.refreshTrainings).toBeNull();
  });

  it('provides callable no-op defaults outside the provider', () => {
    const { result } = renderHook(() => useTrainingsContext());

    expect(result.current.refreshTrainings).toBeNull();
    expect(() => {
      result.current.setRefreshTrainings(null);
    }).not.toThrow();
  });
});
