import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReplyCampaigns } from './use-reply-campaigns';

const mocks = vi.hoisted(() => ({
  brandId: 'brand-1',
  listCampaigns: vi.fn(),
  listConversations: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: { id: mocks.brandId } }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
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
      listPage: () => mocks.listCampaigns(),
      transition: mocks.transition,
    }),
  },
}));

vi.mock('@services/social/messages.service', () => ({
  SocialMessagesService: {
    getInstance: () => ({
      listPage: () => mocks.listConversations(),
    }),
  },
}));

function renderCampaigns(client = createTestQueryClient()) {
  return renderHook(() => useReplyCampaigns(), {
    wrapper: queryClientWrapper(client),
  });
}

describe('useReplyCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandId = 'brand-1';
    mocks.listCampaigns.mockResolvedValue({
      items: [{ id: 'campaign-1', status: 'draft' }],
    });
    mocks.listConversations.mockResolvedValue({
      items: [{ id: 'conversation-1', platform: 'x' }],
    });
  });

  it('is loading on the very first render, before any effect has run', () => {
    // renderHook flushes effects, so read what the hook returned on render #1:
    // that is the paint a user sees before the fetch effect starts.
    const firstRender: { campaigns: unknown[]; isLoading: boolean }[] = [];

    renderHook(
      () => {
        const state = useReplyCampaigns();
        firstRender.push({
          campaigns: state.campaigns,
          isLoading: state.isLoading,
        });
        return state;
      },
      { wrapper: queryClientWrapper(createTestQueryClient()) },
    );

    expect(firstRender[0]).toEqual({ campaigns: [], isLoading: true });
  });

  it('stops loading once the campaigns have arrived', async () => {
    const { result } = renderCampaigns();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.campaigns).toEqual([
      { id: 'campaign-1', status: 'draft' },
    ]);
    expect(result.current.enrollableConversations).toEqual([
      { id: 'conversation-1', platform: 'x' },
    ]);
  });

  it('paints the cached campaigns at once when Reply drip is reopened', async () => {
    const client = createTestQueryClient();
    const firstVisit = renderCampaigns(client);
    await waitFor(() =>
      expect(firstVisit.result.current.isLoading).toBe(false),
    );
    firstVisit.unmount();

    mocks.listCampaigns.mockReturnValue(new Promise(() => {}));
    mocks.listConversations.mockReturnValue(new Promise(() => {}));
    const { result } = renderCampaigns(client);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.campaigns).toEqual([
      { id: 'campaign-1', status: 'draft' },
    ]);
    expect(result.current.enrollableConversations).toEqual([
      { id: 'conversation-1', platform: 'x' },
    ]);
  });

  it('never shows one brand campaigns under another brand', async () => {
    const client = createTestQueryClient();
    const firstVisit = renderCampaigns(client);
    await waitFor(() =>
      expect(firstVisit.result.current.isLoading).toBe(false),
    );
    firstVisit.unmount();

    mocks.brandId = 'brand-2';
    mocks.listCampaigns.mockReturnValue(new Promise(() => {}));
    mocks.listConversations.mockReturnValue(new Promise(() => {}));
    const { result } = renderCampaigns(client);

    expect(result.current.isLoading).toBe(true);
    expect(result.current.campaigns).toEqual([]);
    expect(result.current.enrollableConversations).toEqual([]);
  });

  it('keeps the campaigns without an error when a background refresh fails', async () => {
    const client = createTestQueryClient();
    const { result } = renderCampaigns(client);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mocks.listCampaigns.mockRejectedValue(new Error('offline'));
    act(() => result.current.refresh());

    await waitFor(() =>
      expect(
        client.getQueryCache().findAll({ queryKey: ['reply-campaigns'] })[0]
          ?.state.status,
      ).toBe('error'),
    );
    expect(result.current.campaigns).toEqual([
      { id: 'campaign-1', status: 'draft' },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('shows the transitioned campaign from the server response', async () => {
    mocks.transition.mockResolvedValue({ id: 'campaign-1', status: 'paused' });
    const { result } = renderCampaigns();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.transitionCampaign('campaign-1', 'pause'));

    await waitFor(() =>
      expect(result.current.campaigns).toEqual([
        { id: 'campaign-1', status: 'paused' },
      ]),
    );
  });
});
