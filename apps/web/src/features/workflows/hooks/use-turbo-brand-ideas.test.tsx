import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTurboBrandIdeas } from './use-turbo-brand-ideas';

const mocks = vi.hoisted(() => ({ propose: vi.fn() }));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: async () => 'token',
    orgId: 'org-a',
    sessionId: 'session-a',
    userId: 'user-a',
  }),
}));
vi.mock('@services/content/studio-proposals.service', () => ({
  StudioProposalsService: {
    getInstance: () => ({ propose: mocks.propose }),
  },
}));

const idea = {
  angle: 'An angle written from the brand kit.',
  count: 6,
  formats: ['image', 'video'],
  title: 'One',
  why: 'It builds on your best performing posts.',
};

let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useTurboBrandIdeas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient();
  });

  it('answers with no ideas at once while the agent is still writing them', async () => {
    mocks.propose.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useTurboBrandIdeas('brand-1'), {
      wrapper: Wrapper,
    });

    expect(result.current).toEqual({ isBrandApproved: true, proposals: [] });
    await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(1));
    expect(result.current.proposals).toEqual([]);
  });

  it('shows the ideas when they arrive, and returns to them without asking the agent again', async () => {
    mocks.propose.mockResolvedValue({
      isBrandApproved: true,
      proposals: [idea],
      surface: 'turbo',
    });
    const first = renderHook(() => useTurboBrandIdeas('brand-1'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(first.result.current.proposals).toEqual([idea]));
    first.unmount();

    const back = renderHook(() => useTurboBrandIdeas('brand-1'), {
      wrapper: Wrapper,
    });

    expect(back.result.current.proposals).toEqual([idea]);
    expect(mocks.propose).toHaveBeenCalledTimes(1);
  });

  it('asks again on the next visit when the brand kit is not approved', async () => {
    mocks.propose.mockResolvedValue({
      isBrandApproved: false,
      proposals: [],
      surface: 'turbo',
    });
    const first = renderHook(() => useTurboBrandIdeas('brand-1'), {
      wrapper: Wrapper,
    });
    await waitFor(() =>
      expect(first.result.current.isBrandApproved).toBe(false),
    );
    first.unmount();

    renderHook(() => useTurboBrandIdeas('brand-1'), { wrapper: Wrapper });

    await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(2));
  });

  it('keeps the brand-neutral starters when the agent fails', async () => {
    mocks.propose.mockRejectedValue(new Error('timeout'));
    const { result } = renderHook(() => useTurboBrandIdeas('brand-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(mocks.propose).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual({ isBrandApproved: true, proposals: [] });
  });

  it('reads nothing without a brand', () => {
    renderHook(() => useTurboBrandIdeas(undefined), { wrapper: Wrapper });

    expect(mocks.propose).not.toHaveBeenCalled();
  });
});
