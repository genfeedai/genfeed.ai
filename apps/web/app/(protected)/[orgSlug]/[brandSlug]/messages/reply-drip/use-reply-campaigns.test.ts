import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReplyCampaigns } from './use-reply-campaigns';

const mocks = vi.hoisted(() => ({
  campaignsPage: { items: [{ id: 'campaign-1' }] },
  conversationsPage: { items: [{ id: 'conversation-1', platform: 'x' }] },
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: { id: 'brand-1' } }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context.helpers', () => ({
  getBrandEntityId: (brand: { id: string } | null) => brand?.id ?? '',
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const service = factory('token');
    return () => Promise.resolve(service);
  },
}));

vi.mock('@services/social/reply-campaigns.service', () => ({
  SocialReplyCampaignsService: {
    getInstance: () => ({
      listPage: () => Promise.resolve(mocks.campaignsPage),
    }),
  },
}));

vi.mock('@services/social/messages.service', () => ({
  SocialMessagesService: {
    getInstance: () => ({
      listPage: () => Promise.resolve(mocks.conversationsPage),
    }),
  },
}));

describe('useReplyCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is loading on the very first render, before any effect has run', () => {
    // renderHook flushes effects, so read what the hook returned on render #1:
    // that is the paint a user sees before the fetch effect starts.
    const firstRender: { campaigns: unknown[]; isLoading: boolean }[] = [];

    renderHook(() => {
      const state = useReplyCampaigns();
      firstRender.push({
        campaigns: state.campaigns,
        isLoading: state.isLoading,
      });
      return state;
    });

    expect(firstRender[0]).toEqual({ campaigns: [], isLoading: true });
  });

  it('stops loading once the campaigns have arrived', async () => {
    const { result } = renderHook(() => useReplyCampaigns());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.campaigns).toEqual([{ id: 'campaign-1' }]);
  });
});
