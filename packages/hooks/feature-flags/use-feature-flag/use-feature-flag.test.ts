import { FeatureFlagProvider } from '@hooks/feature-flags/provider/FeatureFlagProvider';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

describe('useFeatureFlag', () => {
  function createWrapper(
    defaults?: Record<string, unknown>,
  ): ({ children }: { children: ReactNode }) => ReactNode {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(FeatureFlagProvider, { defaults }, children);
    };
  }

  it('uses an explicit product fallback without changing other OSS flags', () => {
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        FeatureFlagProvider,
        {
          defaults: {},
          fallbacks: { studio: false },
        },
        children,
      );
    }

    const { result: studioResult } = renderHook(
      () => useFeatureFlag('studio'),
      {
        wrapper: Wrapper,
      },
    );
    const { result: analyticsResult } = renderHook(
      () => useFeatureFlag('analytics'),
      {
        wrapper: Wrapper,
      },
    );

    expect(studioResult.current).toBe(false);
    expect(analyticsResult.current).toBe(true);
  });

  it('returns false for a flag missing from configured Admin flags', () => {
    const { result } = renderHook(() => useFeatureFlag('library_canvas'), {
      wrapper: createWrapper({ reply_bot: true }),
    });

    expect(result.current).toBe(false);
  });

  it('honors reply_bot switched off in Admin (#5468)', () => {
    const { result } = renderHook(() => useFeatureFlag('reply_bot'), {
      wrapper: createWrapper({ reply_bot: false }),
    });

    expect(result.current).toBe(false);
  });
});
