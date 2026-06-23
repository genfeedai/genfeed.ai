// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetToken = vi.fn().mockResolvedValue('test-token');
const mockUseBrandId = vi.fn(() => 'brand-1');
const mockList = vi.fn();
const mockAgentCampaignsServiceInstance = {
  list: mockList,
};

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mockUseBrandId(),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
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
    expect(mockList).toHaveBeenCalledWith({ status: undefined });
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

    expect(mockList).toHaveBeenCalledWith({ status: 'active' });
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
    const { resolveAuthToken } = await import('@helpers/auth/clerk.helper');
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
});
