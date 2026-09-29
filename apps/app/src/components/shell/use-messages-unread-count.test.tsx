import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  service: { unreadCount: vi.fn() },
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ userId: 'alice', isSignedIn: true }),
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ organizationId: 'org-1', isReady: true }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => mock.service,
}));

import {
  useMessagesUnreadCount,
  useRefreshInboxIndicators,
} from './use-messages-unread-count';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock.service.unreadCount.mockResolvedValue({ id: 'brand-1', unreadCount: 4 });
});
afterEach(() => client.clear());

describe('useMessagesUnreadCount', () => {
  it('counts every brand when no brand is in scope', async () => {
    mock.service.unreadCount.mockResolvedValue({ id: 'org-1', unreadCount: 0 });
    const { result } = renderHook(() => useMessagesUnreadCount(), { wrapper });

    await waitFor(() =>
      expect(mock.service.unreadCount).toHaveBeenCalledWith(
        { allBrands: true },
        expect.any(AbortSignal),
      ),
    );
    expect(result.current).toBe(0);
  });

  it('fetches once the brand scope resolves', async () => {
    const { result, rerender } = renderHook(
      ({ isResolved }: { isResolved: boolean }) =>
        useMessagesUnreadCount('brand-1', isResolved),
      { initialProps: { isResolved: false }, wrapper },
    );
    expect(mock.service.unreadCount).not.toHaveBeenCalled();

    rerender({ isResolved: true });

    await waitFor(() => expect(result.current).toBe(4));
    expect(mock.service.unreadCount).toHaveBeenCalledWith(
      { brandId: 'brand-1' },
      expect.any(AbortSignal),
    );
  });

  it('refetches after the inbox indicators are refreshed', async () => {
    const { result } = renderHook(
      () => ({
        count: useMessagesUnreadCount('brand-1'),
        refresh: useRefreshInboxIndicators(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.count).toBe(4));
    mock.service.unreadCount.mockResolvedValue({
      id: 'brand-1',
      unreadCount: 1,
    });

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.count).toBe(1));
  });
});
