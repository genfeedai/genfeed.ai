import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockBrandState, mockUseParams } = vi.hoisted(() => ({
  mockBrandState: {
    selectedBrand: {
      organization: { slug: 'fallback-org' },
      slug: 'fallback-brand',
    } as { organization: { slug: string }; slug: string } | null,
  },
  mockUseParams: vi.fn(() => ({
    brandSlug: 'my-brand',
    orgSlug: 'genfeed-ai',
  })),
}));

vi.mock('next/navigation', () => ({
  useParams: mockUseParams,
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: mockBrandState.selectedBrand,
  }),
}));

import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';

describe('useOrgUrl', () => {
  beforeEach(() => {
    mockBrandState.selectedBrand = {
      organization: { slug: 'fallback-org' },
      slug: 'fallback-brand',
    };
    mockUseParams.mockReturnValue({
      brandSlug: 'my-brand',
      orgSlug: 'genfeed-ai',
    });
  });

  it('should return orgSlug and brandSlug from params', () => {
    const { result } = renderHook(() => useOrgUrl());
    expect(result.current.orgSlug).toBe('genfeed-ai');
    expect(result.current.brandSlug).toBe('my-brand');
  });

  it('should build brand-scoped href', () => {
    const { result } = renderHook(() => useOrgUrl());
    expect(result.current.href('/workspace/overview')).toBe(
      '/genfeed-ai/my-brand/workspace/overview',
    );
  });

  it('should build org-level href with ~ segment', () => {
    const { result } = renderHook(() => useOrgUrl());
    expect(result.current.orgHref('/settings')).toBe('/genfeed-ai/~/settings');
  });

  it('should handle paths without leading slash', () => {
    const { result } = renderHook(() => useOrgUrl());
    expect(result.current.href('studio/image')).toBe(
      '/genfeed-ai/my-brand/studio/image',
    );
    expect(result.current.orgHref('billing')).toBe('/genfeed-ai/~/billing');
  });

  it('falls back to brand context slugs when route params are missing', () => {
    mockUseParams.mockReturnValue({});
    const { result } = renderHook(() => useOrgUrl());

    expect(result.current.orgSlug).toBe('fallback-org');
    expect(result.current.brandSlug).toBe('fallback-brand');
    expect(result.current.href('/workspace/overview')).toBe(
      '/fallback-org/fallback-brand/workspace/overview',
    );
    expect(result.current.orgHref('/settings')).toBe(
      '/fallback-org/~/settings',
    );
  });

  it('falls back to org-scoped href when no active brand is available', () => {
    mockUseParams.mockReturnValue({ orgSlug: 'genfeed-ai' });
    mockBrandState.selectedBrand = null;

    const { result } = renderHook(() => useOrgUrl());

    expect(result.current.brandSlug).toBe('');
    expect(result.current.href('/workspace/overview')).toBe(
      '/genfeed-ai/~/workspace/overview',
    );
  });
});
