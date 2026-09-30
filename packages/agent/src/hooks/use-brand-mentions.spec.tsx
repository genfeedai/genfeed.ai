import { useBrandMentions } from '@genfeedai/agent/hooks/use-brand-mentions';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface BrandRow {
  id: string;
  label: string;
  slug: string;
}

const brandState: { brands: BrandRow[]; isReady: boolean } = {
  brands: [],
  isReady: true,
};

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandState,
}));

describe('useBrandMentions', () => {
  beforeEach(() => {
    brandState.brands = [];
    brandState.isReady = true;
  });

  it('maps brands onto mention items', () => {
    brandState.brands = [
      { id: 'b-1', label: 'Acme', slug: 'acme' },
      { id: 'b-2', label: 'Globex', slug: 'globex' },
    ];

    const { result } = renderHook(() => useBrandMentions());

    expect(result.current.mentions).toEqual([
      { brandName: 'Acme', brandSlug: 'acme', id: 'b-1' },
      { brandName: 'Globex', brandSlug: 'globex', id: 'b-2' },
    ]);
    expect(result.current.isLoading).toBe(false);
  });

  it('is loading until the brand context is ready', () => {
    brandState.isReady = false;

    const { result } = renderHook(() => useBrandMentions());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.mentions).toEqual([]);
  });

  it('keeps the mention list referentially stable across rerenders', () => {
    brandState.brands = [{ id: 'b-1', label: 'Acme', slug: 'acme' }];

    const { result, rerender } = renderHook(() => useBrandMentions());
    const first = result.current.mentions;
    rerender();

    expect(result.current.mentions).toBe(first);
  });
});
