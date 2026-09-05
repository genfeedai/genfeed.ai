// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockGetPerformance = vi.fn();
const mockPageScope = vi.hoisted(() => ({
  current: 'brand' as 'org' | 'brand',
}));
const mockUseBrand = vi.fn(() => ({
  brandId: 'brand-1',
  isReady: true,
  organizationId: 'org-1',
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
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
    getInstance: vi.fn(() => ({ getPerformance: mockGetPerformance })),
  },
}));

describe('useCampaignPerformance', () => {
  it('exposes failed requests and lets the user retry successfully', async () => {
    mockGetPerformance.mockRejectedValueOnce(new Error('Service unavailable'));
    const { useCampaignPerformance } = await import(
      './use-campaign-performance'
    );
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');
    const { result } = renderHook(() => useCampaignPerformance('cmp-1'), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() =>
      expect(result.current.error?.message).toBe('Service unavailable'),
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.performance).toBeNull();
    const performance = { byPlatform: [], postCounts: {}, organic: {} };
    mockGetPerformance.mockResolvedValueOnce(performance);
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() =>
      expect(result.current.performance).toEqual(performance),
    );
    expect(result.current.error).toBeNull();
  });
});
