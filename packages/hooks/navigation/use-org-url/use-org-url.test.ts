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

const mockUsePathname = vi.hoisted(() =>
  vi.fn(() => '/genfeed-ai/my-brand/workspace'),
);

vi.mock('next/navigation', () => ({
  useParams: mockUseParams,
  usePathname: mockUsePathname,
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
    mockUsePathname.mockReturnValue('/genfeed-ai/my-brand/workspace');
  });

  it('should return orgSlug and brandSlug from params', () => {
    const { result } = renderHook(() => useOrgUrl());
    expect(result.current.orgSlug).toBe('genfeed-ai');
    expect(result.current.brandSlug).toBe('my-brand');
  });

  it('should build brand-scoped href', () => {
    const { result } = renderHook(() => useOrgUrl());
    expect(result.current.href('/workspace')).toBe(
      '/genfeed-ai/my-brand/workspace',
    );
  });

  it('should build org-level href with ~ segment', () => {
    const { result } = renderHook(() => useOrgUrl());
    expect(result.current.orgHref('/settings')).toBe('/genfeed-ai/~/settings');
  });

  it('should handle paths without leading slash', () => {
    const { result } = renderHook(() => useOrgUrl());
    expect(result.current.href('studio/storyboard')).toBe(
      '/genfeed-ai/my-brand/studio/storyboard',
    );
    expect(result.current.orgHref('billing')).toBe('/genfeed-ai/~/billing');
  });

  it('falls back to brand context slugs when route params are missing', () => {
    mockUseParams.mockReturnValue({});
    mockUsePathname.mockReturnValue('/admin/organization');
    const { result } = renderHook(() => useOrgUrl());

    expect(result.current.orgSlug).toBe('fallback-org');
    expect(result.current.brandSlug).toBe('fallback-brand');
    expect(result.current.href('/workspace')).toBe(
      '/fallback-org/fallback-brand/workspace',
    );
    expect(result.current.orgHref('/settings')).toBe(
      '/fallback-org/~/settings',
    );
  });

  it('keeps org-scoped routes brandless when a selected brand exists', () => {
    mockUseParams.mockReturnValue({ orgSlug: 'genfeed-ai' });
    mockUsePathname.mockReturnValue('/genfeed-ai/~/library/videos');
    mockBrandState.selectedBrand = {
      organization: { slug: 'genfeed-ai' },
      slug: 'selected-brand',
    };

    const { result } = renderHook(() => useOrgUrl());

    expect(result.current.orgSlug).toBe('genfeed-ai');
    expect(result.current.brandSlug).toBe('');
    expect(result.current.href('/library/videos')).toBe(
      '/genfeed-ai/~/library/videos',
    );
    expect(result.current.activeHref('/agent/new')).toBe(
      '/genfeed-ai/selected-brand/agent/new',
    );
  });

  it('builds canonical org overview href when no active brand is available', () => {
    mockUseParams.mockReturnValue({ orgSlug: 'genfeed-ai' });
    mockUsePathname.mockReturnValue('/genfeed-ai/~/workspace/overview');
    mockBrandState.selectedBrand = null;

    const { result } = renderHook(() => useOrgUrl());

    expect(result.current.brandSlug).toBe('');
    expect(result.current.href('/workspace/overview')).toBe(
      '/genfeed-ai/~/workspace/overview',
    );
    expect(result.current.activeHref('/agent/new')).toBe(
      '/genfeed-ai/~/agent/new',
    );
  });

  it('reads org/brand from the pathname when layout params are missing', () => {
    mockUseParams.mockReturnValue({});
    mockUsePathname.mockReturnValue('/demo/FUDNEWS/library/images');
    mockBrandState.selectedBrand = {
      organization: { slug: 'demo' },
      slug: 'boxingcouple',
    };

    const { result } = renderHook(() => useOrgUrl());

    expect(result.current.orgSlug).toBe('demo');
    expect(result.current.brandSlug).toBe('FUDNEWS');
    expect(result.current.href('/agent/new')).toBe('/demo/FUDNEWS/agent/new');
    expect(result.current.href('/workspace')).toBe('/demo/FUDNEWS/workspace');
    expect(result.current.activeHref('/workspace')).toBe(
      '/demo/FUDNEWS/workspace',
    );
    expect(result.current.activeHref('/agent/new')).toBe(
      '/demo/FUDNEWS/agent/new',
    );
  });
});
