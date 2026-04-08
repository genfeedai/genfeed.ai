import { GrowthBookContext } from '@growthbook/growthbook-react';
import { useFeatureValue } from '@hooks/feature-flags/use-feature-value/use-feature-value';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

describe('useFeatureValue', () => {
  function createWrapper(value?: {
    growthbook?: {
      getFeatureValue: (key: string, defaultValue: unknown) => unknown;
    };
  }): ({ children }: { children: ReactNode }) => ReactNode {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        GrowthBookContext.Provider,
        { value: value as never },
        children,
      );
    };
  }

  it('returns the flag value when available', () => {
    const { result } = renderHook(() => useFeatureValue('max_items', 20), {
      wrapper: createWrapper({
        growthbook: {
          getFeatureValue: () => 42,
        },
      }),
    });
    expect(result.current).toBe(42);
  });

  it('returns the default value when flag is not set', () => {
    const { result } = renderHook(
      () => useFeatureValue('missing_flag', 'fallback'),
      {
        wrapper: createWrapper({
          growthbook: {
            getFeatureValue: (_key: string, defaultValue: unknown) =>
              defaultValue,
          },
        }),
      },
    );
    expect(result.current).toBe('fallback');
  });

  it('passes the flag key and default to the underlying hook', () => {
    const getFeatureValue = vi.fn(
      (_key: string, defaultValue: unknown) => defaultValue,
    );

    renderHook(() => useFeatureValue('my_flag', false), {
      wrapper: createWrapper({
        growthbook: {
          getFeatureValue,
        },
      }),
    });

    expect(getFeatureValue).toHaveBeenCalledWith('my_flag', false);
  });

  it('works with numeric values', () => {
    const { result } = renderHook(() => useFeatureValue('rate_limit', 50), {
      wrapper: createWrapper({
        growthbook: {
          getFeatureValue: () => 100,
        },
      }),
    });
    expect(result.current).toBe(100);
  });

  it('works with string values', () => {
    const { result } = renderHook(
      () => useFeatureValue('experiment_group', 'control'),
      {
        wrapper: createWrapper({
          growthbook: {
            getFeatureValue: () => 'variant_b',
          },
        }),
      },
    );
    expect(result.current).toBe('variant_b');
  });

  it('returns the default when no GrowthBook provider is available', () => {
    const { result } = renderHook(
      () => useFeatureValue('my_flag', 'fallback'),
      {
        wrapper: createWrapper(undefined),
      },
    );

    expect(result.current).toBe('fallback');
  });
});
