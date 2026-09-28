// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
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
const mockList = vi.fn();
const mockAgentCampaignsServiceInstance = {
  list: mockList,
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

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn().mockResolvedValue('test-token'),
}));

vi.mock('@genfeedai/services/automation/agent-campaigns.service', () => ({
  AgentCampaignsService: {
    getInstance: vi.fn(() => mockAgentCampaignsServiceInstance),
  },
}));

describe('useAgentCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
    mockGetToken.mockResolvedValue('test-token');
    mockUseAuthIdentity.mockReturnValue({ getToken: mockGetToken });
    mockPageScope.current = 'brand';
    mockUseBrand.mockReturnValue({
      brandId: 'brand-1',
      isReady: true,
      organizationId: 'org-1',
    });
  });

  it('keys campaign queries by the selected brand and calls service', async () => {
    const { AgentCampaignsService } = await import(
      '@genfeedai/services/automation/agent-campaigns.service'
    );
    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useAgentCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(AgentCampaignsService.getInstance).toHaveBeenCalledWith(
      'test-token',
    );
    expect(mockList).toHaveBeenCalledWith({
      brandId: 'brand-1',
      status: undefined,
    });
    expect(result.current.campaigns).toEqual([]);
  });

  it('preserves the status filter in service call', async () => {
    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(
      () => useAgentCampaigns({ status: 'active' }),
      {
        wrapper: createQueryWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockList).toHaveBeenCalledWith({
      brandId: 'brand-1',
      status: 'active',
    });
  });

  it('returns campaigns data from service', async () => {
    const mockCampaigns = [
      { brandId: 'brand-1', id: 'campaign-1', name: 'Campaign 1' },
    ];
    mockList.mockResolvedValue(mockCampaigns);

    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useAgentCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.campaigns).toEqual(mockCampaigns);
    });
  });

  it('returns empty array when token is unavailable', async () => {
    const { resolveAuthToken } = await import('@helpers/auth/auth.helper');
    vi.mocked(resolveAuthToken).mockResolvedValueOnce(null);

    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useAgentCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.campaigns).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('exposes a rejected list request as an error, not as an empty list', async () => {
    mockList.mockRejectedValueOnce(new Error('Network down'));

    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useAgentCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    expect(result.current.error?.message).toBe('Network down');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.campaigns).toEqual([]);
  });

  it('clears the error when refresh succeeds', async () => {
    const mockCampaigns = [
      { brandId: 'brand-1', id: 'campaign-1', name: 'Campaign 1' },
    ];
    mockList
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(mockCampaigns);

    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useAgentCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
    expect(result.current.campaigns).toEqual(mockCampaigns);
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('reports no error for a successful empty list', async () => {
    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useAgentCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.campaigns).toEqual([]);
  });

  it('provides refresh function', async () => {
    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useAgentCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refresh).toBe('function');
  });

  it('does not expose organization-wide Programs before brand resolution', async () => {
    mockUseBrand.mockReturnValue({
      brandId: '',
      isReady: false,
      organizationId: '',
    });

    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useAgentCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.campaigns).toEqual([]);
    expect(mockList).not.toHaveBeenCalled();
    await result.current.refresh();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('lists organization-wide Programs on org routes without a brand filter', async () => {
    mockPageScope.current = 'org';
    mockUseBrand.mockReturnValue({
      brandId: 'brand-last-used',
      isReady: true,
      organizationId: 'org-1',
    });

    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useAgentCampaigns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockList).toHaveBeenCalledWith({
      status: undefined,
    });
  });
});
