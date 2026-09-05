// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryClientWrapperProps = { children: ReactNode };

const mockGetById = vi.fn();
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
    getInstance: vi.fn(() => ({ getById: mockGetById })),
  },
}));

describe('useCampaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPageScope.current = 'brand';
    mockUseBrand.mockReturnValue({
      brandId: 'brand-1',
      isReady: true,
      organizationId: 'org-1',
    });
    mockGetById.mockResolvedValue({
      brandId: 'brand-1',
      id: 'cmp-1',
      name: 'Q4',
    });
  });

  it('loads a campaign in the current brand', async () => {
    const { useCampaign } = await import('./use-campaign');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useCampaign('cmp-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.campaign?.id).toBe('cmp-1');
    });
    expect(result.current.isUnavailable).toBe(false);
  });

  it('refreshes the scoped detail when a campaign mutation invalidates its id', async () => {
    const { useCampaign } = await import('./use-campaign');
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    const { result, unmount } = renderHook(() => useCampaign('cmp-1'), {
      wrapper: ({ children }: QueryClientWrapperProps) =>
        createElement(QueryClientProvider, { client }, children),
    });
    await waitFor(() => expect(result.current.campaign?.name).toBe('Q4'));
    mockGetById.mockResolvedValue({
      brandId: 'brand-1',
      id: 'cmp-1',
      name: 'Updated',
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: ['publish-campaign', 'cmp-1'],
      });
    });
    await waitFor(() => expect(result.current.campaign?.name).toBe('Updated'));
    unmount();
    client.clear();
  });

  it('treats a cross-brand campaign as unavailable without leaking it', async () => {
    mockGetById.mockResolvedValue({
      brandId: 'brand-other',
      id: 'cmp-1',
      name: 'Secret',
    });

    const { useCampaign } = await import('./use-campaign');
    const { createQueryWrapper } = await import('@hooks/tests/query-wrapper');

    const { result } = renderHook(() => useCampaign('cmp-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isUnavailable).toBe(true);
    });
    expect(result.current.campaign).toBeNull();
  });
});
