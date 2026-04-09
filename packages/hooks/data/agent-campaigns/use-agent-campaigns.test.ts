// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetToken = vi.fn();
const mockUseBrandId = vi.fn(() => 'brand-1');
const mockUseResource = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mockUseBrandId(),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

vi.mock('@genfeedai/services/automation/agent-campaigns.service', () => ({
  AgentCampaignsService: {
    getInstance: vi.fn(),
  },
}));

describe('useAgentCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseResource.mockReturnValue({
      data: [],
      isLoading: false,
      refresh: vi.fn(),
    });
  });

  it('keys campaign queries by the selected brand', async () => {
    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    renderHook(() => useAgentCampaigns());

    expect(mockUseResource).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        defaultValue: [],
        dependencies: ['brand-1', undefined],
      }),
    );
  });

  it('preserves the status filter in the query dependencies', async () => {
    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    renderHook(() => useAgentCampaigns({ status: 'active' }));

    expect(mockUseResource).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        dependencies: ['brand-1', 'active'],
      }),
    );
  });
});
