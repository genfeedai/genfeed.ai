// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetToken = vi.fn().mockResolvedValue('test-token');
const mockUseAuthIdentity = vi.fn();
const mockUseBrand = vi.fn(() => ({
  brandId: 'brand-1',
  isReady: true,
  organizationId: 'org-1',
}));
const mockPageScope = vi.hoisted(() => ({
  current: 'brand' as 'org' | 'brand',
}));
const mockFindAll = vi.fn();
const mockPostingSignaturesServiceInstance = {
  findAll: mockFindAll,
};

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mockUseAuthIdentity(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@hooks/navigation/use-page-scope/use-page-scope', () => ({
  usePageScope: () => mockPageScope.current,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => mockPostingSignaturesServiceInstance,
}));

vi.mock('@genfeedai/services/content/posting-signatures.service', () => ({
  PostingSignaturesService: {
    getInstance: vi.fn(() => mockPostingSignaturesServiceInstance),
  },
}));

describe('usePostingSignatures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAll.mockResolvedValue([]);
    mockGetToken.mockResolvedValue('test-token');
    mockUseAuthIdentity.mockReturnValue({
      getToken: mockGetToken,
      isSignedIn: true,
    });
    mockPageScope.current = 'brand';
    mockUseBrand.mockReturnValue({
      brandId: 'brand-1',
      isReady: true,
      organizationId: 'org-1',
    });
  });

  it('loads brand posting signatures through the existing list endpoint', async () => {
    const { usePostingSignatures } = await import('./use-posting-signatures');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => usePostingSignatures(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFindAll).toHaveBeenCalledWith({
      brandId: 'brand-1',
      isEnabled: true,
      limit: 100,
    });
    expect(result.current.signatures).toEqual([]);
  });
});
