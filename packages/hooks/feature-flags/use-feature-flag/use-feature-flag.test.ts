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

  it('returns true when the flag is on', () => {
    const { result } = renderHook(() => useFeatureFlag('studio'), {
      wrapper: createWrapper({ studio: true }),
    });

    expect(result.current).toBe(true);
  });

  it('returns false when the flag is off', () => {
    const { result } = renderHook(() => useFeatureFlag('analytics'), {
      wrapper: createWrapper({ analytics: false }),
    });

    expect(result.current).toBe(false);
  });

  it('returns a boolean value', () => {
    const { result } = renderHook(() => useFeatureFlag('agent'), {
      wrapper: createWrapper({ agent: true }),
    });

    expect(typeof result.current).toBe('boolean');
  });

  it('returns true when no provider is configured (OSS default)', () => {
    const { result } = renderHook(() => useFeatureFlag('studio'));

    expect(result.current).toBe(true);
  });

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

  it('keeps ordinary OSS flags on when only another override is configured', () => {
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        FeatureFlagProvider,
        {
          defaults: {},
          overrides: { server_override: true },
        },
        children,
      );
    }

    const { result } = renderHook(() => useFeatureFlag('analytics'), {
      wrapper: Wrapper,
    });

    expect(result.current).toBe(true);
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
