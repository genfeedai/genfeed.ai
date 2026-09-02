// @vitest-environment jsdom

import { ContentCampaignStatus } from '@genfeedai/enums';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetToken = vi.fn().mockResolvedValue('test-token');
const mockList = vi.fn();
const mockPageScope = vi.hoisted(() => ({
  current: 'brand' as 'org' | 'brand',
}));
const mockUseBrand = vi.fn(() => ({
  brandId: 'brand-1',
  isReady: true,
  organizationId: 'org-1',
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: mockGetToken }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@hooks/navigation/use-page-scope/use-page-scope', () => ({
  usePageScope: () => mockPageScope.current,
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn().mockResolvedValue('test-token'),
}));

vi.mock('@services/content/campaigns.service', () => ({
  CampaignsService: {
    getInstance: vi.fn(() => ({ list: mockList })),
  },
}));

describe('useCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPageScope.current = 'brand';
    mockUseBrand.mockReturnValue({
      brandId: 'brand-1',
      isReady: true,
      organizationId: 'org-1',
    });
    mockList.mockResolvedValue({
      hasNext: false,
      hasPrevious: false,
      items: [{ id: 'cmp-1', name: 'Q4' }],
      page: 1,
      pageSize: 15,
      total: 1,
      totalPages: 1,
    });
  });

  it('lists brand-scoped campaigns and hides archived by default', async () => {
    const { useCampaigns } = await import('./use-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockList).toHaveBeenCalledWith({
      brandId: 'brand-1',
      includeArchived: false,
      limit: 15,
      page: 1,
    });
    expect(result.current.campaigns).toEqual([{ id: 'cmp-1', name: 'Q4' }]);
  });

  it('omits brandId at organization scope', async () => {
    mockPageScope.current = 'org';
    mockUseBrand.mockReturnValue({
      brandId: 'brand-1',
      isReady: true,
      organizationId: 'org-1',
    });

    const { useCampaigns } = await import('./use-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockList).toHaveBeenCalledWith({
      includeArchived: false,
      limit: 15,
      page: 1,
    });
  });

  it('passes an explicit status instead of the archived default', async () => {
    const { useCampaigns } = await import('./use-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    renderHook(() => useCampaigns({ status: ContentCampaignStatus.ARCHIVED }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });

    expect(mockList).toHaveBeenCalledWith({
      brandId: 'brand-1',
      limit: 15,
      page: 1,
      status: ContentCampaignStatus.ARCHIVED,
    });
  });
});
