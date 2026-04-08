import { GrowthBookContext } from '@growthbook/growthbook-react';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

describe('useFeatureFlag', () => {
  function createWrapper(value?: {
    growthbook?: { isOn: (key: string) => boolean };
  }): ({ children }: { children: ReactNode }) => ReactNode {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        GrowthBookContext.Provider,
        { value: value as never },
        children,
      );
    };
  }

  it('returns true when the flag is on', () => {
    const { result } = renderHook(() => useFeatureFlag('enabled_flag'), {
      wrapper: createWrapper({
        growthbook: { isOn: (key: string) => key === 'enabled_flag' },
      }),
    });

    expect(result.current).toBe(true);
  });

  it('returns false when the flag is off', () => {
    const { result } = renderHook(() => useFeatureFlag('disabled_flag'), {
      wrapper: createWrapper({
        growthbook: { isOn: (key: string) => key === 'enabled_flag' },
      }),
    });

    expect(result.current).toBe(false);
  });

  it('returns a boolean value', () => {
    const { result } = renderHook(() => useFeatureFlag('any_flag'), {
      wrapper: createWrapper({
        growthbook: { isOn: () => true },
      }),
    });

    expect(typeof result.current).toBe('boolean');
  });

  it('returns false when no GrowthBook provider is available', () => {
    const { result } = renderHook(() => useFeatureFlag('enabled_flag'), {
      wrapper: createWrapper(undefined),
    });

    expect(result.current).toBe(false);
  });
});
