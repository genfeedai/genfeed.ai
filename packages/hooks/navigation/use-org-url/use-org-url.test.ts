import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'my-brand', orgSlug: 'genfeed-ai' }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: { slug: 'fallback-brand' },
  }),
}));

describe('useOrgUrl', () => {
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
});
