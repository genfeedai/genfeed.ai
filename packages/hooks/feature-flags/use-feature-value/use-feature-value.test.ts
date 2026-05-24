import { FeatureFlagProvider } from '@hooks/feature-flags/provider/FeatureFlagProvider';
import { useFeatureValue } from '@hooks/feature-flags/use-feature-value/use-feature-value';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

describe('useFeatureValue', () => {
  function createWrapper(
    defaults?: Record<string, unknown>,
  ): ({ children }: { children: ReactNode }) => ReactNode {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(FeatureFlagProvider, { defaults }, children);
    };
  }

  it('returns the flag value when available', () => {
    const { result } = renderHook(() => useFeatureValue('max_items', 20), {
      wrapper: createWrapper({ max_items: 42 }),
    });
    expect(result.current).toBe(42);
  });

  it('returns the default value when flag is not set', () => {
    const { result } = renderHook(
      () => useFeatureValue('missing_flag', 'fallback'),
      {
        wrapper: createWrapper({ other: true }),
      },
    );
    expect(result.current).toBe('fallback');
  });

  it('works with numeric values', () => {
    const { result } = renderHook(() => useFeatureValue('rate_limit', 50), {
      wrapper: createWrapper({ rate_limit: 100 }),
    });
    expect(result.current).toBe(100);
  });

  it('works with string values', () => {
    const { result } = renderHook(
      () => useFeatureValue('experiment_group', 'control'),
      {
        wrapper: createWrapper({ experiment_group: 'variant_b' }),
      },
    );
    expect(result.current).toBe('variant_b');
  });

  it('returns the default when no provider is configured', () => {
    const { result } = renderHook(
      () => useFeatureValue('my_flag', 'fallback'),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current).toBe('fallback');
  });
});
