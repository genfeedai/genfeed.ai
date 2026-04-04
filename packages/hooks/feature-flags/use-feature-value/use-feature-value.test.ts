import { useFeatureValue } from '@hooks/feature-flags/use-feature-value/use-feature-value';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockUseFeatureValue = vi.fn();

vi.mock('@growthbook/growthbook-react', () => ({
  useFeatureValue: (...args: unknown[]) => mockUseFeatureValue(...args),
}));

describe('useFeatureValue', () => {
  it('returns the flag value when available', () => {
    mockUseFeatureValue.mockReturnValue(42);

    const { result } = renderHook(() => useFeatureValue('max_items', 20));
    expect(result.current).toBe(42);
  });

  it('returns the default value when flag is not set', () => {
    mockUseFeatureValue.mockImplementation(
      (_key: string, defaultValue: unknown) => defaultValue,
    );

    const { result } = renderHook(() =>
      useFeatureValue('missing_flag', 'fallback'),
    );
    expect(result.current).toBe('fallback');
  });

  it('passes the flag key and default to the underlying hook', () => {
    mockUseFeatureValue.mockReturnValue(true);

    renderHook(() => useFeatureValue('my_flag', false));

    expect(mockUseFeatureValue).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('works with numeric values', () => {
    mockUseFeatureValue.mockReturnValue(100);

    const { result } = renderHook(() => useFeatureValue('rate_limit', 50));
    expect(result.current).toBe(100);
  });

  it('works with string values', () => {
    mockUseFeatureValue.mockReturnValue('variant_b');

    const { result } = renderHook(() =>
      useFeatureValue('experiment_group', 'control'),
    );
    expect(result.current).toBe('variant_b');
  });
});
