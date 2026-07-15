import { FeatureFlagProvider } from '@hooks/feature-flags/provider/FeatureFlagProvider';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('useFeatureFlag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createWrapper(
    defaults?: Record<string, unknown>,
  ): ({ children }: { children: ReactNode }) => ReactNode {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(FeatureFlagProvider, { defaults }, children);
    };
  }

  it('returns true when the flag is on', () => {
    const { result } = renderHook(() => useFeatureFlag('enabled_flag'), {
      wrapper: createWrapper({ enabled_flag: true }),
    });

    expect(result.current).toBe(true);
  });

  it('returns false when the flag is off', () => {
    const { result } = renderHook(() => useFeatureFlag('disabled_flag'), {
      wrapper: createWrapper({ disabled_flag: false }),
    });

    expect(result.current).toBe(false);
  });

  it('returns a boolean value', () => {
    const { result } = renderHook(() => useFeatureFlag('any_flag'), {
      wrapper: createWrapper({ any_flag: true }),
    });

    expect(typeof result.current).toBe('boolean');
  });

  it('returns true when no provider is configured (OSS default)', () => {
    const { result } = renderHook(() => useFeatureFlag('enabled_flag'));

    expect(result.current).toBe(true);
  });

  it('fails the conversation shell closed when no provider is configured', () => {
    const { result } = renderHook(() => useFeatureFlag('conversation_shell'));

    expect(result.current).toBe(false);
  });

  it('fails the conversation shell closed when configured defaults omit the flag', () => {
    const { result } = renderHook(() => useFeatureFlag('conversation_shell'), {
      wrapper: createWrapper({ some_other_flag: true }),
    });

    expect(result.current).toBe(false);
  });

  it('disables the conversation shell only when explicitly configured false', () => {
    const { result } = renderHook(() => useFeatureFlag('conversation_shell'), {
      wrapper: createWrapper({ conversation_shell: false }),
    });

    expect(result.current).toBe(false);
  });

  it('keeps the conversation shell on when explicitly configured true', () => {
    const { result } = renderHook(() => useFeatureFlag('conversation_shell'), {
      wrapper: createWrapper({ conversation_shell: true }),
    });

    expect(result.current).toBe(true);
  });

  it('fails the conversation shell closed when environment defaults are invalid', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS', 'not-json');

    const { result } = renderHook(() => useFeatureFlag('conversation_shell'), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe(false);
  });

  it('returns false when environment defaults are invalid', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS', 'not-json');

    const { result } = renderHook(() => useFeatureFlag('enabled_flag'), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe(false);
  });
});
