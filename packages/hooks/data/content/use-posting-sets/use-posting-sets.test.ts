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
const mockPost = vi.fn();
const mockExpand = vi.fn();
const mockPostingSetsServiceInstance = {
  expand: mockExpand,
  findAll: mockFindAll,
  post: mockPost,
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
  useAuthedService: () => async () => mockPostingSetsServiceInstance,
}));

vi.mock('@genfeedai/services/content/posting-sets.service', () => ({
  PostingSetsService: {
    getInstance: vi.fn(() => mockPostingSetsServiceInstance),
  },
}));

describe('usePostingSets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAll.mockResolvedValue([]);
    mockExpand.mockResolvedValue({ targets: [] });
    mockPost.mockResolvedValue({ id: 'set-1', label: 'Launch' });
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

  it('loads brand posting sets through the existing list endpoint', async () => {
    const { usePostingSets } = await import('./use-posting-sets');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => usePostingSets(), {
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
    expect(result.current.sets).toEqual([]);
  });

  it('expands a posting set through the expand endpoint', async () => {
    mockExpand.mockResolvedValue({
      targets: [{ credentialId: 'cred-x', platform: 'twitter' }],
    });
    const { usePostingSets } = await import('./use-posting-sets');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => usePostingSets(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(
      result.current.expandSet('set-1', { timezone: 'Europe/Malta' }),
    ).resolves.toEqual([{ credentialId: 'cred-x', platform: 'twitter' }]);
    expect(mockExpand).toHaveBeenCalledWith('set-1', {
      timezone: 'Europe/Malta',
    });
  });
});
