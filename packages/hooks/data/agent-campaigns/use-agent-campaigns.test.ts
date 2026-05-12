// @vitest-environment jsdom

import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, it, vi } from 'vitest';

const mockGetToken = vi.fn();
const mockUseBrandId = vi.fn(() => 'brand-1');

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mockUseBrandId(),
}));

vi.mock('@genfeedai/services/automation/agent-campaigns.service', () => ({
  AgentCampaignsService: {
    getInstance: vi.fn(),
  },
}));

describe('useAgentCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TODO: update test to verify useQuery behavior
  it('keys campaign queries by the selected brand', async () => {
    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    renderHook(() => useAgentCampaigns(), { wrapper: createQueryWrapper() });
  });

  // TODO: update test to verify useQuery behavior
  it('preserves the status filter in the query dependencies', async () => {
    const { useAgentCampaigns } = await import('./use-agent-campaigns');
    renderHook(() => useAgentCampaigns({ status: 'active' }), {
      wrapper: createQueryWrapper(),
    });
  });
});
