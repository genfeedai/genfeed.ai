import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toBrandListParams, useCollectionScope } from './use-collection-scope';

const mocks = vi.hoisted(() => ({
  brandId: 'brand-fud',
  isReady: true,
  organizationId: 'org-demo',
  pageScope: 'brand' as 'org' | 'brand',
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: mocks.brandId,
    isReady: mocks.isReady,
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@hooks/navigation/use-page-scope/use-page-scope', () => ({
  usePageScope: () => mocks.pageScope,
}));

describe('useCollectionScope', () => {
  beforeEach(() => {
    mocks.brandId = 'brand-fud';
    mocks.isReady = true;
    mocks.organizationId = 'org-demo';
    mocks.pageScope = 'brand';
  });

  it('passes the selected brand on brand-scoped routes', () => {
    const { result } = renderHook(() => useCollectionScope());

    expect(result.current).toEqual({
      brandId: 'brand-fud',
      isReady: true,
      organizationId: 'org-demo',
      pageScope: 'brand',
    });
    expect(toBrandListParams(result.current)).toEqual({
      brandId: 'brand-fud',
    });
  });

  it('omits brandId on org routes even if a last-used brand sits in context', () => {
    mocks.pageScope = 'org';

    const { result } = renderHook(() => useCollectionScope());

    expect(result.current.brandId).toBeUndefined();
    expect(result.current.pageScope).toBe('org');
    expect(toBrandListParams(result.current)).toEqual({});
  });
});
