import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockUseGrowthBook = vi.fn<
  () => { isOn: (key: string) => boolean } | undefined
>(() => ({
  isOn: (key: string) => key === 'enabled_flag',
}));

vi.mock('@growthbook/growthbook-react', () => ({
  useGrowthBook: () => mockUseGrowthBook(),
}));

describe('useFeatureFlag', () => {
  it('returns true when the flag is on', () => {
    const { result } = renderHook(() => useFeatureFlag('enabled_flag'));
    expect(result.current).toBe(true);
  });

  it('returns false when the flag is off', () => {
    const { result } = renderHook(() => useFeatureFlag('disabled_flag'));
    expect(result.current).toBe(false);
  });

  it('returns a boolean value', () => {
    const { result } = renderHook(() => useFeatureFlag('any_flag'));
    expect(typeof result.current).toBe('boolean');
  });

  it('returns false when no GrowthBook provider is available', () => {
    mockUseGrowthBook.mockReturnValueOnce(undefined);
    const { result } = renderHook(() => useFeatureFlag('enabled_flag'));
    expect(result.current).toBe(false);
  });
});
