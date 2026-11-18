import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSyncedState } from './use-synced-state';

describe('useSyncedState', () => {
  it('starts from the source value', () => {
    const { result } = renderHook(() => useSyncedState('a'));

    expect(result.current[0]).toBe('a');
  });

  it('keeps a local edit while the source is unchanged', () => {
    const { result, rerender } = renderHook(
      ({ source }) => useSyncedState(source),
      { initialProps: { source: 'a' } },
    );

    act(() => result.current[1]('edited'));
    rerender({ source: 'a' });

    expect(result.current[0]).toBe('edited');
  });

  it('resets to the new source and drops a local edit when the source changes', () => {
    const { result, rerender } = renderHook(
      ({ source }) => useSyncedState(source),
      { initialProps: { source: 'a' } },
    );

    act(() => result.current[1]('edited'));
    rerender({ source: 'b' });

    expect(result.current[0]).toBe('b');
  });

  it('accepts updater functions', () => {
    const { result } = renderHook(() => useSyncedState(1));

    act(() => result.current[1]((count) => count + 1));

    expect(result.current[0]).toBe(2);
  });
});
